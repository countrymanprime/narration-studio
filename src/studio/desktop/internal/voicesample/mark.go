package voicesample

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"desktop/internal/editlog"
	"desktop/internal/tracks"
	"desktop/internal/zerocross"
)

// tolerance is how far a range may stand outside the item's played range before it counts as outside: the project file and the
// page both round seconds to milliseconds.
const tolerance = 0.001

// maxRecordID bounds the alignment record id a request carries (a ledger record id is at most 64 characters).
const maxRecordID = 64

// checked is a request that passed the checks that need no file: trimmed text, finite times and parsed keys.
type checked struct {
	MarkRequest
	label, note string
}

func (r MarkRequest) check() (checked, error) {
	for name, value := range map[string]string{"chapter": r.ChapterID, "item": r.ItemGUID, "take": r.TakeGUID} {
		if strings.TrimSpace(value) == "" || len(value) > maxGUID || !utf8.ValidString(value) {
			return checked{}, fmt.Errorf("%w: a sample needs its %s", ErrInvalid, name)
		}
	}
	character, err := cleanCharacter(r.CharacterID)
	if err != nil {
		return checked{}, err
	}
	r.CharacterID = character
	if len(r.AlignmentRecordID) > maxRecordID {
		return checked{}, fmt.Errorf("%w: that is not a recording check record", ErrInvalid)
	}
	if !finite(r.SourceStart) || !finite(r.SourceEnd) || r.SourceStart < 0 || r.SourceEnd <= r.SourceStart || r.SourceEnd > maxSourceTime {
		return checked{}, fmt.Errorf("%w: a sample's range is seconds into the recording, ending after it starts", ErrInvalid)
	}
	if len(r.StartKey) > maxKey || len(r.EndKey) > maxKey {
		return checked{}, fmt.Errorf("%w: that is not a word of the script", ErrInvalid)
	}
	label, note, err := cleanText(r.Label, r.Note)
	if err != nil {
		return checked{}, err
	}
	return checked{MarkRequest: r, label: label, note: note}, nil
}

// manuscript reads the current manuscript; one that cannot be read is an empty one.
func (s *Service) manuscript() Book {
	if s.config.Manuscript == nil {
		return Book{}
	}
	book, err := s.config.Manuscript()
	if err != nil {
		return Book{}
	}
	return book
}

// savedProject reads the narrator's chosen, saved REAPER project; any failure to find or read it is project_unreadable.
func (s *Service) savedProject() (tracks.Project, error) {
	if s.config.ProjectFile == nil {
		return tracks.Project{}, refuse(ReasonProjectUnreadable)
	}
	path, err := s.config.ProjectFile()
	if err != nil || path == "" {
		return tracks.Project{}, refuse(ReasonProjectUnreadable)
	}
	var project tracks.Project
	if s.config.ProjectReader != nil {
		project, err = s.config.ProjectReader.ReadProject(path)
	} else {
		project, err = tracks.Parse(path)
	}
	if err != nil {
		return tracks.Project{}, refuse(ReasonProjectUnreadable)
	}
	return project, nil
}

// window is the stretch of a source file a clip is cut from, in frames of that file.
type window struct {
	first, count int64
}

