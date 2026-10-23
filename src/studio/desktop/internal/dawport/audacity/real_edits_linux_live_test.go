//go:build audacityreal && linux

// The edits the adapter makes in steps (backups, a roll, a cut, a stack and un-stack, a macro, lowered stretches, repaired clicks),
// run against a real Audacity 3 on Linux over mod-script-pipe's FIFOs: the adapter half of A3-T16 to A3-T21 in
// docs/research/audacity-3-capability-matrix.md. The Python tests in src/studio/tests/audacity3/real/edits measure what Audacity does with each
// command; this file checks the shipped adapter does the right thing with that. It sits behind the audacityreal build tag and the
// NU_AUDACITY_* variables src/studio/tests/audacity3/real/edits/run.sh sets, and it shares nothing with real_linux_live_test.go (another
// stream's file), so the helpers here carry an "ed" prefix.
//
//	src/studio/tests/audacity3/real/edits/run.sh --go
package audacity

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-studio/shell/internal/dawport"
)

// ---- the FIFO transport (the app is Windows-only, so PipeTransport has no Linux pipe) -----------------------------------------------

func edFifoTransport() audacitybridge.Transport {
	uid := os.Getuid()
	toSrv := fmt.Sprintf("/tmp/audacity_script_pipe.to.%d", uid)
	fromSrv := fmt.Sprintf("/tmp/audacity_script_pipe.from.%d", uid)
	type opened struct {
		f   *os.File
		err error
	}
	open := func(ctx context.Context, path string, flag int) (*os.File, error) {
		ch := make(chan opened, 1)
		go func() {
			f, err := os.OpenFile(path, flag, 0)
			ch <- opened{f, err}
		}()
		select {
		case o := <-ch:
			return o.f, o.err
		case <-ctx.Done():
			go func() {
				if o := <-ch; o.f != nil {
					_ = o.f.Close()
				}
			}()
			return nil, ctx.Err()
		}
	}
	return audacitybridge.TransportFunc(func(ctx context.Context) (audacitybridge.Conn, error) {
		if _, err := os.Stat(toSrv); err != nil {
			return nil, audacitybridge.ErrNotReachable
		}
		w, err := open(ctx, toSrv, os.O_WRONLY)
		if err != nil {
			return nil, err
		}
		r, err := open(ctx, fromSrv, os.O_RDONLY)
		if err != nil {
			_ = w.Close()
			return nil, err
		}
		return edFifoConn{r: r, w: w}, nil
	})
}

type edFifoConn struct{ r, w *os.File }

func (c edFifoConn) Read(p []byte) (int, error)  { return c.r.Read(p) }
func (c edFifoConn) Write(p []byte) (int, error) { return c.w.Write(p) }
func (c edFifoConn) Close() error                { return errors.Join(c.r.Close(), c.w.Close()) }

func edClient(timeout time.Duration) *audacitybridge.Client {
	return audacitybridge.New(edFifoTransport(), audacitybridge.Options{LineEnd: "\n", Timeout: timeout})
}

// ---- results: the same JSON shape the Python tests write, so summarize.py merges them ------------------------------------------------

type edStep struct {
	Step   string         `json:"step"`
	Status string         `json:"status"`
	Detail string         `json:"detail"`
	Data   map[string]any `json:"data"`
}

type edReport struct {
	ID       string   `json:"id"`
	Title    string   `json:"title"`
	Status   string   `json:"status"`
	Seconds  float64  `json:"seconds"`
	Audacity string   `json:"audacity"`
	Runner   string   `json:"runner"`
	Platform string   `json:"platform"`
	Steps    []edStep `json:"steps"`
	started  time.Time
	t        *testing.T
}

func edNewReport(t *testing.T, id, title string) *edReport {
	return &edReport{ID: id, Title: title, started: time.Now(), t: t, Audacity: os.Getenv("NU_AUDACITY_VERSION"), Runner: os.Getenv("NU_RUNNER_IMAGE"), Platform: "linux"}
}

func (r *edReport) add(status, name, detail string) {
	r.Steps = append(r.Steps, edStep{Step: name, Status: status, Detail: detail, Data: map[string]any{}})
	r.t.Logf("[%s] %-4s +%4.1fs %s: %s", r.ID, status, time.Since(r.started).Seconds(), name, detail)
}

func (r *edReport) check(name string, ok bool, format string, args ...any) bool {
	status := "PASS"
	if !ok {
		status = "FAIL"
	}
	r.add(status, name, fmt.Sprintf(format, args...))
	return ok
}

