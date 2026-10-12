package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/audacity"
)

// DawBackupAround, DawRestoreBackup and DawBackups (SN-D82), and the two backups settings. What Audacity does with a backup is
// dawport/audacity's own (backups_test.go, backups_prune_test.go); these cover the host's wiring: the resolver first, the window
// and track resolved on the host from ids, the role's answer, the table read back, and the prune on open.

const backupLabelRoll = "Roll at ¶ 3"

type fakeBackupKeeper struct {
	backedUp []dawport.BackupRequest
	restored []string
	pruned   []time.Duration
	gone     bool
	answer   dawport.Result
	err      error
}

func (f *fakeBackupKeeper) BackupAround(_ context.Context, request dawport.BackupRequest) (dawport.Result, error) {
	f.backedUp = append(f.backedUp, request)
	return f.answer, f.err
}

func (f *fakeBackupKeeper) RestoreBackup(_ context.Context, id string) (dawport.Result, error) {
	f.restored = append(f.restored, id)
	return f.answer, f.err
}

func (f *fakeBackupKeeper) Prune(_ context.Context, retention time.Duration) ([]string, error) {
	f.pruned = append(f.pruned, retention)
	return nil, f.err
}

func (f *fakeBackupKeeper) replaced() bool { return f.gone }

func (f *fakeBackupKeeper) sent() int { return len(f.backedUp) + len(f.restored) }

// What dawport/audacity's Backups answers for a 260 s window.
func backedUpInAudacity() dawport.Result {
	return dawport.OK("Backed up 260 s of audio in Audacity.", false)
}
func restoredInAudacity() dawport.Result {
	return dawport.OK("Restored 260 s of audio from the backup in Audacity.", true)
}

// backupHost is deleteRangeHost (a project whose chapter c-0001 has a stored alignment) on a launch of kind, with role as the
// backups role and the backups toggle set. bridge says whether the host reports a connection, which on an Audacity launch stands
// for the pipe the host does not open from a page yet.
func backupHost(t *testing.T, kind string, bridge bool, role dawport.BackupKeeper, toggle string) *Host {
	t.Helper()
	reach := liveReachability()
	if !bridge {
		reach = daw.NewReachability(nil)
	}
	host := deleteRangeHost(t, kind, reach, nil, "")
	if toggle != "" {
		if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapBackups): &toggle}); err != nil {
			t.Fatal(err)
		}
	}
	host.mu.Lock()
	if !bridge {
		host.bridge = nil
	}
	host.backupKeeper = role
	host.mu.Unlock()
	return host
}

// fixedTrack is a backup's track source naming the chapter's track "Chapter 1".
func fixedTrack(string) (string, *dawport.Result, error) { return "Chapter 1", nil, nil }

// bindings-answer-a-dawresult: the tokens resolve on the host to their project seconds, the chapter's track is the host's, and
// the role is sent those with the label; the answer is the role's DawResult.
func TestDawBackupAroundSendsTheResolvedWindowAndAnswersADawResult(t *testing.T) {
	role := &fakeBackupKeeper{answer: backedUpInAudacity()}
	host := backupHost(t, "Audacity", true, role, "on")
	sources := backupSourcesIn(host.services())
	sources.track = fixedTrack

	got, err := dawBackupAroundIn(t.Context(), "Audacity", available(), role, sources, "c-0001", 0, 0, backupLabelRoll)

	if err != nil || !reflect.DeepEqual(got, backedUpInAudacity()) {
		t.Fatalf("DawBackupAround = %+v, %v", got, err)
	}
	want := []dawport.BackupRequest{{GUID: "Chapter 1", ChapterID: "c-0001", Start: 1, End: 1.5, Label: backupLabelRoll}}
	if !reflect.DeepEqual(role.backedUp, want) {
		t.Fatalf("sent %+v, want %+v", role.backedUp, want)
	}
}

// Through the binding, the chapter's track is its one link in the audio engine panel.
func TestDawBackupAroundOnTheHostSendsTheChaptersLinkedTrack(t *testing.T) {
	role := &fakeBackupKeeper{answer: backedUpInAudacity()}
	host := backupHost(t, "Audacity", true, role, "on")
	linked, refused, err := readAloudTrackGUID(host.services(), "c-0001")
	if err != nil || refused != nil || linked == "" {
		t.Fatalf("the fixture's link = %q, %+v, %v", linked, refused, err)
	}
	if got := decodeDawResult(t)(host.DawBackupAround("c-0001", 0, 0, backupLabelRoll)); !reflect.DeepEqual(got, backedUpInAudacity()) {
		t.Fatalf("DawBackupAround = %+v", got)
	}
	if len(role.backedUp) != 1 || role.backedUp[0].GUID != linked {
		t.Fatalf("sent %+v, want the linked track %q", role.backedUp, linked)
	}
}

