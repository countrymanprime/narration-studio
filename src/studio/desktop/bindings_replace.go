package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/coverage"
	"desktop/internal/dawport"
	"desktop/internal/editlog"
	"desktop/internal/evidence"
	"desktop/internal/measure"
	"desktop/internal/passagetakes"
	"desktop/internal/settings"
)

// Replace audio (#2251, docs/research/replace-audio.md): the project's other narrators, their files brought into the DAW as tracks of
// their own, the plan for one replacement (the words, their stretch, the loudness and the change in length), the edit itself, and Put my
// audio back. The page sends chapter ids, token indices, a narrator's or file's id and seconds into their file, never a GUID or a path:
// the one path is the file the narrator picks in this app's own dialog (threat model row 6t).

const (
	// replaceTimeout bounds one call that reaches the DAW or measures a stretch of their file (an MP3 is decoded first).
	replaceTimeout = 60 * time.Second
	// maxTheirFileBytes is the largest file of theirs the app takes in: a whole chapter of 48 kHz 24-bit stereo WAV is under 1 GiB.
	maxTheirFileBytes = 4 << 30
	// maxReplaceSeconds is the longest stretch, of theirs or of the narrator's words, one replacement takes.
	maxReplaceSeconds = 300
	// minReplaceSeconds is the shortest: the waveform range's minimum.
	minReplaceSeconds = 0.05
	// defaultReplaceTargetLUFS is Editing.replace_target_lufs' default.
	defaultReplaceTargetLUFS = -20
)

// replaceExtensions are the files the app takes in, as import_audio_track does.
var replaceExtensions = map[string]bool{".wav": true, ".flac": true, ".mp3": true, ".ogg": true, ".aif": true, ".aiff": true}

const (
	replaceNoNarratorSentence   = "That narrator is not on this project's list. Add them first."
	replaceNoFileSentence       = "That file of theirs is not in this project. Add it first."
	replaceFileMissingSentence  = "Their file %s is no longer where it was. Put it back, or add it again from where it is now."
	replaceFileChangedSentence  = "Their file %s changed since it was added. Add it again."
	replaceStretchSentence      = "Choose a stretch of their audio inside their file, from 0.05 to 300 seconds long."
	replaceWordsTooLongSentence = "Choose words that last at most 300 seconds."
	replaceAlreadySentence      = "Some of these words are already replaced. Put your audio back first."
	replaceBadFadeSentence      = "The fade must be a whole number of milliseconds from 0 to 500."
	replaceBadGainSentence      = "The level change must be from -24 to 24 dB."
	replaceNetworkSentence      = "%s is on a network drive. Copy it to this computer first, then add it."
	replaceNotAudioSentence     = "%s is not a WAV, FLAC, MP3, OGG or AIFF file."
	replaceTooBigSentence       = "%s is %s. Files up to 4 GB can be added."
	replaceSameFileSentence     = "%s is already in the project as %s's audio."
	replaceTheirItemSentence    = "Their audio is no longer on its track in %s as the app added it, so nothing changed. Add their file again."
	replaceNoRecordSentence     = "That replacement is not in this chapter any more, so nothing changed."
)

// ReplaceFileAnswer is what ReplaceAddFile answers: the DAW's answer, the new file's id (empty on a refusal or a cancel) and the list.
type ReplaceFileAnswer struct {
	Result    dawport.Result    `json:"result"`
	FileID    string            `json:"fileId"`
	Narrators editlog.Narrators `json:"narrators"`
}