// Mark copies the stretch the request names into a clip and stores it. A request the host refuses (a *Refusal) changes nothing; an
// invalid one is ErrInvalid; any other error is a failure to read or write.
//
// The checks run in this order, each cheaper than the next: the request's own fields, the words against the manuscript, the
// recording check's record and where the words were heard, the saved project's item and take, the played range and the cuts, the
// source file and its format, the window's length after snapping, the limits.
func (s *Service) Mark(ctx context.Context, request MarkRequest) (Sample, error) {
	req, err := request.check()
	if err != nil {
		return Sample{}, err
	}
	if s.config.Project == "" {
		return Sample{}, errors.New("save the project first")
	}
	storage := s.storage()
	if storage != StorageProject && s.config.Regions == nil {
		return Sample{}, refuse(ReasonDawUnavailable)
	}
	book := s.manuscript()
	text, err := editlog.SpanText(book.editlog(), req.ChapterID, req.StartKey, req.EndKey)
	switch {
	case errors.Is(err, editlog.ErrSpanKey), errors.Is(err, editlog.ErrSpanOrder):
		return Sample{}, fmt.Errorf("%w: %v", ErrInvalid, err)
	case errors.Is(err, editlog.ErrSpanTooLong):
		return Sample{}, refuse(ReasonTooLong)
	case err != nil:
		// The words are not where the page says: the manuscript changed after the chapter was checked.
		return Sample{}, refuse(ReasonStaleAlignment)
	}
	if err := s.checkHeard(req); err != nil {
		return Sample{}, err
	}
	project, err := s.savedProject()
	if err != nil {
		return Sample{}, err
	}
	_, item, ok := project.ItemByGUID(req.ItemGUID)
	if !ok {
		return Sample{}, refuse(ReasonStaleAlignment)
	}
	take, ok := takeOf(item, req.TakeGUID)
	if !ok {
		return Sample{}, refuse(ReasonStaleAlignment)
	}
	playedStart := take.SourceStart()
	playedEnd := playedStart + item.Length*take.Rate()
	if req.SourceStart < playedStart-tolerance || req.SourceEnd > playedEnd+tolerance {
		return Sample{}, refuse(ReasonSpansTakes)
	}
	lower, upper, err := s.boundedByCuts(req, math.Max(playedStart, 0), playedEnd)
	if err != nil {
		return Sample{}, err
	}

	sourceFile, source, file, err := openSource(take)
	if err != nil {
		return Sample{}, err
	}
	defer func() { _ = file.Close() }()
	rate := float64(source.Format.SampleRate)
	fileSeconds := float64(source.Frames) / rate
	if req.SourceEnd > fileSeconds+tolerance {
		// The file is shorter than the recording the check heard: it is not the file that was checked.
		return Sample{}, refuse(ReasonStaleAlignment)
	}
	upper = math.Min(upper, fileSeconds)
	win, err := s.cutWindow(ctx, sourceFile, source, req, lower, upper)
	if err != nil {
		return Sample{}, err
	}

	stored := Stored{
		CharacterID: req.CharacterID, Label: req.label, Note: req.note,
		Source: StoredSource{
			ChapterID: req.ChapterID, StartKey: req.StartKey, EndKey: req.EndKey, Text: text, ItemGUID: req.ItemGUID, TakeGUID: req.TakeGUID,
			SourceFile: sourceFile, SourceStart: float64(win.first) / rate, SourceEnd: float64(win.first+win.count) / rate,
		},
	}
	expected := source.ClipBytes(win.count)

	// A sample kept in the DAW asks the DAW for a region, and the DAW cannot tell two presses apart (each has its own id, so its own
	// region name): the store lock is held from here, so a double press asks the DAW once and the second press finds the first's row.
	var release func()
	defer func() {
		if release != nil {
			release()
		}
	}()
	if storage != StorageProject {
		release = lockFile(storePath(s.config.Project))
	}

	// Cheap early answers from a read of the file; the same checks run again under the lock, once the clip is written.
	current, err := s.readStore()
	if err != nil {
		return Sample{}, err
	}
	if existing, ok := sameStretch(current.Samples, stored); ok {
		if covers(existing, storage) {
			return s.view(existing, book), nil
		}
		// The stretch has a sample that keeps less than is asked: it is brought up to it, under the lock, from a fresh read.
		if release == nil {
			release = lockFile(storePath(s.config.Project))
		}
		current, err = s.readStore()
		if err != nil {
			return Sample{}, err
		}
		if existing, ok = sameStretch(current.Samples, stored); ok {
			return s.upgradeLocked(ctx, current, existing, storage, req, item, take, source, file, win, rate, book)
		}
	}
	// A sample kept only in the DAW has no file, so it adds nothing to the project's clip bytes.
	limitBytes := expected
	if storage == StorageDAW {
		limitBytes = 0
	}
	if err := checkLimits(current.Samples, req.CharacterID, limitBytes); err != nil {
		return Sample{}, err
	}

	id := s.newID()
	clipPath, ok := ClipPath(s.config.Project, id)
	if !ok {
		return Sample{}, fmt.Errorf("could not make a voice sample id")
	}
	var clip StoredClip
	if storage == StorageDAW {
		clip = StoredClip{
			Bytes: expected, DurationMs: int(math.Round(float64(win.count) * 1000 / rate)), SampleRate: source.Format.SampleRate,
			Channels: source.Format.Channels, BitsPerSample: source.Format.BitsPerSample,
		}
	} else if clip, err = s.writeClip(clipPath, source, file, win, rate); err != nil {
		return Sample{}, err
	}
	stored.ID, stored.CreatedAt, stored.Clip = id, s.now().UTC(), clip
	if storage != StorageProject {
		// The region goes in before the row, so a refusal by the DAW leaves nothing but a clip to remove.
		region, err := s.addRegion(ctx, id, req, item, take, stored.Source.SourceStart, stored.Source.SourceEnd)
		if err != nil {
			_ = os.Remove(clipPath)
			return Sample{}, err
		}
		stored.Storage, stored.DawRegion = storage, region
	}

	// A mark that cannot be kept puts the project back: the clip goes, and the region the DAW was asked for is taken back. The store's lock
	// is let go first (the DAW may take its whole timeout to answer, and every other writer waits for the lock), and the request's own
	// cancellation does not reach the delete (a cancelled request is a likely reason the mark failed).
	giveUp := func() {
		_ = os.Remove(clipPath)
		if release != nil {
			release()
			release = nil
		}
		s.takeRegionBack(ctx, stored.DawRegion)
	}
	if release == nil {
		release = lockFile(storePath(s.config.Project))
	}
	current, err = s.readStore()
	if err == nil {
		if existing, ok := sameStretch(current.Samples, stored); ok {
			if covers(existing, storage) {
				giveUp()
				return s.view(existing, book), nil
			}
			// A mark that keeps a region holds the store's lock from the start, so only a project mark (with no region of its own to take
			// back) gets here: the stretch's sample was replaced while it waited for the lock, and it is brought up to what is asked.
			_ = os.Remove(clipPath)
			return s.upgradeLocked(ctx, current, existing, storage, req, item, take, source, file, win, rate, book)
		}
		err = checkLimits(current.Samples, req.CharacterID, limitBytes)
	}
	if err != nil {
		giveUp()
		return Sample{}, err
	}
	// The first sample of a character is its primary; a later one is only when the narrator asked.
	stored.Primary = req.MakePrimary || countFor(current.Samples, req.CharacterID) == 0
	if stored.Primary {
		for index := range current.Samples {
			if current.Samples[index].CharacterID == req.CharacterID {
				current.Samples[index].Primary = false
			}
		}
	}
	current.Samples = append(current.Samples, stored)
	if err := s.writeStore(current); err != nil {
		giveUp()
		return Sample{}, err
	}
	return s.view(stored, book), nil
}

