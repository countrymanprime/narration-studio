//go:build audacityreal && linux

// The same client and adapter the app ships, driven against a real Audacity 3 on Linux (Xvfb, a PulseAudio null sink) over
// mod-script-pipe's FIFOs. It is a prototype for docs/research/real-audacity3-ci-integration.md: the app is Windows-only, so
// PipeTransport has no Linux pipe and this file carries a test-only FIFO transport. It sits behind the audacityreal build tag and
// the NU_AUDACITY_* variables scripts/research/real-audacity3-ci/run.sh sets, so no ordinary test run touches an Audacity.
//
//	scripts/research/real-audacity3-ci/run.sh
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
	"testing"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/audacitybridge"
)

// fifoTransport opens mod-script-pipe's two FIFOs in /tmp, to-Audacity first as the Windows transport does. Audacity's server
// blocks in open(2) on each until a client opens the other end, so Dial opens on a goroutine and gives up at ctx's end.
func fifoTransport() audacitybridge.Transport {
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
		return fifoConn{r: r, w: w}, nil
	})
}

type fifoConn struct{ r, w *os.File }

func (c fifoConn) Read(p []byte) (int, error)  { return c.r.Read(p) }
func (c fifoConn) Write(p []byte) (int, error) { return c.w.Write(p) }
func (c fifoConn) Close() error                { return errors.Join(c.r.Close(), c.w.Close()) }

// A Linux FIFO ends a command at the line feed; the Windows pipe's CR, LF and NUL (audacitybridge.LineEnd) is not used.
func realClient() *audacitybridge.Client {
	return audacitybridge.New(fifoTransport(), audacitybridge.Options{LineEnd: "\n", Timeout: 20 * time.Second})
}

// wavInfo is what a PCM WAV file says about itself, and the root mean square of its samples as a fraction of full scale.
type wavInfo struct {
	Rate, Channels, Bits int
	Seconds, RMS         float64
}

func readWAV(path string) (wavInfo, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return wavInfo{}, err
	}
	if len(b) < 12 || string(b[0:4]) != "RIFF" || string(b[8:12]) != "WAVE" {
		return wavInfo{}, fmt.Errorf("%s is not a RIFF WAVE file", path)
	}
	var info wavInfo
	var data []byte
	for p := 12; p+8 <= len(b); {
		id, size := string(b[p:p+4]), int(binary.LittleEndian.Uint32(b[p+4:]))
		body := b[p+8 : min(p+8+size, len(b))]
		switch id {
		case "fmt ":
			info.Channels = int(binary.LittleEndian.Uint16(body[2:]))
			info.Rate = int(binary.LittleEndian.Uint32(body[4:]))
			info.Bits = int(binary.LittleEndian.Uint16(body[14:]))
		case "data":
			data = body
		}
		p += 8 + size + size%2
	}
	if info.Rate == 0 || info.Bits != 16 && info.Bits != 32 {
		return wavInfo{}, fmt.Errorf("%s: unsupported WAV format %+v", path, info)
	}
	width := info.Bits / 8
	n := len(data) / width
	info.Seconds = float64(n/info.Channels) / float64(info.Rate)
	var sum float64
	for i := range n {
		var v float64
		if width == 2 {
			v = float64(int16(binary.LittleEndian.Uint16(data[i*2:]))) / 32768
		} else {
			v = float64(math.Float32frombits(binary.LittleEndian.Uint32(data[i*4:])))
		}
		sum += v * v
	}
	if n > 0 {
		info.RMS = math.Sqrt(sum / float64(n))
	}
	return info, nil
}

// markerFile is the LibriVox fixture's committed alignment (tests/fixtures/audio/librivox-alice/alignment/*.markers.json).
type markerFile struct {
	DurationS  float64 `json:"duration_s"`
	Paragraphs []struct {
		ID     string  `json:"id"`
		StartS float64 `json:"start_s"`
		EndS   float64 `json:"end_s"`
	} `json:"paragraphs"`
}