// ReplacePlanView is what ReplacePlan answers: the words and their project seconds, their stretch, how far the audio after the words
// will move, and the loudness: what their stretch measures, the project's target and the level change that gets it there (held to
// the ±24 dB the DAW takes; Clamped says when it was). MeasuredLUFS is null when it could not be measured, and LoudnessNote says why.
// A refusal is Result's, with nothing else set.
type ReplacePlanView struct {
	Result       dawport.Result `json:"result"`
	Narrator     string         `json:"narrator"`
	Words        int            `json:"words"`
	Start        float64        `json:"start"`
	End          float64        `json:"end"`
	SourceStart  float64        `json:"sourceStart"`
	SourceEnd    float64        `json:"sourceEnd"`
	Shift        float64        `json:"shift"`
	MeasuredLUFS *float64       `json:"measuredLufs"`
	TargetLUFS   float64        `json:"targetLufs"`
	GainDB       float64        `json:"gainDb"`
	Clamped      bool           `json:"clamped"`
	LoudnessNote string         `json:"loudnessNote"`
}

// ReplaceAnswer is what DawReplaceRange and DawRestoreReplacement answer: the DAW's answer, the replacement's id, and the chapter's
// replacements after the call.
type ReplaceAnswer struct {
	Result        dawport.Result       `json:"result"`
	ReplacementID string               `json:"replacementId"`
	Replacements  editlog.Replacements `json:"replacements"`
}

// ReplaceFilePeaksView is ReplaceFilePeaks' answer: their file's waveform, or why it has none (a file that is not a WAV, or gone).
type ReplaceFilePeaksView struct {
	FileID string         `json:"fileId"`
	Length float64        `json:"length"`
	Peaks  *measure.Peaks `json:"peaks,omitempty"`
	Reason string         `json:"reason,omitempty"`
}

// replaceDeps is what the replace bindings need from the host, so the tests give their own.
type replaceDeps struct {
	support   dawport.Support
	replacer  dawport.RangeReplacer
	daw       string
	log       *editlog.Service
	alignment func(chapterID string) (coverage.AlignmentView, error)
	theirs    func(ctx context.Context, trackGUID string) (dawport.TrackState, error)
	measure   func(ctx context.Context, path string, rng measure.Range) (measure.Report, error)
	target    float64
	newID     func() string
}

func (h *Host) replaceDeps(svc hostServices) replaceDeps {
	resolver, _ := h.dawResolverFor(svc)
	deps := replaceDeps{
		support:  resolver.Support(dawport.CapReplaceRange),
		replacer: svc.rangeReplacer,
		daw:      readAloudAdapterName(svc),
		log:      h.editLog(),
		alignment: func(chapterID string) (coverage.AlignmentView, error) {
			if svc.coverage == nil {
				return coverage.AlignmentView{}, errNoProject
			}
			return svc.coverage.Alignment(chapterID, coverageSettings(svc.settings).Alignment)
		},
		theirs: func(ctx context.Context, trackGUID string) (dawport.TrackState, error) {
			reader := trackStateReaderFrom(svc)
			if reader == nil {
				return dawport.TrackState{}, errors.New("the DAW's tracks cannot be read now")
			}
			return reader.ChapterTrackState(ctx, trackGUID)
		},
		measure: func(ctx context.Context, path string, rng measure.Range) (measure.Report, error) {
			return measure.MeasureStretch(ctx, path, rng, mp3LevelDecoder())
		},
		target: replaceTargetLUFS(svc.settings),
		newID:  newReplacementID,
	}
	return deps
}

// replaceTargetLUFS is Editing.replace_target_lufs, or its default when it is unset or not a whole number in range.
func replaceTargetLUFS(store *settings.Store) float64 {
	if store == nil {
		return defaultReplaceTargetLUFS
	}
	value, _ := store.Effective("Editing", "replace_target_lufs", "")
	var target int
	if _, err := fmt.Sscanf(value, "%d", &target); err != nil || target < -40 || target > -10 {
		return defaultReplaceTargetLUFS
	}
	return float64(target)
}

// newReplacementID is a replacement's id: "r-" and 12 random hex digits, a name the bridge stamps on the DAW's item.
func newReplacementID() string {
	var raw [6]byte
	_, _ = rand.Read(raw[:])
	return "r-" + hex.EncodeToString(raw[:])
}

// ReplaceNarrators lists the project's other narrators and their files, each file checked against the disk.
func (h *Host) ReplaceNarrators() (string, error) {
	return encodeBinding(h.editLog().NarratorsList())
}