// checkHeard compares the page's record and item with what the chapter's current recording check heard for the two words.
func (s *Service) checkHeard(req checked) error {
	if s.config.Alignment == nil {
		return refuse(ReasonStaleAlignment)
	}
	heard, err := s.config.Alignment.Heard(req.ChapterID, req.StartKey, req.EndKey)
	if err != nil {
		return fmt.Errorf("could not read the chapter's recording check: %w", err)
	}
	switch {
	case heard.RecordID == "" || heard.RecordID != req.AlignmentRecordID:
		return refuse(ReasonStaleAlignment)
	case heard.First == nil || heard.Last == nil:
		return refuse(ReasonNotHeard)
	case *heard.First != *heard.Last:
		return refuse(ReasonSpansTakes)
	case heard.First.ItemGUID != req.ItemGUID || heard.First.TakeGUID != req.TakeGUID:
		return refuse(ReasonStaleAlignment)
	}
	return nil
}

func takeOf(item tracks.Item, guid string) (tracks.Take, bool) {
	for _, take := range item.Takes {
		if take.GUID == guid {
			return take, true
		}
	}
	return tracks.Take{}, false
}

// boundedByCuts refuses a range that overlaps audio the narrator cut, and narrows the played range [lower, upper] so the handles
// never reach into a cut: a cough cut out beside the words must not come back in a sample's handle.
func (s *Service) boundedByCuts(req checked, lower, upper float64) (float64, float64, error) {
	if s.config.Cuts == nil {
		return lower, upper, nil
	}
	hidden, err := s.config.Cuts.Hidden(req.ChapterID)
	if err != nil {
		return 0, 0, fmt.Errorf("could not read the chapter's cuts: %w", err)
	}
	for _, cut := range hidden {
		if cut.ItemGUID != req.ItemGUID {
			continue
		}
		if req.SourceStart < cut.End && cut.Start < req.SourceEnd {
			return 0, 0, refuse(ReasonSpansCut)
		}
		if cut.End <= req.SourceStart+tolerance {
			lower = math.Max(lower, cut.End)
		}
		if cut.Start >= req.SourceEnd-tolerance {
			upper = math.Min(upper, cut.Start)
		}
	}
	return lower, upper, nil
}