func TestDawRestoreBackupSendsTheIdAndAnswersADawResult(t *testing.T) {
	role := &fakeBackupKeeper{answer: restoredInAudacity()}
	host := backupHost(t, "Audacity", true, role, "on")
	const id = "{0F8E2A5C-1B3D-4E6F-8A9B-0C1D2E3F4A5B}"
	if got := decodeDawResult(t)(host.DawRestoreBackup(id)); !reflect.DeepEqual(got, restoredInAudacity()) {
		t.Fatalf("DawRestoreBackup = %+v", got)
	}
	if !reflect.DeepEqual(role.restored, []string{id}) {
		t.Fatalf("sent %v", role.restored)
	}
}

// refusals-come-from-the-capability-or-the-host: the resolver's own sentence for each launch it refuses, checked first, and
// nothing created on any of them.
func TestDawBackupsRefuseWithTheResolversSentenceAndCreateNothing(t *testing.T) {
	for name, c := range map[string]struct {
		kind   string
		bridge bool
		toggle string
		reason dawport.Reason
	}{
		"REAPER":                  {"REAPER", true, "on", dawport.ReasonNotYet},
		"standalone":              {"", true, "on", dawport.ReasonStandalone},
		"Audacity, not connected": {"Audacity", false, "on", dawport.ReasonStandalone},
		"experimental off":        {"Audacity", true, "", dawport.ReasonExperimentalOff},
		"backups turned off":      {"Audacity", true, "off", dawport.ReasonTurnedOff},
	} {
		t.Run(name, func(t *testing.T) {
			role := &fakeBackupKeeper{answer: backedUpInAudacity()}
			host := backupHost(t, c.kind, c.bridge, role, c.toggle)
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapBackups)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("backups support = %+v, want reason %s", support, c.reason)
			}
			backedUp := decodeDawResult(t)(host.DawBackupAround("c-0001", 0, 0, backupLabelRoll))
			restored := decodeDawResult(t)(host.DawRestoreBackup("{0F8E2A5C-1B3D-4E6F-8A9B-0C1D2E3F4A5B}"))
			want := dawport.Refused(support.Message)
			if !reflect.DeepEqual(backedUp, want) || !reflect.DeepEqual(restored, want) || role.sent() != 0 {
				t.Fatalf("backup %+v, restore %+v, sent %d; want Refused(%q)", backedUp, restored, role.sent(), support.Message)
			}
		})
	}
}

// An id the table does not have is the role's own refusal, changed false, and Audacity is asked nothing.
func TestDawRestoreBackupOfAnUnknownIDIsTheRolesRefusal(t *testing.T) {
	asked := 0
	pipe := audacitybridge.New(audacitybridge.TransportFunc(func(context.Context) (audacitybridge.Conn, error) {
		asked++
		return nil, errors.New("no pipe in this test")
	}), audacitybridge.Options{})
	project := t.TempDir()
	role := audacity.NewBackups(pipe, audacity.BackupsConfig{Project: func() string { return project }})
	host := backupHost(t, "Audacity", true, role, "on")
	for _, id := range []string{"{11111111-1111-4111-8111-111111111111}", "../backups.json", ""} {
		got := decodeDawResult(t)(host.DawRestoreBackup(id))
		if got.OK || got.Changed || got.Refused != "Audacity has no backup with that id." || got.Code != "" {
			t.Fatalf("DawRestoreBackup(%q) = %+v", id, got)
		}
	}
	if asked != 0 {
		t.Fatalf("Audacity was asked %d times", asked)
	}
}

func TestDawBackupAroundRefusesALabelThatIsNotPlainText(t *testing.T) {
	role := &fakeBackupKeeper{answer: backedUpInAudacity()}
	host := backupHost(t, "Audacity", true, role, "on")
	for _, label := range []string{"", "Roll\u0007", strings.Repeat("x", 257), "\xff"} {
		if got := decodeDawResult(t)(host.DawBackupAround("c-0001", 0, 0, label)); got.Refused != backupLabelSentence {
			t.Errorf("label %q: %+v", label, got)
		}
	}
	if role.sent() != 0 {
		t.Fatalf("sent %d", role.sent())
	}
}