// ReplaceNarratorAdd names another narrator for the project (a duet partner, a stand-in, one of a cast). A name already there is not
// added twice.
func (h *Host) ReplaceNarratorAdd(name string) (string, error) {
	return encodeBinding(h.editLog().NarratorAdd(name))
}

// ReplaceNarratorRemove forgets another narrator who has no files in the project.
func (h *Host) ReplaceNarratorRemove(id string) (string, error) {
	return encodeBinding(h.editLog().NarratorRemove(id))
}

// ReplaceAddFile opens this app's file dialog for a file of narratorID's and, when the narrator picks one, brings it into the DAW on a
// muted track of its own named for them (the replace_range capability's ImportTheirAudio) and records it. The file stays where it is:
// the DAW's track holds it. Cancelling changes nothing and answers the list as it is.
func (h *Host) ReplaceAddFile(narratorID string) (string, error) {
	svc := h.services()
	if svc.config.projectFolder == "" {
		return "", errNoProject
	}
	path, err := pickFile("Choose their audio", []fileFilter{
		{"Audio (*.wav, *.flac, *.mp3, *.ogg, *.aif, *.aiff)", "*.wav;*.flac;*.mp3;*.ogg;*.aif;*.aiff"},
		{"All files (*.*)", "*.*"},
	})
	if err != nil {
		return "", err
	}
	deps := h.replaceDeps(svc)
	if path == "" {
		list, err := deps.log.NarratorsList()
		return encodeBinding(ReplaceFileAnswer{Result: dawport.OK("", false), Narrators: list}, err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), replaceTimeout)
	defer cancel()
	run := h.runLog.Begin("replace_add_file", "narrator_id", narratorID)
	answer, err := replaceAddFileIn(ctx, deps, narratorID, path)
	run.End(runOutcome(answer.Result, err))
	return encodeBinding(answer, err)
}

// replaceAddFileIn is ReplaceAddFile after the dialog: path is the file the narrator picked.
func replaceAddFileIn(ctx context.Context, deps replaceDeps, narratorID, path string) (ReplaceFileAnswer, error) {
	refuse := func(sentence string) (ReplaceFileAnswer, error) {
		list, err := deps.log.NarratorsList()
		return ReplaceFileAnswer{Result: dawport.Refused(sentence), Narrators: list}, err
	}
	if !deps.support.Available {
		return refuse(deps.support.Message)
	}
	if deps.replacer == nil {
		return refuse(replaceNotConnected(deps.daw))
	}
	list, err := deps.log.NarratorsList()
	if err != nil {
		return ReplaceFileAnswer{}, err
	}
	name := ""
	for _, narrator := range list.Narrators {
		if narrator.ID == narratorID {
			name = narrator.Name
		}
	}
	if name == "" {
		return refuse(replaceNoNarratorSentence)
	}
	facts, refusal, err := theirFileFacts(path)
	if err != nil {
		return ReplaceFileAnswer{}, err
	}
	if refusal != "" {
		return refuse(refusal)
	}
	for _, narrator := range list.Narrators {
		for _, file := range narrator.Files {
			if _, stored, ok, _ := deps.log.NarratorFileOf(file.ID); ok && stored.SHA256 == facts.SHA256 {
				return refuse(fmt.Sprintf(replaceSameFileSentence, facts.Name, narrator.Name))
			}
		}
	}
	got, err := deps.replacer.ImportTheirAudio(ctx, name, facts.Path)
	if err != nil {
		return refuse(replaceRefusal(deps.daw, err).Message)
	}
	if !got.Result.OK {
		return ReplaceFileAnswer{Result: got.Result, Narrators: list}, nil
	}
	facts.Daw, facts.Track, facts.Item, facts.Length = deps.daw, got.Track, got.Item, got.Length
	change, err := deps.log.NarratorFileAdd(narratorID, facts)
	if err != nil {
		result := got.Result
		result.Message += " The app could not keep a record of it (" + err.Error() + "). Use Edit > Undo in " + deps.daw + " to take it back."
		return ReplaceFileAnswer{Result: result, Narrators: list}, nil
	}
	fileID := ""
	if len(change.Changed) == 1 {
		fileID = change.Changed[0]
	}
	return ReplaceFileAnswer{Result: got.Result, FileID: fileID, Narrators: change.Narrators}, nil
}