// openSource opens the take's audio file and locates its frames. The path comes from the saved project, never from the page.
func openSource(take tracks.Take) (string, zerocross.Source, *os.File, error) {
	path := take.SourceFile
	if path == "" {
		return "", zerocross.Source{}, nil, refuse(ReasonSourceMissing)
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return "", zerocross.Source{}, nil, refuse(ReasonSourceMissing)
	}
	file, err := os.Open(path)
	if err != nil {
		return "", zerocross.Source{}, nil, refuse(ReasonSourceMissing)
	}
	source, err := zerocross.OpenSource(file)
	if err != nil {
		_ = file.Close()
		if errors.Is(err, zerocross.ErrUnsupported) {
			return "", zerocross.Source{}, nil, refuse(ReasonUnsupportedSource)
		}
		return "", zerocross.Source{}, nil, fmt.Errorf("could not read the recording: %w", err)
	}
	return path, source, file, nil
}

// cutWindow turns the request into the frames to copy: the range plus a handle each side, kept inside [lower, upper] seconds,
// both ends snapped to the nearest zero crossing and kept inside the bounds again. A clip outside 0.5 to 30 seconds is refused.
func (s *Service) cutWindow(ctx context.Context, path string, source zerocross.Source, req checked, lower, upper float64) (window, error) {
	rate := float64(source.Format.SampleRate)
	maxFrames := int64(math.Floor(MaxSeconds*rate + 1e-6))
	minFrames := int64(math.Ceil(MinSeconds*rate - 1e-6))
	start := math.Max(req.SourceStart-HandleSeconds, lower)
	end := math.Min(req.SourceEnd+HandleSeconds, upper)
	if end <= start {
		return window{}, refuse(ReasonTooShort)
	}
	if int64(math.Round((end-start)*rate)) > 2*maxFrames {
		return window{}, refuse(ReasonTooLong)
	}
	snapped := func(at float64) (float64, error) {
		result, err := zerocross.Snap(ctx, zerocross.FileDecoder{}, path, at)
		if err != nil {
			return 0, fmt.Errorf("could not find a zero crossing in the recording: %w", err)
		}
		return math.Min(math.Max(result.Time, lower), upper), nil
	}
	snappedStart, err := snapped(start)
	if err != nil {
		return window{}, err
	}
	snappedEnd, err := snapped(end)
	if err != nil {
		return window{}, err
	}
	first := int64(math.Round(snappedStart * rate))
	last := min(int64(math.Round(snappedEnd*rate)), source.Frames)
	count := last - first
	switch {
	case first < 0 || count < minFrames:
		return window{}, refuse(ReasonTooShort)
	case count > maxFrames:
		return window{}, refuse(ReasonTooLong)
	}
	return window{first: first, count: count}, nil
}

// covers says whether a stored sample already keeps what the storage asks for: the clip in the project folder for project and both,
// the region in the DAW for daw and both. A sample stored as project has no storage value.
func covers(have Stored, want string) bool {
	hasClip := have.Storage != StorageDAW
	hasRegion := have.Storage == StorageDAW || have.Storage == StorageBoth
	return (want == StorageDAW || hasClip) && (want == StorageProject || hasRegion)
}