func (r *edReport) note(name, format string, args ...any) {
	r.add("INFO", name, fmt.Sprintf(format, args...))
}

// finish writes the report to $NU_AUDACITY_OUT/results/<id>-adapter.json and fails the test when a check failed.
func (r *edReport) finish() {
	r.Status, r.Seconds = "PASS", math.Round(time.Since(r.started).Seconds()*10)/10
	for _, s := range r.Steps {
		if s.Status == "FAIL" {
			r.Status = "FAIL"
		}
	}
	if out := os.Getenv("NU_AUDACITY_OUT"); out != "" {
		dir := filepath.Join(out, "results")
		if err := os.MkdirAll(dir, 0o755); err == nil {
			raw, _ := json.MarshalIndent(r, "", " ")
			_ = os.WriteFile(filepath.Join(dir, r.ID+"-adapter.json"), raw, 0o644)
		}
	}
	if r.Status == "FAIL" {
		r.t.Fail()
	}
}

// ---- audio ------------------------------------------------------------------------------------------------------------------------

type edWav struct {
	rate, channels int
	samples        []float64 // interleaved
	pcm            []byte
}

func edReadWAV(path string) (edWav, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return edWav{}, err
	}
	if len(b) < 12 || string(b[0:4]) != "RIFF" || string(b[8:12]) != "WAVE" {
		return edWav{}, fmt.Errorf("%s is not a RIFF WAVE file", path)
	}
	var w edWav
	var bits int
	var data []byte
	for p := 12; p+8 <= len(b); {
		id, size := string(b[p:p+4]), int(binary.LittleEndian.Uint32(b[p+4:]))
		body := b[p+8 : min(p+8+size, len(b))]
		switch id {
		case "fmt ":
			w.channels = int(binary.LittleEndian.Uint16(body[2:]))
			w.rate = int(binary.LittleEndian.Uint32(body[4:]))
			bits = int(binary.LittleEndian.Uint16(body[14:]))
		case "data":
			data = body
		}
		p += 8 + size + size%2
	}
	if bits != 16 {
		return edWav{}, fmt.Errorf("%s: %d-bit WAV (only 16-bit is read here)", path, bits)
	}
	w.pcm = data
	for i := 0; i+1 < len(data); i += 2 {
		w.samples = append(w.samples, float64(int16(binary.LittleEndian.Uint16(data[i:])))/32768)
	}
	return w, nil
}

func (w edWav) seconds() float64 {
	return float64(len(w.samples)/max(w.channels, 1)) / float64(max(w.rate, 1))
}

// window is channel 0 between a and b seconds.
func (w edWav) window(a, b float64) []float64 {
	var out []float64
	for i := int(a * float64(w.rate)); i < int(b*float64(w.rate)) && i*w.channels < len(w.samples); i++ {
		out = append(out, w.samples[i*w.channels])
	}
	return out
}

func edRMSdB(s []float64) float64 {
	if len(s) == 0 {
		return -200
	}
	var sum float64
	for _, v := range s {
		sum += v * v
	}
	if sum == 0 {
		return -200
	}
	return 20 * math.Log10(math.Sqrt(sum/float64(len(s))))
}

func edPeak(s []float64) float64 {
	var p float64
	for _, v := range s {
		p = max(p, math.Abs(v))
	}
	return p
}

// edHz is the frequency of a mono sample list by rising zero crossings.
func edHz(s []float64, rate int) float64 {
	if len(s) < 4 {
		return 0
	}
	n := 0
	for i := 1; i < len(s); i++ {
		if s[i-1] < 0 && s[i] >= 0 {
			n++
		}
	}
	return float64(n) * float64(rate) / float64(len(s))
}