// theirFileFacts reads what the record keeps of the file at path, or the sentence it is refused with: a network path, a file that is
// not audio by its name, gone, empty or over maxTheirFileBytes.
func theirFileFacts(path string) (editlog.NarratorFile, string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return editlog.NarratorFile{}, "That is not a path to a file on this computer.", nil
	}
	name := filepath.Base(abs)
	if strings.HasPrefix(path, `\\`) || strings.HasPrefix(path, "//") || strings.HasPrefix(abs, `\\`) || strings.HasPrefix(abs, "//") {
		return editlog.NarratorFile{}, fmt.Sprintf(replaceNetworkSentence, name), nil
	}
	if !replaceExtensions[strings.ToLower(filepath.Ext(abs))] {
		return editlog.NarratorFile{}, fmt.Sprintf(replaceNotAudioSentence, name), nil
	}
	if strings.ContainsAny(abs, "|\x00\r\n") {
		return editlog.NarratorFile{}, "Rename the file so its name or folder has no bar (|) in it, then add it.", nil
	}
	file, err := os.Open(abs)
	if err != nil {
		return editlog.NarratorFile{}, fmt.Sprintf("%s could not be opened. Choose it again.", name), nil
	}
	defer func() { _ = file.Close() }() // read-only
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		return editlog.NarratorFile{}, fmt.Sprintf("%s is not a file with audio in it.", name), nil
	}
	if info.Size() > maxTheirFileBytes {
		return editlog.NarratorFile{}, fmt.Sprintf(replaceTooBigSentence, name, gigabytes(info.Size())), nil
	}
	digest := sha256.New()
	if _, err := io.Copy(digest, file); err != nil {
		return editlog.NarratorFile{}, fmt.Sprintf("%s could not be read. Choose it again.", name), nil
	}
	return editlog.NarratorFile{Name: name, Path: abs, Size: info.Size(), SHA256: hex.EncodeToString(digest.Sum(nil)), ModTime: info.ModTime()}, "", nil
}

func gigabytes(size int64) string {
	return fmt.Sprintf("%.1f GB", float64(size)/(1<<30))
}

// ReplacePlan works out one replacement before anything changes: chapterID's words firstToken..lastToken (as DawDeleteRange takes
// them) replaced by sourceStart..sourceEnd seconds of their file fileID. It measures their stretch's loudness against the project's
// target (Settings > Editing) and answers the level change that gets it there. It changes nothing, in the DAW or on disk.
func (h *Host) ReplacePlan(chapterID string, firstToken, lastToken int, fileID string, sourceStart, sourceEnd float64) (string, error) {
	svc := h.services()
	ctx, cancel := context.WithTimeout(context.Background(), replaceTimeout)
	defer cancel()
	return encodeBinding(replacePlanIn(ctx, h.replaceDeps(svc), chapterID, firstToken, lastToken, fileID, sourceStart, sourceEnd))
}

// replacePlanned is a plan and what DawReplaceRange needs beside it.
type replacePlanned struct {
	view     ReplacePlanView
	resolved passagetakes.CutRange
	narrator editlog.StoredNarrator
	file     editlog.NarratorFile
}

func replacePlanIn(ctx context.Context, deps replaceDeps, chapterID string, firstToken, lastToken int, fileID string, sourceStart, sourceEnd float64) (ReplacePlanView, error) {
	planned, err := planReplacement(ctx, deps, chapterID, firstToken, lastToken, fileID, sourceStart, sourceEnd, true)
	return planned.view, err
}

