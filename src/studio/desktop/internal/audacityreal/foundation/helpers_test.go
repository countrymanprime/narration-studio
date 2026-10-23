//go:build audacityreal && linux

package foundation

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-studio/shell/internal/audacityreal"
)

// rig is one running Audacity, a raw pipe to it and the repository's client.
type rig struct {
	t      *testing.T
	e      audacityreal.Env
	r      *audacityreal.Rec
	p      *audacityreal.Proc
	pipe   *audacityreal.Pipe
	client *audacitybridge.Client
}

// newRig launches Audacity on a copy of the primed profile.
func newRig(t *testing.T, id, title string) *rig {
	t.Helper()
	e := audacityreal.LoadEnv(t)
	rec := e.Begin(t, id, title)
	g := &rig{t: t, e: e, r: rec}
	g.p = e.Launch(t, strings.ToLower(id))
	g.client = audacityreal.NewClient(20 * time.Second)
	t.Cleanup(func() { _ = g.client.Close(); g.closePipe() })
	return g
}

func (g *rig) closePipe() {
	if g.pipe != nil {
		g.pipe.Close()
		g.pipe = nil
	}
}

// send writes one command and returns the exchange. A failed or timed-out command drops the connection, as the client does.
func (g *rig) send(cmd string) audacityreal.Exchange { return g.sendWithin(30*time.Second, cmd) }

func (g *rig) sendWithin(limit time.Duration, cmd string) audacityreal.Exchange {
	g.t.Helper()
	if g.pipe == nil {
		p, err := audacityreal.DialPipe()
		if err != nil {
			g.r.Fatal("dial the pipe", err.Error())
		}
		g.pipe = p
	}
	ex := g.pipe.Send(limit, cmd)
	if !ex.Complete {
		g.closePipe()
	}
	return ex
}

// must sends cmd and fails the test unless it answered OK.
func (g *rig) must(cmd string) audacityreal.Exchange {
	g.t.Helper()
	ex := g.send(cmd)
	if !ex.OK {
		g.r.Fatal("command "+cmd, fmt.Sprintf("complete=%v failed=%v after %v: %s", ex.Complete, ex.Failed, ex.Took.Round(time.Millisecond), audacityreal.Visible(ex.Raw)))
	}
	return ex
}

// jsonInfo reads GetInfo with Format=JSON and decodes the reply's body.
func (g *rig) jsonInfo(kind string) any {
	g.t.Helper()
	ex := g.must("GetInfo: Type=" + kind + " Format=JSON")
	var v any
	if err := json.Unmarshal([]byte(ex.Body()), &v); err != nil {
		g.r.Fatal("GetInfo "+kind+" is JSON", fmt.Sprintf("%v: %s", err, audacityreal.Visible(ex.Raw)))
	}
	return v
}

// fingerprint is the matrix's N3b: a hash of GetInfo Tracks without the selected and focused keys, Clips and Labels.
func (g *rig) fingerprint() string {
	g.t.Helper()
	tracks, _ := g.jsonInfo("Tracks").([]any)
	for _, tr := range tracks {
		if m, ok := tr.(map[string]any); ok {
			delete(m, "selected")
			delete(m, "focused")
		}
	}
	return hashJSON(tracks, g.jsonInfo("Clips"), g.jsonInfo("Labels"))
}

func hashJSON(parts ...any) string {
	h := sha256.New()
	for _, p := range parts {
		b, _ := json.Marshal(p) // map keys are sorted by encoding/json, so the hash does not depend on Audacity's key order
		h.Write(b)
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))[:12]
}

func (g *rig) tracks() []audacitybridge.TrackInfo {
	g.t.Helper()
	tr, err := g.client.Tracks(context.Background())
	if err != nil {
		g.r.Fatal("read Tracks", err.Error())
	}
	return tr
}

func (g *rig) labels() []audacitybridge.LabelInfo {
	g.t.Helper()
	l, err := g.client.Labels(context.Background())
	if err != nil {
		g.r.Fatal("read Labels", err.Error())
	}
	return l
}

func (g *rig) clips() []audacitybridge.ClipInfo {
	g.t.Helper()
	c, err := g.client.Clips(context.Background())
	if err != nil {
		g.r.Fatal("read Clips", err.Error())
	}
	return c
}

// selection reads GetInfo: Type=Selection.
func (g *rig) selection() (start, end float64) {
	g.t.Helper()
	ex := g.must("GetInfo: Type=Selection Format=JSON")
	var s struct{ Start, End float64 }
	if err := json.Unmarshal([]byte(ex.Body()), &s); err != nil {
		g.r.Fatal("Selection is JSON", fmt.Sprintf("%v: %s", err, audacityreal.Visible(ex.Raw)))
	}
	return s.Start, s.End
}

// importFile imports a file by plain string command (the shipped Import needs a C:/ path; see the CI note, finding 3).
func (g *rig) importFile(path string) audacityreal.Exchange {
	g.t.Helper()
	return g.must(fmt.Sprintf(`Import2: Filename="%s"`, path))
}

func within(got, want, tol float64) bool { return math.Abs(got-want) <= tol }

func sortedKeys(m map[string]bool) []string {
	var k []string
	for s := range m {
		k = append(k, s)
	}
	sort.Strings(k)
	return k
}

// copyProfile replaces dst with a copy of a profile folder.
func copyProfile(src, dst string) (string, error) {
	if err := os.RemoveAll(dst); err != nil {
		return "", err
	}
	out, err := exec.Command("cp", "-a", src, dst).CombinedOutput()
	return string(out), err
}

func labelText(s string) audacitybridge.LabelEdit { return audacitybridge.LabelEdit{Text: &s} }

func labelEdit(text *string, start, end *float64) audacitybridge.LabelEdit {
	return audacitybridge.LabelEdit{Text: text, Start: start, End: end}
}

// relaunch ends the running Audacity and starts a fresh one on a copy of the primed profile with prefs set.
func (g *rig) relaunch(name string, prefs map[string]string, args ...string) {
	g.t.Helper()
	g.closePipe()
	_ = g.client.Close()
	g.p.Kill()
	g.p = g.e.LaunchPrefs(g.t, name, prefs, args...)
	g.client = audacityreal.NewClient(20 * time.Second)
}

// noDialogs records, as a row, that the project window is the only one open.
func (g *rig) noDialogs(step string, names ...string) {
	g.t.Helper()
	var titles []string
	for _, w := range g.e.Dialogs(names...) {
		titles = append(titles, fmt.Sprintf("%q", w.Title))
	}
	g.r.Check(step+": no dialog is open", len(titles) == 0, strings.Join(titles, ", "))
}