// The range's own refusals (a token not in the alignment is stale) and the role's errors are answered as a refusal.
func TestDawBackupAroundPassesOnTheRangesAndTheRolesRefusals(t *testing.T) {
	role := &fakeBackupKeeper{answer: backedUpInAudacity()}
	host := backupHost(t, "Audacity", true, role, "on")
	if got := decodeDawResult(t)(host.DawBackupAround("c-0001", 5, 99, backupLabelRoll)); got.Code != dawport.CodeStale || role.sent() != 0 {
		t.Fatalf("a range outside the alignment = %+v, sent %d", got, role.sent())
	}
	sources := backupSourcesIn(host.services())
	sources.track = fixedTrack
	for _, err := range []error{context.DeadlineExceeded, audacity.ErrBackupLost, errors.New("boom")} {
		got, gotErr := dawBackupAroundIn(t.Context(), "Audacity", available(), &fakeBackupKeeper{err: err}, sources, "c-0001", 0, 0, backupLabelRoll)
		if gotErr != nil || got.OK || got.Refused == "" {
			t.Errorf("%v: %+v, %v; want a refusal", err, got, gotErr)
		}
	}
	got, err := dawBackupAroundIn(t.Context(), "Audacity", available(), nil, sources, "c-0001", 0, 0, backupLabelRoll)
	if err != nil || got.Refused != "Audacity is not connected to this app, so nothing was backed up or restored." {
		t.Fatalf("no role = %+v, %v", got, err)
	}
}