func requireEnv(t *testing.T, name string) string {
	t.Helper()
	v := os.Getenv(name)
	if v == "" {
		t.Fatalf("%s is not set: the audacityreal tag is opt-in, so run scripts/research/real-audacity3-ci/run.sh, which sets it", name)
	}
	return v
}

func rawInfo(ctx context.Context, c *audacitybridge.Client, kind string, into any) error {
	reply, err := c.Do(ctx, audacitybridge.NewCommand("GetInfo").Choice("Type", kind).Choice("Format", "JSON"))
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(reply.Text()), into)
}

// Import2 and Export2 are sent as plain string commands. audacitybridge's Path refuses anything but a `C:/...` path (the app is
// Windows-only, D72), and Audacity on Linux does not resolve one, so the adapter's Import, Export and ExportChapter cannot reach a
// Linux Audacity. Their guards stay covered by the unit tests; this file covers what Audacity does with the commands.
func importFile(ctx context.Context, c *audacitybridge.Client, path string) error {
	_, err := c.Do(ctx, audacitybridge.NewCommand("Import2").String("Filename", path))
	return err
}

func exportFile(ctx context.Context, c *audacitybridge.Client, path string, channels int) error {
	_, err := c.Do(ctx, audacitybridge.NewCommand("Export2").String("Filename", path).Int("NumChannels", channels))
	return err
}

// waitForProject polls until Audacity has a project window: its pipe comes up first and answers a bare empty line (ErrNoProject)
// until the window exists.
func waitForProject(ctx context.Context, t *testing.T, c *audacitybridge.Client, limit time.Duration) {
	t.Helper()
	start := time.Now()
	for {
		_, err := c.Tracks(ctx)
		if err == nil {
			t.Logf("project window answered %v after the pipe was reachable", time.Since(start).Round(100*time.Millisecond))
			return
		}
		if time.Since(start) > limit {
			t.Fatalf("no project window after %v: %v", limit, err)
		}
		time.Sleep(500 * time.Millisecond)
	}
}

func within(got, want, tol float64) bool { return math.Abs(got-want) <= tol }