// upgradeLocked brings a sample already stored for the stretch up to the storage now asked for, with the store lock held and current
// read under it. It only adds, never takes away: the clip a sample lacks, or the region it lacks, so a repeat press with another
// storage is not ignored and an earlier choice is never undone. The window is the sample's own (a stretch is the same frames), so
// the clip is cut from the same audio. The clip goes first, since it can be taken back, and a refusal by the DAW leaves the sample as
// it was.
func (s *Service) upgradeLocked(ctx context.Context, current storeFile, existing Stored, storage string, req checked, item tracks.Item, take tracks.Take,
	source zerocross.Source, file io.ReadSeeker, win window, rate float64, book Book) (Sample, error) {
	index := indexOf(current.Samples, existing.ID)
	if index < 0 {
		return Sample{}, errors.New("the voice sample is gone")
	}
	upgraded := current.Samples[index]
	wantClip := storage != StorageDAW && upgraded.Storage == StorageDAW
	wantRegion := storage != StorageProject && (upgraded.Storage == "" || upgraded.Storage == StorageProject)
	if !wantClip && !wantRegion {
		// The sample that is there now (the stretch may have been replaced while this waited for the lock) already keeps what is asked.
		return s.view(upgraded, book), nil
	}
	var clipPath string
	if wantClip {
		expected := source.ClipBytes(win.count)
		if totalBytes(current.Samples)+expected > MaxProjectBytes {
			return Sample{}, refuse(ReasonProjectLimit)
		}
		path, ok := ClipPath(s.config.Project, upgraded.ID)
		if !ok {
			return Sample{}, fmt.Errorf("could not make a voice sample id")
		}
		clip, err := s.writeClip(path, source, file, win, rate)
		if err != nil {
			return Sample{}, err
		}
		clipPath, upgraded.Clip = path, clip
	}
	if wantRegion {
		if s.config.Regions == nil {
			return Sample{}, refuse(ReasonDawUnavailable)
		}
		named := req
		named.CharacterID, named.label = upgraded.CharacterID, upgraded.Label
		region, err := s.addRegion(ctx, upgraded.ID, named, item, take, upgraded.Source.SourceStart, upgraded.Source.SourceEnd)
		if err != nil {
			if clipPath != "" {
				_ = os.Remove(clipPath)
			}
			return Sample{}, err
		}
		upgraded.DawRegion = region
	}
	// A project sample only ever gains a region and a DAW sample only a clip, so what an upgrade makes is always both.
	upgraded.Storage = StorageBoth
	current.Samples[index] = upgraded
	if err := s.writeStore(current); err != nil {
		if clipPath != "" {
			_ = os.Remove(clipPath)
		}
		return Sample{}, err
	}
	return s.view(upgraded, book), nil
}

// sameStretch finds a sample of the same character cut from the same frames of the same take: a repeated mark (a double press)
// is that sample, not a second one.
func sameStretch(samples []Stored, candidate Stored) (Stored, bool) {
	for _, sample := range samples {
		if sample.CharacterID == candidate.CharacterID && sample.Source.ItemGUID == candidate.Source.ItemGUID &&
			sample.Source.TakeGUID == candidate.Source.TakeGUID &&
			math.Abs(sample.Source.SourceStart-candidate.Source.SourceStart) < 1e-9 && math.Abs(sample.Source.SourceEnd-candidate.Source.SourceEnd) < 1e-9 {
			return sample, true
		}
	}
	return Stored{}, false
}

// checkLimits refuses a sample that would give a character more than 20 samples or the project more than 200 MiB of clips.
func checkLimits(samples []Stored, characterID string, clipBytes int64) error {
	if countFor(samples, characterID) >= MaxPerCharacter {
		return refuse(ReasonCharacterLimit)
	}
	if totalBytes(samples)+clipBytes > MaxProjectBytes {
		return refuse(ReasonProjectLimit)
	}
	return nil
}

// writeClip copies the window into the clip's file through a temporary file and a rename, hashing what it writes. On any failure
// no file is left behind.
func (s *Service) writeClip(path string, source zerocross.Source, in io.ReadSeeker, win window, rate float64) (StoredClip, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return StoredClip{}, fmt.Errorf("could not create the project's voice samples folder: %w", err)
	}
	temporary := path + ".tmp"
	// The store lock is held, so a temporary file here is one an earlier crash left: it must not block this sample for good.
	_ = os.Remove(temporary)
	out, err := os.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return StoredClip{}, fmt.Errorf("could not write the voice sample's audio: %w", err)
	}
	fail := func(err error) (StoredClip, error) {
		_ = out.Close()
		_ = os.Remove(temporary)
		return StoredClip{}, fmt.Errorf("could not write the voice sample's audio: %w", err)
	}
	hash := sha256.New()
	if err := source.Copy(io.MultiWriter(out, hash), in, win.first, win.count); err != nil {
		return fail(err)
	}
	if err := out.Sync(); err != nil {
		return fail(err)
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(temporary)
		return StoredClip{}, fmt.Errorf("could not write the voice sample's audio: %w", err)
	}
	if err := s.renameFile(temporary, path); err != nil {
		_ = os.Remove(temporary)
		return StoredClip{}, fmt.Errorf("could not activate the voice sample's audio: %w", err)
	}
	return StoredClip{
		Bytes: source.ClipBytes(win.count), DurationMs: int(math.Round(float64(win.count) * 1000 / rate)), SampleRate: source.Format.SampleRate,
		Channels: source.Format.Channels, BitsPerSample: source.Format.BitsPerSample, SHA256: hex.EncodeToString(hash.Sum(nil)),
	}, nil
}