// planReplacement checks a replacement and, when measure is true, measures their stretch. A refusal is the view's Result.
func planReplacement(ctx context.Context, deps replaceDeps, chapterID string, firstToken, lastToken int, fileID string,
	sourceStart, sourceEnd float64, measureIt bool) (replacePlanned, error) {
	refuse := func(result dawport.Result) (replacePlanned, error) {
		return replacePlanned{view: ReplacePlanView{Result: result, TargetLUFS: deps.target}}, nil
	}
	if !deps.support.Available {
		return refuse(dawport.Refused(deps.support.Message))
	}
	narrator, file, ok, err := deps.log.NarratorFileOf(fileID)
	if err != nil {
		return replacePlanned{}, err
	}
	if !ok {
		return refuse(dawport.Refused(replaceNoFileSentence))
	}
	switch editlog.FileState(file) {
	case editlog.FileMissing:
		return refuse(dawport.RefusedStale(fmt.Sprintf(replaceFileMissingSentence, file.Name)))
	case editlog.FileChanged:
		return refuse(dawport.RefusedStale(fmt.Sprintf(replaceFileChangedSentence, file.Name)))
	}
	if !finiteSeconds(sourceStart) || !finiteSeconds(sourceEnd) || sourceStart < 0 || sourceEnd > file.Length+1e-6 ||
		sourceEnd-sourceStart < minReplaceSeconds || sourceEnd-sourceStart > maxReplaceSeconds {
		return refuse(dawport.Refused(replaceStretchSentence))
	}
	view, err := deps.alignment(chapterID)
	if err != nil {
		return replacePlanned{}, err
	}
	resolved, refused := passagetakes.ResolveRange(view, chapterID, firstToken, lastToken)
	if refused != nil {
		return refuse(*refused)
	}
	if resolved.Request.End-resolved.Request.Start > maxReplaceSeconds {
		return refuse(dawport.Refused(replaceWordsTooLongSentence))
	}
	if _, replaced, err := deps.log.ReplacedWords(chapterID, wordKeys(resolved.Words)); err != nil {
		return replacePlanned{}, err
	} else if replaced {
		return refuse(dawport.Refused(replaceAlreadySentence))
	}
	plan := ReplacePlanView{
		Result: dawport.OK("", false), Narrator: narrator.Name, Words: resolved.Request.Words, Start: resolved.Request.Start,
		End: resolved.Request.End, SourceStart: sourceStart, SourceEnd: sourceEnd, TargetLUFS: deps.target,
		Shift: (sourceEnd - sourceStart) - (resolved.Request.End - resolved.Request.Start),
	}
	if measureIt {
		measureLoudness(ctx, deps, file, &plan)
	}
	return replacePlanned{view: plan, resolved: resolved, narrator: narrator, file: file}, nil
}

// measureLoudness fills the plan's loudness: their stretch's integrated loudness and the level change to the target, held to ±24 dB.
// A stretch it cannot measure keeps a level change of 0 and says why.
func measureLoudness(ctx context.Context, deps replaceDeps, file editlog.NarratorFile, plan *ReplacePlanView) {
	report, err := deps.measure(ctx, file.Path, measure.Range{StartSeconds: plan.SourceStart, LengthSeconds: plan.SourceEnd - plan.SourceStart})
	switch {
	case errors.Is(err, measure.ErrDecoderNotAvailable):
		plan.LoudnessNote = "Their level was not measured: reading " + strings.ToUpper(strings.TrimPrefix(filepath.Ext(file.Name), ".")) +
			" needs the audio encoder (Settings > Models & downloads). Their stretch keeps its own level unless you set one."
		return
	case err != nil:
		plan.LoudnessNote = "Their level could not be measured, so their stretch keeps its own level unless you set one."
		return
	case report.IntegratedLUFS == nil || math.IsInf(*report.IntegratedLUFS, 0) || math.IsNaN(*report.IntegratedLUFS):
		plan.LoudnessNote = "Their stretch is too short or too quiet to measure, so it keeps its own level unless you set one."
		return
	}
	measured := math.Round(*report.IntegratedLUFS*10) / 10
	plan.MeasuredLUFS = &measured
	gain := math.Round((plan.TargetLUFS-measured)*10) / 10
	if math.Abs(gain) > dawport.MaxReplaceGainDB {
		gain = math.Copysign(dawport.MaxReplaceGainDB, gain)
		plan.Clamped = true
	}
	plan.GainDB = gain
}