// TestRealAudacityChapter imports a pinned LibriVox chapter into an empty project and drives the adapter through the actions a
// review needs: identify the audio, labels for paragraphs, read the selection, navigate, export a label's range to WAV and MP3, undo.
func TestRealAudacityChapter(t *testing.T) {
	fixture := requireEnv(t, "NU_AUDACITY_FIXTURE")
	markersPath := requireEnv(t, "NU_AUDACITY_MARKERS")
	out := requireEnv(t, "NU_AUDACITY_OUT")
	var markers markerFile
	raw, err := os.ReadFile(markersPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &markers); err != nil || len(markers.Paragraphs) < 3 {
		t.Fatalf("markers: %v, %d paragraphs", err, len(markers.Paragraphs))
	}
	ctx := context.Background()
	client := realClient()
	defer func() { _ = client.Close() }()
	session := NewSession(client)

	t.Run("A1 ping", func(t *testing.T) {
		if err := client.Ping(ctx); err != nil {
			t.Fatal(err)
		}
		waitForProject(ctx, t, client, 30*time.Second)
	})
	t.Run("A2 the project is empty", func(t *testing.T) {
		info, err := session.Project(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if len(info.Tracks) != 0 || info.Labels != 0 {
			t.Fatalf("not an empty project: %+v", info)
		}
	})
	t.Run("A3 import the LibriVox chapter", func(t *testing.T) {
		if err := importFile(ctx, client, fixture); err != nil {
			t.Fatal(err)
		}
		clips, err := client.Clips(ctx)
		if err != nil || len(clips) != 1 {
			t.Fatalf("clips %+v, err %v", clips, err)
		}
		if !within(clips[0].End-clips[0].Start, markers.DurationS, 0.01) {
			t.Fatalf("clip is %.3f s, the alignment says %.3f s", clips[0].End-clips[0].Start, markers.DurationS)
		}
	})

	// Chapter and line markers: the first three paragraphs, as findings.
	var findings []Finding
	for _, p := range markers.Paragraphs[:3] {
		findings = append(findings, Finding{ID: p.ID, Start: p.StartS, End: p.EndS, Words: "paragraph " + p.ID})
	}
	t.Run("A4 labels for paragraphs, read back", func(t *testing.T) {
		res, err := session.ImportFindings(ctx, findings)
		if err != nil || len(res.Added) != 3 {
			t.Fatalf("added %v, err %v", res.Added, err)
		}
		got, err := session.FindingLabels(ctx)
		if err != nil || len(got) != 3 {
			t.Fatalf("labels %+v, err %v", got, err)
		}
		for i, f := range findings {
			l := got[i]
			if l.ID != f.ID || !within(l.Label.Start, f.Start, 0.01) || !within(l.Label.End, f.End, 0.01) {
				t.Errorf("label %d is %s %.3f-%.3f, want %s %.3f-%.3f", i, l.ID, l.Label.Start, l.Label.End, f.ID, f.Start, f.End)
			}
		}
		again, err := session.ImportFindings(ctx, findings)
		if err != nil || len(again.Added) != 0 || len(again.Skipped) != 3 {
			t.Errorf("a second import added %v skipped %v, err %v", again.Added, again.Skipped, err)
		}
	})
	t.Run("A5 go to a label and read the selection back", func(t *testing.T) {
		if _, err := session.GoToFinding(ctx, findings[1].ID); err != nil {
			t.Fatal(err)
		}
		var sel struct{ Start, End float64 }
		if err := rawInfo(ctx, client, "Selection", &sel); err != nil {
			t.Fatal(err)
		}
		if !within(sel.Start, findings[1].Start, 0.01) || !within(sel.End, findings[1].End, 0.01) {
			t.Fatalf("selection %+v, want %.3f-%.3f", sel, findings[1].Start, findings[1].End)
		}
	})
	t.Run("A6 export a label's range to WAV, as ExportChapter does", func(t *testing.T) {
		// Session.ExportChapter cannot run here (see importFile). This is its sequence: selectAudioForExport, SelectTime, Export, after
		// the state the adapter's own ImportFindings left (only the label track selected).
		f := findings[0]
		if _, err := session.selectAudioForExport(ctx); err != nil {
			t.Fatal(err)
		}
		if err := client.SelectTime(ctx, f.Start, f.End); err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(out, "paragraph-one-as-exportchapter.wav")
		if err := exportFile(ctx, client, path, 1); err != nil {
			t.Fatal(err)
		}
		info, err := readWAV(path)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("%s: %+v", path, info)
		if !within(info.Seconds, f.End-f.Start, 0.02) || info.RMS < 0.01 {
			t.Errorf("the export is %.3f s at RMS %.5f, want %.3f s of speech", info.Seconds, info.RMS, f.End-f.Start)
		}
	})
	t.Run("A6b export the label's range with the audio track selected", func(t *testing.T) {
		f := findings[0]
		if err := client.SelectTracks(ctx, 0, 1); err != nil {
			t.Fatal(err)
		}
		if err := client.SelectTime(ctx, f.Start, f.End); err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(out, "paragraph-one.wav")
		if err := exportFile(ctx, client, path, 1); err != nil {
			t.Fatal(err)
		}
		info, err := readWAV(path)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("%s: %+v", path, info)
		if !within(info.Seconds, f.End-f.Start, 0.02) {
			t.Errorf("exported %.3f s, want %.3f s", info.Seconds, f.End-f.Start)
		}
		if info.RMS < 0.01 {
			t.Errorf("the export is silent (RMS %.5f)", info.RMS)
		}
	})
	t.Run("A7 export the same range to MP3", func(t *testing.T) {
		f := findings[0]
		if err := client.SelectTracks(ctx, 0, 1); err != nil {
			t.Fatal(err)
		}
		if err := client.SelectTime(ctx, f.Start, f.End); err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(out, "paragraph-one.mp3")
		if err := exportFile(ctx, client, path, 1); err != nil {
			t.Fatal(err)
		}
		st, err := os.Stat(path)
		if err != nil || st.Size() < 1000 {
			t.Fatalf("mp3 %v, err %v", st, err)
		}
	})
	t.Run("A8 Undo takes back the last label edit", func(t *testing.T) {
		if _, err := session.MarkReviewed(ctx, findings[2].ID); err != nil {
			t.Fatal(err)
		}
		reviewedNow, err := session.FindingLabels(ctx)
		if err != nil || !reviewed(reviewedNow, findings[2].ID) {
			t.Fatalf("not marked reviewed: %+v, err %v", reviewedNow, err)
		}
		if _, err := client.Do(ctx, audacitybridge.NewCommand("Undo")); err != nil {
			t.Fatal(err)
		}
		undone, err := session.FindingLabels(ctx)
		if err != nil || reviewed(undone, findings[2].ID) || len(undone) != 3 {
			t.Fatalf("Undo did not restore the label: %+v, err %v", undone, err)
		}
	})
	t.Run("A9 a track that is not selected exports an empty file", func(t *testing.T) {
		if err := client.SelectNone(ctx); err != nil {
			t.Fatal(err)
		}
		if err := client.SelectTime(ctx, 22, 24); err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(out, "nothing-selected.wav")
		if err := exportFile(ctx, client, path, 1); err != nil {
			t.Fatal(err)
		}
		info, err := readWAV(path)
		t.Logf("with no track selected Export2 answered OK and wrote %+v, err %v", info, err)
		if err != nil || info.Seconds > 0.01 {
			t.Errorf("Audacity no longer writes an empty file when no track is selected (%+v, %v): the export rule in the research note changed", info, err)
		}
	})
}

// TestRealAudacityRecord records from the PulseAudio null sink's monitor while the pinned chapter's first seconds play into the
// sink (a loopback), then stops, and checks the new track holds audio.
func TestRealAudacityRecord(t *testing.T) {
	playWAV := requireEnv(t, "NU_AUDACITY_LOOPBACK_WAV")
	sink := requireEnv(t, "NU_AUDACITY_SINK")
	out := requireEnv(t, "NU_AUDACITY_OUT")
	ctx := context.Background()
	client := realClient()
	defer func() { _ = client.Close() }()
	if err := client.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	waitForProject(ctx, t, client, 30*time.Second)
	if _, err := client.Do(ctx, audacitybridge.NewCommand("Record1stChoice")); err != nil {
		t.Fatal(err)
	}
	time.Sleep(1500 * time.Millisecond)
	play := exec.Command("paplay", "--device="+sink, playWAV)
	if err := play.Run(); err != nil {
		t.Fatalf("paplay: %v", err)
	}
	time.Sleep(500 * time.Millisecond)
	if err := client.Stop(ctx); err != nil {
		t.Fatal(err)
	}
	tracks, err := client.Tracks(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var audio []audacitybridge.TrackInfo
	for _, tr := range tracks {
		if tr.Kind == "wave" {
			audio = append(audio, tr)
		}
	}
	if len(audio) != 1 {
		t.Fatalf("want one recorded track, tracks are %+v", tracks)
	}
	t.Logf("recorded %.2f s, %d channels", audio[0].End, audio[0].Channels)
	if audio[0].End < 3 || audio[0].End > 12 {
		t.Errorf("recorded %.2f s; expected about the clip plus the 2 s around it", audio[0].End)
	}
	if err := client.SelectTracks(ctx, audio[0].Index, 1); err != nil {
		t.Fatal(err)
	}
	if err := client.SelectTime(ctx, 0, audio[0].End); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(out, "recorded.wav")
	if err := exportFile(ctx, client, path, 2); err != nil {
		t.Fatal(err)
	}
	info, err := readWAV(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("%+v", info)
	if info.RMS < 0.005 {
		t.Errorf("the recording is silent (RMS %.5f)", info.RMS)
	}
}

func reviewed(ls []FindingLabel, id string) bool {
	for _, l := range ls {
		if l.ID == id {
			return l.Reviewed
		}
	}
	return false
}