// writeBackupsFile writes project's backups.json as the adapter would.
func writeBackupsFile(t *testing.T, project, body string) {
	t.Helper()
	path := audacity.BackupsFile(project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

const twoBackupsFile = `{"schemaVersion":1,"backups":[
 {"id":"{0F8E2A5C-1B3D-4E6F-8A9B-0C1D2E3F4A5B}","guid":"Chapter 1","chapterId":"c-0001","start":20,"end":280,"createdAt":"2026-10-12T09:30:00Z","label":"Roll at ¶ 3","restored":"2026-10-12T11:00:00Z"},
 {"id":"{7A6B5C4D-3E2F-4109-8877-665544332211}","guid":"Chapter 1","chapterId":"c-0001","start":0,"end":134.5,"createdAt":"2026-10-12T10:30:00Z","label":"Trim white space"}]}`

// DawBackups answers the table in the file's shape, newest first, from the file alone.
func TestDawBackupsListsTheTableNewestFirst(t *testing.T) {
	project := t.TempDir()
	writeBackupsFile(t, project, twoBackupsFile)
	list, err := dawBackupsIn(project, nil)
	if err != nil || list.SchemaVersion != 1 || len(list.Backups) != 2 {
		t.Fatalf("DawBackups = %+v, %v", list, err)
	}
	if list.Backups[0].Label != "Trim white space" || list.Backups[1].Label != backupLabelRoll || list.Backups[1].Restored == nil {
		t.Fatalf("rows = %+v, want the newer first with its label and the older's restored time", list.Backups)
	}
	if empty, err := dawBackupsIn(t.TempDir(), nil); err != nil || empty.Backups == nil || len(empty.Backups) != 0 {
		t.Fatalf("a project with no table = %+v, %v", empty, err)
	}
	if _, err := dawBackupsIn("", nil); !errors.Is(err, errNoProject) {
		t.Fatalf("no project = %v", err)
	}
	writeBackupsFile(t, project, `{"schemaVersion":2,"backups":[]}`)
	if _, err := dawBackupsIn(project, nil); err == nil || !strings.Contains(err.Error(), "newer version") {
		t.Fatalf("a newer table = %v", err)
	}
}

// settings-are-bounded-and-default: the two settings save only inside the mock's ranges and steps, and read back their defaults.
func TestTheBackupsSettingsAreBoundedAndDefault(t *testing.T) {
	host := backupHost(t, "Audacity", true, nil, "")
	store := host.services().settings
	if got := backupWindowSeconds(store); got != 120 {
		t.Errorf("the default window = %v, want 120", got)
	}
	if got := backupRetention(store); got != 7*24*time.Hour {
		t.Errorf("the default retention = %v, want seven days", got)
	}
	save := func(key, value string) error {
		return host.saveSettings("DAW", "global", map[string]*string{key: &value})
	}
	for key, values := range map[string]struct{ good, bad []string }{
		backupWindowKey:    {[]string{"10", "120", "300"}, []string{"0", "5", "125", "310", "-10", "1e2", "two"}},
		backupRetentionKey: {[]string{"1", "7", "365"}, []string{"0", "1.5", "366", "-1"}},
	} {
		for _, value := range values.good {
			if err := save(key, value); err != nil {
				t.Errorf("%s = %s refused: %v", key, value, err)
			}
		}
		for _, value := range values.bad {
			if err := save(key, value); err == nil {
				t.Errorf("%s = %s saved", key, value)
			}
		}
	}
	if err := save(backupWindowKey, "60"); err != nil {
		t.Fatal(err)
	}
	if err := save(backupRetentionKey, "3"); err != nil {
		t.Fatal(err)
	}
	if backupWindowSeconds(store) != 60 || backupRetention(store) != 3*24*time.Hour {
		t.Errorf("the saved settings read back as %v and %v", backupWindowSeconds(store), backupRetention(store))
	}
}

// prune-honours-retention, the host's part: the prune on open runs with the narrator's retention only while backups can be used,
// and never for a role a later project replaced.
func TestThePruneOnOpenUsesTheRetentionOnlyWhileBackupsCanBeUsed(t *testing.T) {
	role := &fakeBackupKeeper{}
	host := backupHost(t, "Audacity", true, role, "on")
	days := "3"
	if err := host.saveSettings("DAW", "global", map[string]*string{backupRetentionKey: &days}); err != nil {
		t.Fatal(err)
	}
	host.pruneBackupsOnOpen(host.services(), role)
	if !reflect.DeepEqual(role.pruned, []time.Duration{3 * 24 * time.Hour}) {
		t.Fatalf("pruned %v, want once with three days", role.pruned)
	}
	replaced := &fakeBackupKeeper{gone: true}
	host.pruneBackupsOnOpen(host.services(), replaced)
	if len(replaced.pruned) != 0 {
		t.Fatalf("a replaced role was pruned")
	}

	off := &fakeBackupKeeper{}
	notConnected := backupHost(t, "Audacity", false, off, "on")
	notConnected.pruneBackupsOnOpen(notConnected.services(), off)
	if len(off.pruned) != 0 {
		t.Fatalf("pruned while Audacity is not connected")
	}
}

// An Audacity launch with a project builds the backups role; REAPER and a launch with no project do not.
func TestOnlyAnAudacityLaunchWithAProjectHasABackupsRole(t *testing.T) {
	for kind, want := range map[string]bool{"Audacity": true, "REAPER": false, "": false} {
		host := deleteRangeHost(t, kind, liveReachability(), nil, "")
		if got := host.services().backupKeeper != nil; got != want {
			t.Errorf("%q: backups role %v, want %v", kind, got, want)
		}
	}
}

// go-goldens: UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-backup-*.json and daw-backups-list.json: a backup and a
// restore in Audacity, REAPER's refusal, and the list.
func TestDawBackupsContractGoldenIsCurrent(t *testing.T) {
	decode := func(raw string, err error) map[string]any {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var value map[string]any
		if err := json.Unmarshal([]byte(raw), &value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	t.Run("daw-backup-done", func(t *testing.T) {
		host := backupHost(t, "Audacity", true, &fakeBackupKeeper{answer: backedUpInAudacity()}, "on")
		sources := backupSourcesIn(host.services())
		sources.track = fixedTrack
		result, err := dawBackupAroundIn(t.Context(), "Audacity", available(), &fakeBackupKeeper{answer: backedUpInAudacity()}, sources, "c-0001", 0, 0, backupLabelRoll)
		contractfile.Check(t, "daw-backup-done", decode(encodeBinding(result, err)))
	})
	t.Run("daw-backup-restored", func(t *testing.T) {
		host := backupHost(t, "Audacity", true, &fakeBackupKeeper{answer: restoredInAudacity()}, "on")
		contractfile.Check(t, "daw-backup-restored", decode(host.DawRestoreBackup("{0F8E2A5C-1B3D-4E6F-8A9B-0C1D2E3F4A5B}")))
	})
	t.Run("daw-backup-refused", func(t *testing.T) {
		host := backupHost(t, "REAPER", true, nil, "")
		contractfile.Check(t, "daw-backup-refused", decode(host.DawBackupAround("c-0001", 0, 0, backupLabelRoll)))
	})
	t.Run("daw-backups-list", func(t *testing.T) {
		project := t.TempDir()
		writeBackupsFile(t, project, twoBackupsFile)
		contractfile.Check(t, "daw-backups-list", decode(encodeBinding(dawBackupsIn(project, nil))))
	})
}

// Closing the role's pipe when the next project replaces it marks it replaced, so a prune that has not started leaves it alone.
func TestAReplacedAudacityBackupsRoleIsNotPruned(t *testing.T) {
	role := audacityBackupsFor(t.TempDir(), nil, nil)
	if role.replaced() {
		t.Fatalf("a new role reads as replaced")
	}
	role.closePipe()
	if !role.replaced() {
		t.Fatalf("a closed role does not read as replaced")
	}
	host := backupHost(t, "Audacity", true, role, "on")
	host.pruneBackupsOnOpen(host.services(), role)
}

// SN-E99: saving a shorter retention prunes at once with the new rule; a longer one, an unchanged one, or a refused value prunes nothing.
func TestShorterRetentionPrunesAtOnceAndALongerOneKeepsEverything(t *testing.T) {
	role := &fakeBackupKeeper{}
	host := backupHost(t, "Audacity", true, role, "on")
	save := func(days string) {
		t.Helper()
		if err := host.saveSettings("DAW", "global", map[string]*string{backupRetentionKey: &days}); err != nil {
			t.Fatal(err)
		}
	}
	day := 24 * time.Hour
	save("3")  // default 7 -> 3
	save("3")  // unchanged
	save("10") // longer
	save("1")  // 10 -> 1
	if want := []time.Duration{3 * day, 1 * day}; !reflect.DeepEqual(role.pruned, want) {
		t.Fatalf("pruned %v, want %v", role.pruned, want)
	}
	bad := "0"
	if err := host.saveSettings("DAW", "global", map[string]*string{backupRetentionKey: &bad}); err == nil {
		t.Fatalf("a retention of 0 days was saved")
	}
	window := "30"
	if err := host.saveSettings("DAW", "global", map[string]*string{backupWindowKey: &window}); err != nil {
		t.Fatal(err)
	}
	if len(role.pruned) != 2 {
		t.Fatalf("pruned %v after a refused value and another setting", role.pruned)
	}
	off := &fakeBackupKeeper{}
	notConnected := backupHost(t, "Audacity", false, off, "on")
	days := "1"
	if err := notConnected.saveSettings("DAW", "global", map[string]*string{backupRetentionKey: &days}); err != nil {
		t.Fatal(err)
	}
	if len(off.pruned) != 0 {
		t.Fatalf("pruned while Audacity is not connected")
	}
}

// lockedKeeper is a role whose restore and prune share one lock, as audacity.Backups does.
type lockedKeeper struct {
	fakeBackupKeeper
	mu      sync.Mutex
	started chan struct{}
	release chan struct{}
	order   []string
}

func (l *lockedKeeper) RestoreBackup(context.Context, string) (dawport.Result, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	close(l.started)
	<-l.release
	l.order = append(l.order, "restore")
	return dawport.OK("restored", true), nil
}

func (l *lockedKeeper) Prune(context.Context, time.Duration) ([]string, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.order = append(l.order, "prune")
	return nil, nil
}

func TestRetentionPruneWaitsForARestoreInFlight(t *testing.T) {
	role := &lockedKeeper{started: make(chan struct{}), release: make(chan struct{})}
	host := backupHost(t, "Audacity", true, role, "on")
	restored := make(chan struct{})
	go func() {
		defer close(restored)
		_, _ = role.RestoreBackup(t.Context(), "{id}")
	}()
	<-role.started
	saved := make(chan struct{})
	go func() {
		defer close(saved)
		days := "2"
		_ = host.saveSettings("DAW", "global", map[string]*string{backupRetentionKey: &days})
	}()
	select {
	case <-saved:
		t.Fatalf("the retention prune ran during a restore")
	case <-time.After(50 * time.Millisecond):
	}
	close(role.release)
	<-restored
	<-saved
	if !reflect.DeepEqual(role.order, []string{"restore", "prune"}) {
		t.Fatalf("order %v, want the restore then the prune", role.order)
	}
}