func wordKeys(words []passagetakes.Word) []string {
	keys := make([]string, 0, len(words))
	for _, word := range words {
		if word.ParagraphID != "" {
			keys = append(keys, fmt.Sprintf("%s:%d", word.ParagraphID, word.Ordinal))
		}
	}
	return keys
}

// DawReplaceRange replaces chapterID's words firstToken..lastToken with sourceStart..sourceEnd seconds of their file fileID in the DAW,
// at gainDB (-24 to 24) with fadeMs (0 to 500) at each seam, and records it. The host finds their item on their track as the DAW reads
// it now and sends the DAW its own ids and seconds, never one the page gave. The later audio moves by the difference in length. Its
// refusals are ReplacePlan's, then a fade or level out of range; nothing is sent on any of them.
func (h *Host) DawReplaceRange(chapterID string, firstToken, lastToken int, fileID string, sourceStart, sourceEnd float64, fadeMs int, gainDB float64) (string, error) {
	svc := h.services()
	ctx, cancel := context.WithTimeout(context.Background(), replaceTimeout)
	defer cancel()
	run := h.runLog.Begin("replace_range", "chapter_id", chapterID)
	answer, err := dawReplaceRangeIn(ctx, h.replaceDeps(svc), chapterID, firstToken, lastToken, fileID, sourceStart, sourceEnd, fadeMs, gainDB)
	run.End(runOutcome(answer.Result, err))
	return encodeBinding(answer, err)
}

func dawReplaceRangeIn(ctx context.Context, deps replaceDeps, chapterID string, firstToken, lastToken int, fileID string,
	sourceStart, sourceEnd float64, fadeMs int, gainDB float64) (ReplaceAnswer, error) {
	answer := func(result dawport.Result, id string) (ReplaceAnswer, error) {
		list, err := deps.log.ReplacementsList(chapterID)
		return ReplaceAnswer{Result: result, ReplacementID: id, Replacements: list}, err
	}
	if fadeMs < 0 || fadeMs > 500 {
		return answer(dawport.Refused(replaceBadFadeSentence), "")
	}
	if math.IsNaN(gainDB) || math.Abs(gainDB) > dawport.MaxReplaceGainDB {
		return answer(dawport.Refused(replaceBadGainSentence), "")
	}
	planned, err := planReplacement(ctx, deps, chapterID, firstToken, lastToken, fileID, sourceStart, sourceEnd, true)
	if err != nil {
		return ReplaceAnswer{}, err
	}
	if !planned.view.Result.OK {
		return answer(planned.view.Result, "")
	}
	if deps.replacer == nil {
		return answer(dawport.Refused(replaceNotConnected(deps.daw)), "")
	}
	from, to, refused, err := theirProjectSeconds(ctx, deps, planned.file, sourceStart, sourceEnd)
	if err != nil {
		return answer(replaceRefusal(deps.daw, err), "")
	}
	if refused != nil {
		return answer(*refused, "")
	}
	id := deps.newID()
	request := dawport.ReplaceRangeRequest{RangeRequest: planned.resolved.Request, SourceItemGUID: planned.file.Item, SourceStart: from,
		SourceEnd: to, FadeMs: fadeMs, GainDB: gainDB, ID: id, Narrator: planned.narrator.Name}
	got, err := deps.replacer.ReplaceRange(ctx, request)
	if err != nil {
		return answer(replaceRefusal(deps.daw, err), "")
	}
	if !got.Result.OK {
		return answer(got.Result, "")
	}
	record := editlog.ReplacementRequest{
		ID: id, Keys: wordKeys(planned.resolved.Words), Start: planned.view.Start, End: planned.view.End, NarratorID: planned.narrator.ID,
		FileID: planned.file.ID, SourceStart: sourceStart, SourceEnd: sourceEnd, GainDB: gainDB, MeasuredLUFS: planned.view.MeasuredLUFS,
		TargetLUFS: deps.target, FadeMs: fadeMs, Shift: got.Shift, Daw: deps.daw, Item: got.ReplacementItem, CutItem: got.CutItem,
		UndoSteps: got.Result.UndoSteps,
	}
	if _, err := deps.log.ReplacementRecord(chapterID, planned.narrator.Name, record); err != nil {
		result := got.Result
		result.Message += " The app could not keep a record of it (" + err.Error() + "), so Put my audio back cannot find it. Use Undo now to take it back."
		return answer(result, "")
	}
	return answer(got.Result, id)
}