// edWriteSteps writes a 16-bit 44.1 kHz tone whose frequency is 300 + 40 k Hz in second k (k counted mod 20), so each second can be told
// from every other, and a spike of a few samples at each time in spikes when given.
func edWriteSteps(path string, seconds, channels int, spikes ...float64) error {
	const rate = 44100
	n := seconds * rate
	data := make([]byte, 44+2*n*channels)
	copy(data[0:], "RIFF")
	binary.LittleEndian.PutUint32(data[4:], uint32(36+2*n*channels))
	copy(data[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(data[16:], 16)
	binary.LittleEndian.PutUint16(data[20:], 1)
	binary.LittleEndian.PutUint16(data[22:], uint16(channels))
	binary.LittleEndian.PutUint32(data[24:], rate)
	binary.LittleEndian.PutUint32(data[28:], uint32(rate*2*channels))
	binary.LittleEndian.PutUint16(data[32:], uint16(2*channels))
	binary.LittleEndian.PutUint16(data[34:], 16)
	copy(data[36:], "data")
	binary.LittleEndian.PutUint32(data[40:], uint32(2*n*channels))
	for i := range n {
		f := 300 + 40*float64((i/rate)%20)
		v := int16(32767 * 0.4 * math.Sin(2*math.Pi*f*float64(i)/rate))
		if len(spikes) > 0 { // a quiet 440 Hz tone with a full-height spike of 8 samples at each spike time
			v = int16(32767 * 0.1 * math.Sin(2*math.Pi*440*float64(i)/rate))
			for _, at := range spikes {
				if i >= int(at*rate) && i < int(at*rate)+8 {
					v = 29490
				}
			}
		}
		for c := range channels {
			binary.LittleEndian.PutUint16(data[44+2*(i*channels+c):], uint16(v))
		}
	}
	return os.WriteFile(path, data, 0o600)
}

// ---- the project --------------------------------------------------------------------------------------------------------------------

type edEnv struct {
	t      *testing.T
	ctx    context.Context
	client *audacitybridge.Client
	work   string
}

func (e *edEnv) do(name string, build func(c *audacitybridge.Command) *audacitybridge.Command) error {
	_, err := e.client.Do(e.ctx, build(audacitybridge.NewCommand(name)))
	return err
}

func (e *edEnv) must(err error) {
	e.t.Helper()
	if err != nil {
		e.t.Fatal(err)
	}
}

// reset removes every track, so a test starts from an empty project without restarting Audacity.
func (e *edEnv) reset() {
	tracks, err := e.client.Tracks(e.ctx)
	e.must(err)
	if len(tracks) == 0 {
		return
	}
	e.must(e.do("SelectAll", func(c *audacitybridge.Command) *audacitybridge.Command { return c }))
	e.must(e.do("RemoveTracks", func(c *audacitybridge.Command) *audacitybridge.Command { return c }))
}

// importSteps imports a generated steps tone as a track named after the file.
func (e *edEnv) importSteps(name string, seconds, channels int, spikes ...float64) {
	path := filepath.Join(e.work, name+".wav")
	e.must(edWriteSteps(path, seconds, channels, spikes...))
	e.must(e.do("Import2", func(c *audacitybridge.Command) *audacitybridge.Command { return c.String("Filename", path) }))
}

// exportTrack exports track index's start..end to a WAV and reads it back.
func (e *edEnv) exportTrack(name string, index int, start, end float64) edWav {
	e.t.Helper()
	e.must(e.client.SelectTracks(e.ctx, index, 1))
	e.must(e.client.SelectTime(e.ctx, start, end))
	path := filepath.Join(e.work, name)
	_ = os.Remove(path)
	e.must(e.do("Export2", func(c *audacitybridge.Command) *audacitybridge.Command {
		return c.String("Filename", path).Int("NumChannels", 1)
	}))
	w, err := edReadWAV(path)
	e.must(err)
	return w
}

func (e *edEnv) track(name string) (audacitybridge.TrackInfo, bool) {
	tracks, err := e.client.Tracks(e.ctx)
	e.must(err)
	for _, tr := range tracks {
		if tr.Name == name {
			return tr, true
		}
	}
	return audacitybridge.TrackInfo{}, false
}

func (e *edEnv) undo() {
	e.must(e.do("Undo", func(c *audacitybridge.Command) *audacitybridge.Command { return c }))
}

func (e *edEnv) waitForProject() {
	start := time.Now()
	for {
		if _, err := e.client.Tracks(e.ctx); err == nil {
			return
		}
		if time.Since(start) > 60*time.Second {
			e.t.Fatal("no project window after 60 s")
		}
		time.Sleep(500 * time.Millisecond)
	}
}

// dismissDialogs clicks the OK button of every dialog on the X display (a click in the lower right of each box, never Return).
func edDismissDialogs() {
	out, err := exec.Command("xdotool", "search", "--onlyvisible", "--class", "audacity").Output()
	if err != nil {
		return
	}
	ids := strings.Fields(string(out))
	if len(ids) < 2 {
		return
	}
	for i := len(ids) - 1; i >= 1; i-- {
		geo, err := exec.Command("xdotool", "getwindowgeometry", "--shell", ids[i]).Output()
		if err != nil {
			continue
		}
		var x, y, w, h int
		for _, line := range strings.Fields(string(geo)) {
			k, v, _ := strings.Cut(line, "=")
			var n int
			_, _ = fmt.Sscanf(v, "%d", &n)
			switch k {
			case "X":
				x = n
			case "Y":
				y = n
			case "WIDTH":
				w = n
			case "HEIGHT":
				h = n
			}
		}
		_ = exec.Command("xdotool", "mousemove", fmt.Sprint(x+w*88/100), fmt.Sprint(y+h*77/100), "click", "1").Run()
		time.Sleep(300 * time.Millisecond)
	}
}

func newEdEnv(t *testing.T, timeout time.Duration) *edEnv {
	t.Helper()
	if os.Getenv("NU_AUDACITY_OUT") == "" {
		t.Fatal("NU_AUDACITY_OUT is not set: the audacityreal tag is opt-in, so run src/studio/tests/audacity3/real/edits/run.sh --go, which sets it")
	}
	e := &edEnv{t: t, ctx: context.Background(), client: edClient(timeout), work: filepath.Join(os.Getenv("NU_AUDACITY_OUT"), "work-go", strings.ReplaceAll(t.Name(), "/", "_"))}
	t.Cleanup(func() { _ = e.client.Close() })
	e.must(os.MkdirAll(e.work, 0o755))
	e.must(e.client.Ping(e.ctx))
	e.waitForProject()
	// Dither off, so two exports of one audio compare equal (the keys are the *Choice ones, and take effect with Reload).
	for _, key := range []string{"/Quality/DitherAlgorithmChoice", "/Quality/HQDitherAlgorithmChoice"} {
		e.must(e.do("SetPreference", func(c *audacitybridge.Command) *audacitybridge.Command {
			return c.String("Name", key).String("Value", "None").Bool("Reload", true)
		}))
	}
	return e
}

// ---- A3-T17: backups ---------------------------------------------------------------------------------------------------------------

func TestRealEditsBackups(t *testing.T) {
	e := newEdEnv(t, 30*time.Second)
	r := edNewReport(t, "A3-T17g", "Backups through the adapter: BackupAround, damage, RestoreBackup, stereo, a missing track")
	defer r.finish()
	e.reset()
	folder := t.TempDir() // one table folder for the whole test, so List sees the rows
	adapter := NewWithBackups(e.client, BackupsConfig{Project: func() string { return folder }, Window: 120})
	e.importSteps("edits-tone", 300, 1)
	before := e.exportTrack("before.wav", 0, 30, 270)

	res, err := adapter.Backups().BackupAround(e.ctx, dawport.BackupRequest{GUID: "edits-tone", ChapterID: "ch", Start: 150, End: 150, Label: "live test"})
	if !r.check("BackupAround answers OK", err == nil && res.OK, "%+v, %v", res, err) {
		return
	}
	rows, err := adapter.Backups().List(e.ctx)
	if !r.check("the table has one row", err == nil && len(rows) == 1, "%+v, %v", rows, err) {
		return
	}
	row := rows[0]
	r.check("the window is 30 to 270 s (120 s either side of 150 s)", math.Abs(row.Start-30) < 0.01 && math.Abs(row.End-270) < 0.01, "%.3f to %.3f", row.Start, row.End)
	backup, found := e.track(BackupTrackName(row.ID))
	r.check("a track named for the backup exists and is muted", found && backup.Muted, "found=%v muted=%v", found, backup.Muted)
	source, _ := e.track("edits-tone")
	r.check("the narrator's track is not muted (SetTrackAudio acts on the selected track)", !source.Muted, "muted=%v", source.Muted)
	clips, err := e.client.Clips(e.ctx)
	e.must(err)
	var held bool
	for _, c := range clips {
		if c.Track == backup.Index && math.Abs(c.Start-30) < 0.01 && math.Abs(c.End-270) < 0.05 {
			held = true
		}
	}
	r.check("the backup track holds the audio at 30 to 270 s (Paste starts at the cursor, not at 0)", held, "clips %+v", clips)

	// Damage the original, then restore.
	e.must(e.client.SelectTracks(e.ctx, 0, 1))
	e.must(e.client.SelectTime(e.ctx, 100, 200))
	e.must(e.do("Silence", func(c *audacitybridge.Command) *audacitybridge.Command { return c }))
	damaged := e.exportTrack("damaged.wav", 0, 30, 270)
	r.check("the damage shows in the export", edRMSdB(damaged.window(80, 160)) < -90, "%.1f dB", edRMSdB(damaged.window(80, 160)))
	res, err = adapter.Backups().RestoreBackup(e.ctx, row.ID)
	r.check("RestoreBackup answers OK", err == nil && res.OK, "%+v, %v", res, err)
	restored := e.exportTrack("restored.wav", 0, 30, 270)
	r.check("the restored window is sample-for-sample the original", string(restored.pcm) == string(before.pcm), "%d vs %d bytes", len(restored.pcm), len(before.pcm))
	_, stillThere := e.track(BackupTrackName(row.ID))
	r.check("the backup track is kept after a restore, so it can be made again", stillThere, "")

	// A stereo source gets a stereo backup.
	e.reset()
	e.importSteps("edits-stereo", 60, 2)
	res, err = adapter.Backups().BackupAround(e.ctx, dawport.BackupRequest{GUID: "edits-stereo", ChapterID: "ch2", Start: 30, End: 30})
	rows, _ = adapter.Backups().List(e.ctx)
	var stereo audacitybridge.TrackInfo
	for _, row := range rows {
		if tr, ok := e.track(BackupTrackName(row.ID)); ok && row.GUID == "edits-stereo" {
			stereo = tr
		}
	}
	r.check("a stereo source gets a stereo backup track", err == nil && res.OK && stereo.Channels == 2, "%+v %v channels %d", res, err, stereo.Channels)

	// A missing backup track is refused and nothing changes.
	e.must(e.client.SelectTracks(e.ctx, stereo.Index, 1))
	e.must(e.do("RemoveTracks", func(c *audacitybridge.Command) *audacitybridge.Command { return c }))
	rows, _ = adapter.Backups().List(e.ctx)
	var id string
	for _, row := range rows {
		if row.GUID == "edits-stereo" {
			id = row.ID
		}
	}
	res, err = adapter.Backups().RestoreBackup(e.ctx, id)
	r.check("restoring a backup whose track was deleted is refused as stale", err == nil && !res.OK && res.Code == dawport.CodeStale, "%+v, %v", res, err)
}

// ---- A3-T16: roll ------------------------------------------------------------------------------------------------------------------

func TestRealEditsRoll(t *testing.T) {
	e := newEdEnv(t, 30*time.Second)
	r := edNewReport(t, "A3-T16g", "Roll through the adapter: Roll after a backup, the earlier audio kept, the new audio from the roll point")
	defer r.finish()
	sink := os.Getenv("NU_AUDACITY_SINK")
	if sink == "" {
		t.Fatal("NU_AUDACITY_SINK is not set")
	}
	e.reset()
	folder := t.TempDir()
	adapter := NewWithBackups(e.client, BackupsConfig{Project: func() string { return folder }, Window: 2})
	// A stereo 44.1 kHz track (compatible with the stereo input, so no sample-rate dialog), 8 s of stepped frequencies.
	e.importSteps("edits-roll", 8, 2)
	e.must(e.do("SetPreference", func(c *audacitybridge.Command) *audacitybridge.Command {
		return c.String("Name", "/AudioIO/PreRoll").String("Value", "1").Bool("Reload", false)
	}))
	before := e.exportTrack("roll-before.wav", 0, 0, 8)
	loop := filepath.Join(e.work, "loop880.wav")
	if out, err := exec.Command("ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=10:sample_rate=44100", "-ac", "2", loop).CombinedOutput(); err != nil {
		t.Fatalf("ffmpeg: %v %s", err, out)
	}
	roll := adapter.Role(dawport.CapPunch).(dawport.Puncher)
	player := exec.Command("paplay", "--device="+sink, loop)
	e.must(player.Start())
	res, err := roll.Roll(e.ctx, "edits-roll", 4)
	r.check("Roll answers OK", err == nil && res.OK, "%+v, %v", res, err)
	r.note("Result", "steps %q, undoSteps %d (the recording's undo point is added when it stops)", res.Steps, res.UndoSteps)
	time.Sleep(6 * time.Second) // no command meanwhile: a batch command ends the recording (A3-T15)
	e.must(e.client.Stop(e.ctx))
	_ = player.Wait()
	after := e.exportTrack("roll-after.wav", 0, 0, 12)
	same := true
	was, now := before.window(0, 2.5), after.window(0, 2.5)
	for i, v := range was {
		if i >= len(now) || math.Abs(v-now[i]) > 1e-4 {
			same = false
		}
	}
	r.check("the audio before the roll's pre-roll (2.5 s) is unchanged", same, "")
	hz := edHz(after.window(4.4, 6.0), after.rate)
	r.check("the audio after the roll point is the new 880 Hz signal", math.Abs(hz-880) < 30, "%.0f Hz at 4.4 to 6 s", hz)
	rows, _ := adapter.Backups().List(e.ctx)
	r.check("the roll made one backup, from the roll point", len(rows) == 1 && math.Abs(rows[0].Start-2) < 0.01 || len(rows) == 1 && rows[0].Start >= 2-0.01, "%+v", rows)
	e.undo()
	undone := e.exportTrack("roll-undone.wav", 0, 0, 8)
	r.check("one Undo takes the roll back (the 8 s of audio are the original again)", string(undone.pcm) == string(before.pcm), "")
}

// ---- A3-T18, A3-T19: cut, stack and un-stack ---------------------------------------------------------------------------------------

func TestRealEditsCutAndStack(t *testing.T) {
	e := newEdEnv(t, 30*time.Second)
	r := edNewReport(t, "A3-T18g", "Cut (close and gap) and stack/un-stack through the adapter")
	defer r.finish()
	folder := t.TempDir()
	adapter := NewWithBackups(e.client, BackupsConfig{Project: func() string { return folder }, Window: 2})
	cut := adapter.Role(dawport.CapCutRange).(dawport.RangeCutter)
	stack := adapter.Role(dawport.CapStackTakes).(dawport.TakeStacker)
	rng := func(a, b float64) dawport.RangeRequest {
		return dawport.RangeRequest{ChapterID: "ch", ItemGUID: "edits-chapter", Start: a, End: b, Words: 2}
	}

	// A close-up cut: the track ends one second sooner and the audio after it moved up.
	e.reset()
	e.importSteps("edits-chapter", 12, 1)
	orig := e.exportTrack("orig.wav", 0, 0, 12)
	res, err := cut.DeleteRange(e.ctx, dawport.DeleteRangeRequest{RangeRequest: rng(2, 3), Mode: dawport.CutClose})
	r.check("DeleteRange close answers OK", err == nil && res.OK, "%+v, %v", res, err)
	tr, _ := e.track("edits-chapter")
	r.check("the track ends at 11 s (Sync-Lock is off, as on a fresh Audacity)", math.Abs(tr.End-11) < 0.01, "ends at %.3f s", tr.End)
	closed := e.exportTrack("closed.wav", 0, 0, 11)
	hz := edHz(closed.window(2.1, 2.9), closed.rate)
	r.check("2 to 3 s now holds what was at 3 to 4 s (420 Hz)", math.Abs(hz-420) < 25, "%.0f Hz", hz)
	r.note("undo points", "the adapter reports %d for a close-up cut", res.UndoSteps)
	e.undo()
	back := e.exportTrack("closed-undone.wav", 0, 0, 12)
	r.check("one Undo takes the close-up cut back, as the adapter reports", res.UndoSteps == 1 && string(back.pcm) == string(orig.pcm), "undoSteps %d", res.UndoSteps)

	// A gap: SplitDelete only.
	res, err = cut.DeleteRange(e.ctx, dawport.DeleteRangeRequest{RangeRequest: rng(5, 5.5), Mode: dawport.CutGap})
	gap := e.exportTrack("gap.wav", 0, 0, 12)
	tr, _ = e.track("edits-chapter")
	r.check("DeleteRange gap leaves the track 12 s with 5 to 5.5 s silent", err == nil && res.OK && math.Abs(tr.End-12) < 0.01 && edRMSdB(gap.window(5.05, 5.45)) < -90, "%+v end %.3f silence %.1f dB", res, tr.End, edRMSdB(gap.window(5.05, 5.45)))

	// Stack 8 to 9 s on 6 s (the audio from 9 s moves up by 2 s: the chapter ends at 10 s), then un-stack.
	e.reset()
	e.importSteps("edits-chapter", 12, 1)
	orig = e.exportTrack("orig2.wav", 0, 0, 12)
	req := dawport.StackRequest{ChapterID: "ch", Shift: -2, Groups: []dawport.StackGroup{{
		PassageID: "p", ItemGUID: "edits-chapter", Base: "take-1", Moves: []dawport.StackMove{{TakeID: "take-2", From: 8, To: 6, Len: 1}},
	}}}
	res, err = stack.StackTakes(e.ctx, req)
	r.check("StackTakes answers OK", err == nil && res.OK, "%+v, %v", res, err)
	r.note("StackTakes result", "undoSteps %d, steps %q", res.UndoSteps, res.Steps)
	tr, _ = e.track("edits-chapter")
	r.check("the chapter is 2 s shorter and not muted", math.Abs(tr.End-10) < 0.05 && !tr.Muted, "ends at %.3f s, muted %v", tr.End, tr.Muted)
	tracks, _ := e.client.Tracks(e.ctx)
	var take audacitybridge.TrackInfo
	for _, x := range tracks {
		if strings.HasPrefix(x.Name, "Narration Studio take take-2") {
			take = x
		}
	}
	r.check("the take track exists and is muted", take.Name != "" && take.Muted, "%+v", take)
	if take.Name != "" {
		// A muted track is left out of an export, so it is unmuted for the read and muted again.
		e.must(e.client.SetTrackMute(e.ctx, take.Index, false))
		w := e.exportTrack("take.wav", take.Index, 6, 7)
		e.must(e.client.SetTrackMute(e.ctx, take.Index, true))
		r.check("the take track holds the later read (second 8: 620 Hz) at 6 to 7 s", math.Abs(edHz(w.window(0.1, 0.9), w.rate)-620) < 25, "%.0f Hz", edHz(w.window(0.1, 0.9), w.rate))
	}
	stacked := e.exportTrack("stacked.wav", 0, 0, 10)
	r.check("the audio after the stack: 6 to 7 s is still the first read (540 Hz), 7 to 8 s is what followed the reads (660 Hz)",
		math.Abs(edHz(stacked.window(6.1, 6.9), stacked.rate)-500) < 60 && math.Abs(edHz(stacked.window(7.1, 7.9), stacked.rate)-660) < 30,
		"%.0f Hz and %.0f Hz", edHz(stacked.window(6.1, 6.9), stacked.rate), edHz(stacked.window(7.1, 7.9), stacked.rate))
	un := dawport.StackRequest{ChapterID: "ch", Shift: 2, Groups: []dawport.StackGroup{{
		PassageID: "p", ItemGUID: "edits-chapter", Base: "take-1", Moves: []dawport.StackMove{{TakeID: "take-2", From: 6, To: 8, Len: 1}},
	}}}
	res, err = stack.UnstackTakes(e.ctx, un)
	r.check("UnstackTakes answers OK", err == nil && res.OK, "%+v, %v", res, err)
	tr, _ = e.track("edits-chapter")
	back = e.exportTrack("unstacked.wav", 0, 0, 12)
	r.check("the chapter is 12 s again and sample-for-sample the original", math.Abs(tr.End-12) < 0.05 && string(back.pcm) == string(orig.pcm), "ends at %.3f s", tr.End)
	_, still := e.track(takeTrackName("take-2", 8, "x"))
	r.check("the take track is gone", !still && func() bool {
		ts, _ := e.client.Tracks(e.ctx)
		for _, x := range ts {
			if strings.HasPrefix(x.Name, "Narration Studio take") {
				return false
			}
		}
		return true
	}(), "")
}

// ---- A3-T20: macros ----------------------------------------------------------------------------------------------------------------

func TestRealEditsMacro(t *testing.T) {
	e := newEdEnv(t, 30*time.Second)
	r := edNewReport(t, "A3-T20g", "A macro on a range through the adapter (the macro files are in the profile run.sh builds)")
	defer r.finish()
	folder := t.TempDir()
	adapter := NewWithBackups(e.client, BackupsConfig{Project: func() string { return folder }, Window: 2})
	fx := adapter.Role(dawport.CapFXRange).(dawport.RangeFXApplier)
	for _, name := range []string{"Narration-Test", "Narration Spaced Name"} {
		e.reset()
		e.importSteps("edits-fx", 8, 1)
		base := e.exportTrack("fx0.wav", 0, 0, 8)
		res, err := fx.ApplyFXToRange(e.ctx, dawport.FXRangeRequest{
			RangeRequest: dawport.RangeRequest{ChapterID: "ch", ItemGUID: "edits-fx", Start: 3, End: 5, Words: 2}, ChainID: name, ChainName: name,
		})
		r.check(fmt.Sprintf("ApplyFXToRange with the macro %q answers OK", name), err == nil && res.OK, "%+v, %v", res, err)
		w := e.exportTrack("fx1.wav", 0, 0, 8)
		inside, outside := edRMSdB(w.window(3.2, 4.8)), edRMSdB(base.window(3.2, 4.8))
		r.check(fmt.Sprintf("the macro %q changed the range and only the range", name), math.Abs(inside-outside) > 1.5 && string(w.pcm[:2*44100*2]) == string(base.pcm[:2*44100*2]),
			"range %.1f dB against %.1f dB before", inside, outside)
		r.note("undo points", "the adapter reports %d (a split and a macro, which Audacity counts as one)", res.UndoSteps)
		e.undo()
		e.undo()
		undone := e.exportTrack("fx2.wav", 0, 0, 8)
		r.check(fmt.Sprintf("two Undos take %q and the split back", name), string(undone.pcm) == string(base.pcm), "")
	}
	// A name Audacity has no macro for answers Failed! and opens no dialog.
	e.reset()
	e.importSteps("edits-fx", 8, 1)
	res, err := fx.ApplyFXToRange(e.ctx, dawport.FXRangeRequest{
		RangeRequest: dawport.RangeRequest{ChapterID: "ch", ItemGUID: "edits-fx", Start: 3, End: 5, Words: 2}, ChainID: "NoSuchMacro", ChainName: "NoSuchMacro",
	})
	r.check("a macro that does not exist is an error, not a stall", err != nil && !res.OK, "%+v, %v", res, err)
	r.note("half-applied", "the backup and the Split were made before the macro was found missing: the audio is intact, the clip is split")
}

// ---- A3-T21: lowered stretches and repaired clicks ---------------------------------------------------------------------------------

func TestRealEditsGainAndClicks(t *testing.T) {
	e := newEdEnv(t, 5*time.Second)
	r := edNewReport(t, "A3-T21g", "ReduceRangeGain and RepairClick through the adapter")
	defer r.finish()
	folder := t.TempDir()
	adapter := NewWithBackups(e.client, BackupsConfig{Project: func() string { return folder }, Window: 2})
	gain := adapter.Role(dawport.CapRangeGain).(dawport.RangeGainReducer)
	click := adapter.Role(dawport.CapClickRepair).(dawport.ClickRepairer)

	e.reset()
	e.importSteps("edits-gain", 6, 1)
	base := e.exportTrack("g0.wav", 0, 0, 6)
	res, err := gain.ReduceRangeGain(e.ctx, dawport.RangeGainRequest{ChapterID: "ch", ItemGUID: "edits-gain", TakeGUID: "t", ReduceDB: 6,
		Stretches: []dawport.GainStretch{{Start: 2, End: 3}}})
	r.check("ReduceRangeGain answers OK", err == nil && res.OK, "%+v, %v", res, err)
	w := e.exportTrack("g1.wav", 0, 0, 6)
	drop := edRMSdB(base.window(2.2, 2.8)) - edRMSdB(w.window(2.2, 2.8))
	r.check("the stretch is 6 dB lower (within 0.5 dB)", math.Abs(drop-6) < 0.5, "%.2f dB", drop)
	r.note("undo points", "the adapter reports %d (Amplify adds none: the next Undo takes back the edit before it)", res.UndoSteps)

	// A real click: an 8-sample spike over a quiet tone.
	e.reset()
	e.importSteps("edits-click", 6, 1, 3.0)
	spiky := e.exportTrack("c0.wav", 0, 0, 6)
	res, err = click.RepairClick(e.ctx, dawport.ClickRepairRequest{ChapterID: "ch", ItemGUID: "edits-click", TakeGUID: "t", Clicks: []dawport.Click{{Start: 3.0, End: 3.0002}}})
	r.check("RepairClick on a real spike answers OK", err == nil && res.OK, "%+v, %v", res, err)
	fixed := e.exportTrack("c1.wav", 0, 0, 6)
	r.check("the spike is gone", edPeak(spiky.window(2.995, 3.01)) > 0.8 && edPeak(fixed.window(2.995, 3.01)) < 0.3, "peak %.3f -> %.3f", edPeak(spiky.window(2.995, 3.01)), edPeak(fixed.window(2.995, 3.01)))

	// A click that is not one Click Removal finds: the effect opens a modal "Algorithm not effective" and the pipe stalls.
	e.reset()
	e.importSteps("edits-noclick", 6, 1)
	res, err = click.RepairClick(e.ctx, dawport.ClickRepairRequest{ChapterID: "ch", ItemGUID: "edits-noclick", TakeGUID: "t", Clicks: []dawport.Click{{Start: 3.0, End: 3.001}}})
	stalled := err != nil
	r.check("RepairClick where Click Removal finds no click stalls on a modal dialog and the client times out", stalled && !res.OK,
		"%+v, %v (the adapter has no way to tell a dialog from a slow effect: the narrator clicks OK in Audacity)", res, err)
	edDismissDialogs()
	time.Sleep(time.Second)
	r.check("a click on OK frees the pipe", e.client.Ping(e.ctx) == nil, "")
}