// theirProjectSeconds maps sourceStart..sourceEnd seconds of their file to project seconds on their item as the DAW reads it now: the
// item must still be on their track, play their file, and cover the stretch.
func theirProjectSeconds(ctx context.Context, deps replaceDeps, file editlog.NarratorFile, sourceStart, sourceEnd float64) (float64, float64, *dawport.Result, error) {
	stale := func() (float64, float64, *dawport.Result, error) {
		result := dawport.RefusedStale(fmt.Sprintf(replaceTheirItemSentence, deps.daw))
		return 0, 0, &result, nil
	}
	state, err := deps.theirs(ctx, file.Track)
	if err != nil {
		if errors.Is(err, bridge.ErrStale) {
			return stale()
		}
		return 0, 0, nil, err
	}
	for _, item := range state.Items {
		if !strings.EqualFold(item.ItemGUID, file.Item) {
			continue
		}
		if !sameFile(item.SourceFile, file.Path) {
			return stale()
		}
		rate := item.PlayRate
		if rate <= 0 {
			rate = 1
		}
		from := item.Position + (sourceStart-item.SourceOffset)/rate
		to := item.Position + (sourceEnd-item.SourceOffset)/rate
		if from < item.Position-1e-6 || to > item.Position+item.Length+1e-6 {
			result := dawport.RefusedStale(fmt.Sprintf("Their item in %s no longer plays that stretch of their file (it was trimmed or moved), so nothing changed.", deps.daw))
			return 0, 0, &result, nil
		}
		return from, to, nil, nil
	}
	return stale()
}

func sameFile(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	return filepath.Clean(a) == filepath.Clean(b) || strings.EqualFold(filepath.Clean(a), filepath.Clean(b)) && os.PathSeparator == '\\'
}

// DawRestoreReplacement puts the narrator's audio back in place of chapterID's replacement replacementID (Put my audio back), which
// works after a restart, and marks the record restored. A replacement that is not recorded, or already put back, is refused with
// nothing sent.
func (h *Host) DawRestoreReplacement(chapterID, replacementID string) (string, error) {
	svc := h.services()
	ctx, cancel := context.WithTimeout(context.Background(), replaceTimeout)
	defer cancel()
	run := h.runLog.Begin("restore_replacement", "chapter_id", chapterID)
	answer, err := dawRestoreReplacementIn(ctx, h.replaceDeps(svc), chapterID, replacementID)
	run.End(runOutcome(answer.Result, err))
	return encodeBinding(answer, err)
}

func dawRestoreReplacementIn(ctx context.Context, deps replaceDeps, chapterID, replacementID string) (ReplaceAnswer, error) {
	answer := func(result dawport.Result) (ReplaceAnswer, error) {
		list, err := deps.log.ReplacementsList(chapterID)
		return ReplaceAnswer{Result: result, ReplacementID: replacementID, Replacements: list}, err
	}
	if !deps.support.Available {
		return answer(dawport.Refused(deps.support.Message))
	}
	stored, ok, err := deps.log.ReplacementActive(chapterID, replacementID)
	if err != nil {
		return ReplaceAnswer{}, err
	}
	if !ok {
		return answer(dawport.Refused(replaceNoRecordSentence))
	}
	if deps.replacer == nil {
		return answer(dawport.Refused(replaceNotConnected(deps.daw)))
	}
	got, err := deps.replacer.RestoreReplacement(ctx, dawport.RestoreRequest{ReplacementItem: stored.Item, ID: stored.ID, Words: len(stored.Words)})
	if err != nil {
		return answer(replaceRefusal(deps.daw, err))
	}
	if !got.OK {
		return answer(got)
	}
	if _, err := deps.log.ReplacementRestored(chapterID, replacementID); err != nil {
		got.Message += " The app could not mark it put back (" + err.Error() + ")."
	}
	return answer(got)
}

// EditingReplacementsList returns a chapter's replacements, each checked against the current text: what the page shows on the words.
func (h *Host) EditingReplacementsList(chapterID string) (string, error) {
	return encodeBinding(h.editLog().ReplacementsList(chapterID))
}

// EditingReplacementRemove forgets a chapter's replacement: the inverse the journal calls once the app's Undo took the DAW edit back.
func (h *Host) EditingReplacementRemove(chapterID, id string) (string, error) {
	return encodeBinding(h.editLog().ReplacementRemove(chapterID, id))
}

// ReplaceFilePeaks answers the waveform of their file fileID for the page's range, or why there is none: a file that is not a WAV
// (MP3 and the rest have no waveform yet, as on the chapter strip), or one that moved or changed.
func (h *Host) ReplaceFilePeaks(fileID string) (string, error) {
	svc := h.services()
	_, file, ok, err := h.editLog().NarratorFileOf(fileID)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", errors.New("that file of theirs is not in this project")
	}
	view := ReplaceFilePeaksView{FileID: fileID, Length: file.Length}
	if state := editlog.FileState(file); state != editlog.FileOK {
		view.Reason = "their file " + state
		return encodeBinding(view, nil)
	}
	ctx, cancel := context.WithTimeout(context.Background(), workspacePeaksTimeout)
	defer cancel()
	identity, err := evidence.Identify(file.Path, svc.config.projectFolder)
	if err != nil {
		view.Reason = "their file could not be read"
		return encodeBinding(view, nil)
	}
	peaks, err := measure.CachedPeaksFile(ctx, evidence.NewCacheStore(svc.config.projectFolder), identity, file.Path, nil, measure.DefaultPeaksPerSecond)
	switch {
	case errors.Is(err, measure.ErrNotWAV):
		view.Reason = "no waveform"
	case err != nil:
		view.Reason = "their file's waveform could not be computed"
	default:
		view.Peaks = &peaks
	}
	return encodeBinding(view, nil)
}

// replaceRefusal words an error the role returned rather than answered: a capability refusal, the DAW not answering, or no answer in
// time. Nothing is known to have changed, so the narrator is told to look before trying again.
func replaceRefusal(daw string, err error) dawport.Result {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused
	}
	switch {
	case errors.Is(err, bridge.ErrNoAnswer):
		return dawport.Refused(fmt.Sprintf("%s is not answering. Check that %s is open, then try again; the app reconnects by itself.", daw, daw))
	case errors.Is(err, bridge.ErrUnavailable):
		return dawport.Refused(replaceNotConnected(daw))
	case errors.Is(err, context.DeadlineExceeded):
		return dawport.Refused(fmt.Sprintf("%s did not answer within %d seconds. Check the project before trying again.", daw, int(replaceTimeout.Seconds())))
	}
	return dawport.Refused(fmt.Sprintf("%s could not do that: %s.", daw, err.Error()))
}

// replaceNotConnected is the refusal with no live DAW adapter.
func replaceNotConnected(daw string) string {
	return fmt.Sprintf("%s is not connected to this app. Open %s; the app connects to it by itself.", daw, daw)
}

// runOutcome is a run log's end word for a call that answered result or err.
func runOutcome(result dawport.Result, err error) string {
	switch {
	case err != nil:
		return "error"
	case result.Refused != "":
		return "refused"
	}
	return "ok"
}
