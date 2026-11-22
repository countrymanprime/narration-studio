package persist

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var pruneNow = time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)

// pruneFolder is a folder "runs" under a fresh root, and the root.
func pruneFolder(t *testing.T) (root, dir string) {
	t.Helper()
	root = t.TempDir()
	dir = filepath.Join(root, "runs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	return root, dir
}

// pruneFile writes a file of size bytes, last modified age before pruneNow.
func pruneFile(t *testing.T, dir, name string, size int, age time.Duration) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, make([]byte, size), 0o600); err != nil {
		t.Fatal(err)
	}
	when := pruneNow.Add(-age)
	if err := os.Chtimes(path, when, when); err != nil {
		t.Fatal(err)
	}
	return path
}

func exists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}

// everyFileItsOwn groups each .dat file alone and refuses any other name.
func everyFileItsOwn(name string) (string, bool) { return name, strings.HasSuffix(name, ".dat") }

// runOf groups "<track>_<run>.<ext>" files by their run: the digits after the last underscore.
func runOf(name string) (string, bool) {
	stem, _, ok := strings.Cut(name, ".")
	if !ok {
		return "", false
	}
	at := strings.LastIndex(stem, "_")
	if at < 0 {
		return "", false
	}
	return stem[at+1:], true
}

func never() bool { return false }

func TestPruneFolderKeepsTheNewestGroupsAndRemovesTheRest(t *testing.T) {
	root, dir := pruneFolder(t)
	for i := range 25 {
		pruneFile(t, dir, fmt.Sprintf("f%02d.dat", i), 10, time.Duration(25-i)*time.Minute)
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, KeepGroups: 20}, pruneNow, never)
	if err != nil {
		t.Fatal(err)
	}
	if pass.Removed != 5 || pass.FilesBefore != 25 || pass.FilesAfter != 20 || pass.BytesBefore != 250 || pass.BytesAfter != 200 {
		t.Fatalf("pass = %+v; want 5 removed of 25 files and 250 bytes", pass)
	}
	if exists(filepath.Join(dir, "f00.dat")) || exists(filepath.Join(dir, "f04.dat")) || !exists(filepath.Join(dir, "f05.dat")) || !exists(filepath.Join(dir, "f24.dat")) {
		t.Fatal("the five oldest were not the ones removed")
	}
}

func TestPruneFolderRemovesWhatIsOlderThanTheAgeWhateverTheCount(t *testing.T) {
	root, dir := pruneFolder(t)
	old := pruneFile(t, dir, "old.dat", 10, 8*24*time.Hour)
	recent := pruneFile(t, dir, "recent.dat", 10, time.Hour)
	if _, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, KeepGroups: 20, MaxAge: 7 * 24 * time.Hour}, pruneNow, never); err != nil {
		t.Fatal(err)
	}
	if exists(old) || !exists(recent) {
		t.Fatalf("old kept %v, recent kept %v; want the 8-day-old file gone and the one from an hour ago kept", exists(old), exists(recent))
	}
}

func TestPruneFolderTakesTheOldestGroupsUntilItIsUnderTheByteCap(t *testing.T) {
	root, dir := pruneFolder(t)
	oldest := pruneFile(t, dir, "a.dat", 100, 3*time.Hour)
	middle := pruneFile(t, dir, "b.dat", 100, 2*time.Hour)
	newest := pruneFile(t, dir, "c.dat", 100, time.Hour)
	pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxBytes: 150}, pruneNow, never)
	if err != nil {
		t.Fatal(err)
	}
	if exists(oldest) || exists(middle) || !exists(newest) || pass.BytesAfter != 100 {
		t.Fatalf("oldest kept %v, middle kept %v, newest kept %v, pass %+v; want only the newest kept", exists(oldest), exists(middle), exists(newest), pass)
	}
}

func TestPruneFolderLeavesAGroupModifiedWithinTheGuardOutOfTheByteCap(t *testing.T) {
	root, dir := pruneFolder(t)
	old := pruneFile(t, dir, "a.dat", 100, 3*time.Hour)
	fresh := pruneFile(t, dir, "b.dat", 100, time.Minute)
	if _, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxBytes: 1, Guard: 10 * time.Minute}, pruneNow, never); err != nil {
		t.Fatal(err)
	}
	if exists(old) || !exists(fresh) {
		t.Fatalf("old kept %v, fresh kept %v; want the old one gone and the one written a minute ago left whatever the cap", exists(old), exists(fresh))
	}
}

func TestPruneFolderRemovesAGroupWholeAndAgesItByItsNewestFile(t *testing.T) {
	root, dir := pruneFolder(t)
	// Run 0001 is old in two of its files and young in the third; run 0002 is old throughout.
	young := []string{
		pruneFile(t, dir, "x_0001.diff", 10, 8*24*time.Hour),
		pruneFile(t, dir, "x_0001.manuscript.txt", 10, 8*24*time.Hour),
		pruneFile(t, dir, "x_0001.recorded.txt", 10, time.Hour),
	}
	old := []string{
		pruneFile(t, dir, "x_0002.diff", 10, 9*24*time.Hour),
		pruneFile(t, dir, "x_0002.manuscript.txt", 10, 9*24*time.Hour),
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: runOf, MaxAge: 7 * 24 * time.Hour}, pruneNow, never)
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range young {
		if !exists(path) {
			t.Fatalf("%s was removed: a run is as old as its newest file", filepath.Base(path))
		}
	}
	for _, path := range old {
		if exists(path) {
			t.Fatalf("%s was kept", filepath.Base(path))
		}
	}
	if pass.Removed != 2 {
		t.Fatalf("removed %d; want 2", pass.Removed)
	}
}

func TestPruneFolderCountsRunsNotFiles(t *testing.T) {
	root, dir := pruneFolder(t)
	for i := range 3 {
		for _, ext := range []string{".diff", ".manuscript.txt", ".recorded.txt"} {
			pruneFile(t, dir, fmt.Sprintf("t_%04d%s", i, ext), 10, time.Duration(3-i)*time.Hour)
		}
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: runOf, KeepGroups: 2}, pruneNow, never)
	if err != nil || pass.Removed != 3 || pass.FilesAfter != 6 {
		t.Fatalf("pass = %+v, %v; want the oldest run's three files removed and two runs of three left", pass, err)
	}
	if exists(filepath.Join(dir, "t_0000.diff")) || !exists(filepath.Join(dir, "t_0001.diff")) {
		t.Fatal("the wrong run was removed")
	}
}

func TestPruneFolderNeverTouchesANameItsWriterDoesNotUse(t *testing.T) {
	root, dir := pruneFolder(t)
	note := pruneFile(t, dir, "equivalences.csv", 10, 400*24*time.Hour)
	stray := pruneFile(t, dir, "a.dat.part", 10, 400*24*time.Hour)
	if err := os.Mkdir(filepath.Join(dir, "sub.dat"), 0o755); err != nil {
		t.Fatal(err)
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, KeepGroups: 1, MaxAge: time.Hour, MaxBytes: 1}, pruneNow, never)
	if err != nil || pass.Removed != 0 || !exists(note) || !exists(stray) || !exists(filepath.Join(dir, "sub.dat")) {
		t.Fatalf("pass = %+v, %v; want everything kept", pass, err)
	}
	if pass.FilesBefore != 0 {
		t.Fatalf("FilesBefore = %d; want names the writer does not use, and the folder, not counted", pass.FilesBefore)
	}
}

func TestPruneFolderOrdersTiesByName(t *testing.T) {
	root, dir := pruneFolder(t)
	for _, name := range []string{"c.dat", "a.dat", "b.dat"} {
		pruneFile(t, dir, name, 10, time.Hour)
	}
	if _, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, KeepGroups: 1}, pruneNow, never); err != nil {
		t.Fatal(err)
	}
	// Newest first, ties in name order: a.dat is the one kept.
	if !exists(filepath.Join(dir, "a.dat")) || exists(filepath.Join(dir, "b.dat")) || exists(filepath.Join(dir, "c.dat")) {
		t.Fatal("equal times were not taken in name order")
	}
}

func TestPruneFolderReadsAFileTimeInTheFutureAsNow(t *testing.T) {
	root, dir := pruneFolder(t)
	future := pruneFile(t, dir, "future.dat", 10, -1000*24*time.Hour)
	older := pruneFile(t, dir, "older.dat", 10, time.Hour)
	if _, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, KeepGroups: 1}, pruneNow, never); err != nil {
		t.Fatal(err)
	}
	if !exists(future) || exists(older) {
		t.Fatal("a file dated in the future was not taken as the newest")
	}
	// Its age is zero, so a time limit does not remove it.
	if _, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: time.Hour}, pruneNow, never); err != nil || !exists(future) {
		t.Fatalf("a future file was aged out: %v", err)
	}
}

func TestPruneFolderStopsBeforeItListsTheFolder(t *testing.T) {
	root, dir := pruneFolder(t)
	pruneFile(t, dir, "a.dat", 10, 400*24*time.Hour)
	was := listFolder
	t.Cleanup(func() { listFolder = was })
	listFolder = func(string) ([]os.DirEntry, error) { t.Error("the folder was listed after a stop"); return nil, nil }
	if pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: time.Hour}, pruneNow, func() bool { return true }); err != nil || !pass.Stopped {
		t.Fatalf("pass = %+v, %v; want it stopped before the listing", pass, err)
	}
}

// A group with a file modified within the guard is out of every removal, whatever the count, the age or the cap says.
func TestPruneFolderLeavesAGroupModifiedWithinTheGuardWhateverTheRule(t *testing.T) {
	root, dir := pruneFolder(t)
	guarded := pruneFile(t, dir, "a.dat", 100, 30*time.Minute)
	old := pruneFile(t, dir, "b.dat", 100, 9*24*time.Hour)
	rule := PruneRule{Group: everyFileItsOwn, KeepGroups: 0, MaxAge: 7 * 24 * time.Hour, MaxBytes: 1, Guard: time.Hour}
	// KeepGroups 1 would take the older one; MaxAge, MaxBytes too: each rule on its own and together leave the guarded file.
	for name, r := range map[string]PruneRule{"count": {Group: rule.Group, KeepGroups: 0 + 1, Guard: time.Hour}, "age": {Group: rule.Group, MaxAge: 20 * time.Minute, Guard: time.Hour}, "size": {Group: rule.Group, MaxBytes: 1, Guard: time.Hour}} {
		if _, err := PruneFolder(root, "runs", r, pruneNow, never); err != nil {
			t.Fatal(name, err)
		}
		if !exists(guarded) {
			t.Fatalf("the %s rule removed a file modified half an hour ago under a guard of an hour", name)
		}
		pruneFile(t, dir, "b.dat", 100, 9*24*time.Hour) // the old one is removed by whichever rule can; put it back for the next
	}
	if _, err := PruneFolder(root, "runs", rule, pruneNow, never); err != nil || !exists(guarded) || exists(old) {
		t.Fatalf("all rules together: guarded kept %v, old kept %v (%v)", exists(guarded), exists(old), err)
	}
}

// The guard ends: once a file is older than it, the rules apply.
func TestPruneFolderTheGuardEndsWhenTheGroupIsOlderThanIt(t *testing.T) {
	root, dir := pruneFolder(t)
	file := pruneFile(t, dir, "a.dat", 10, 90*time.Minute)
	if _, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxBytes: 1, Guard: time.Hour}, pruneNow, never); err != nil || exists(file) {
		t.Fatalf("a file older than the guard was kept: %v", err)
	}
}

// A file time in the future is set to now: the file is guarded for the guard period and ages out after it, and never keeps a place for ever.
func TestPruneFolderSetsAFileTimeInTheFutureToNowAndAgesItFromThere(t *testing.T) {
	root, dir := pruneFolder(t)
	real := time.Now()
	future := filepath.Join(dir, "future.dat")
	if err := os.WriteFile(future, make([]byte, 10), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(future, real.Add(1000*24*time.Hour), real.Add(1000*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	rule := PruneRule{Group: everyFileItsOwn, MaxAge: time.Hour, Guard: 10 * time.Minute}
	if _, err := PruneFolder(root, "runs", rule, real, never); err != nil || !exists(future) {
		t.Fatalf("a file dated in the future was removed on the pass that found it: %v", err)
	}
	if info, err := os.Stat(future); err != nil || info.ModTime().After(real.Add(time.Minute)) {
		t.Fatalf("file time after the pass = %v (%v); want it moved to now", info.ModTime(), err)
	}
	// An hour and a bit later it is old like any other.
	if _, err := PruneFolder(root, "runs", rule, real.Add(2*time.Hour), never); err != nil || exists(future) {
		t.Fatalf("a file once dated in the future never aged out: %v", err)
	}
}

// A future time that cannot be set (only the file's owner may) makes the file the oldest: it is neither kept for ever nor left in the cap.
func TestPruneFolderTakesAFutureFileWhoseTimeCannotBeSetAsTheOldest(t *testing.T) {
	root, dir := pruneFolder(t)
	was := SetFileTime
	t.Cleanup(func() { SetFileTime = was })
	SetFileTime = func(string, string, time.Time) error { return errors.New("operation not permitted") }
	real := time.Now()
	future := filepath.Join(dir, "future.dat")
	recent := filepath.Join(dir, "recent.dat")
	for _, path := range []string{future, recent} {
		if err := os.WriteFile(path, make([]byte, 10), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Chtimes(future, real.Add(1000*24*time.Hour), real.Add(1000*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(recent, real.Add(-time.Hour), real.Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxBytes: 10, Guard: time.Minute}, real, never); err != nil {
		t.Fatal(err)
	}
	if exists(future) || !exists(recent) {
		t.Fatalf("future kept %v, recent kept %v; want the file whose time cannot be set evicted first", exists(future), exists(recent))
	}
}

// The limits are strict: a group exactly at the age, or a folder exactly at the cap, stays.
func TestPruneFolderTheLimitsAreStrict(t *testing.T) {
	root, dir := pruneFolder(t)
	atAge := pruneFile(t, dir, "a.dat", 100, time.Hour)
	if _, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: time.Hour}, pruneNow, never); err != nil || !exists(atAge) {
		t.Fatalf("a file exactly at the age limit was removed: %v", err)
	}
	if _, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxBytes: 100}, pruneNow, never); err != nil || !exists(atAge) {
		t.Fatalf("a folder exactly at the byte cap lost a file: %v", err)
	}
}

// A file written during the pass is counted at its size now.
func TestPruneFolderCountsAChangedFileAtItsSizeNow(t *testing.T) {
	root, dir := pruneFolder(t)
	file := pruneFile(t, dir, "a.dat", 10, 9*24*time.Hour)
	looks := 0
	stop := func() bool {
		if looks++; looks == 3 {
			if err := os.WriteFile(file, make([]byte, 50), 0o600); err != nil { // grows
				t.Error(err)
			}
		}
		return false
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: time.Hour}, pruneNow, stop)
	if err != nil || !exists(file) || pass.BytesAfter != 50 || pass.FilesAfter != 1 {
		t.Fatalf("pass = %+v, %v; want the written file kept and counted at 50 bytes", pass, err)
	}
}

func TestPruneFolderOfNothingIsNothing(t *testing.T) {
	root := t.TempDir()
	for name, args := range map[string][2]string{"no root": {"", "runs"}, "no folder": {root, "runs"}} {
		pass, err := PruneFolder(args[0], args[1], PruneRule{Group: everyFileItsOwn, KeepGroups: 1}, pruneNow, nil)
		if err != nil || pass != (PrunePass{}) {
			t.Fatalf("%s: %+v, %v; want an empty pass and no error", name, pass, err)
		}
	}
}

func TestPruneFolderRefusesAFolderThatIsALink(t *testing.T) {
	root, elsewhere := t.TempDir(), t.TempDir()
	victim := pruneFile(t, elsewhere, "a.dat", 10, 400*24*time.Hour)
	if err := os.Symlink(elsewhere, filepath.Join(root, "runs")); err != nil {
		t.Skipf("no symbolic links here: %v", err)
	}
	if _, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: time.Hour}, pruneNow, never); err == nil {
		t.Fatal("a folder that is a link was pruned")
	}
	if !exists(victim) {
		t.Fatal("a file behind the link was removed")
	}
}

func TestPruneFolderReportsAFolderItCannotList(t *testing.T) {
	root, _ := pruneFolder(t)
	was := listFolder
	t.Cleanup(func() { listFolder = was })
	listFolder = func(string) ([]os.DirEntry, error) { return nil, errors.New("access is denied") }
	if _, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, KeepGroups: 1}, pruneNow, never); err == nil || !strings.Contains(err.Error(), "could not list") {
		t.Fatalf("err = %v; want the listing error", err)
	}
}

func TestPruneFolderStopsBeforeItReadsAnything(t *testing.T) {
	root, dir := pruneFolder(t)
	pruneFile(t, dir, "a.dat", 10, 400*24*time.Hour)
	pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: time.Hour}, pruneNow, func() bool { return true })
	if err != nil || !pass.Stopped || pass.FilesBefore != 0 || !exists(filepath.Join(dir, "a.dat")) {
		t.Fatalf("pass = %+v, %v; want it stopped before the first file", pass, err)
	}
}

func TestPruneFolderStopsWhileItIsStillReadingALargeFolder(t *testing.T) {
	root, dir := pruneFolder(t)
	for i := range 2*ScanChunk + 5 {
		pruneFile(t, dir, fmt.Sprintf("f%04d.dat", i), 1, 400*24*time.Hour)
	}
	looks := 0
	pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: time.Hour}, pruneNow, func() bool { looks++; return looks > 2 })
	if err != nil || !pass.Stopped || pass.FilesBefore != ScanChunk || pass.Removed != 0 || pass.FilesAfter != ScanChunk {
		t.Fatalf("pass = %+v, %v; want it stopped after the first %d files with nothing removed", pass, err, ScanChunk)
	}
}

func TestPruneFolderStopsBetweenGroups(t *testing.T) {
	root, dir := pruneFolder(t)
	first := pruneFile(t, dir, "a.dat", 10, 3*time.Hour)
	second := pruneFile(t, dir, "b.dat", 10, 2*time.Hour)
	looks := 0
	// The first look is before the listing, the second the scan's; the third is before the first group, the fourth before the next.
	pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: time.Minute}, pruneNow, func() bool { looks++; return looks > 3 })
	if err != nil || !pass.Stopped || pass.Removed != 1 || exists(first) || !exists(second) {
		t.Fatalf("pass = %+v, %v, first kept %v, second kept %v; want the oldest removed and the pass stopped", pass, err, exists(first), exists(second))
	}
}

// A group with a file written after the listing stays whole, the others go.
func TestPruneFolderLeavesAGroupWrittenToSinceTheListing(t *testing.T) {
	root, dir := pruneFolder(t)
	live := []string{pruneFile(t, dir, "t_0001.diff", 10, 8*24*time.Hour), pruneFile(t, dir, "t_0001.recorded.txt", 10, 8*24*time.Hour)}
	idle := pruneFile(t, dir, "t_0002.diff", 10, 9*24*time.Hour)
	looks := 0
	stop := func() bool {
		if looks++; looks == 3 { // after the scan, before the first group
			if err := os.WriteFile(live[1], []byte("more output"), 0o600); err != nil { // the run's file grows
				t.Error(err)
			}
		}
		return false
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: runOf, MaxAge: 7 * 24 * time.Hour}, pruneNow, stop)
	if err != nil {
		t.Fatal(err)
	}
	if !exists(live[0]) || !exists(live[1]) || exists(idle) || pass.Removed != 1 {
		t.Fatalf("live kept %v %v, idle kept %v, pass %+v; want the written-to run whole and the idle one gone", exists(live[0]), exists(live[1]), exists(idle), pass)
	}
}

// A name that became a folder, or a file another pass already removed, is not a change that keeps the group.
func TestPruneFolderCarriesOnPastAFileThatIsGoneAndKeepsAGroupWhoseNameBecameAFolder(t *testing.T) {
	root, dir := pruneFolder(t)
	gone := []string{pruneFile(t, dir, "t_0001.diff", 10, 9*24*time.Hour), pruneFile(t, dir, "t_0001.recorded.txt", 10, 9*24*time.Hour)}
	folder := []string{pruneFile(t, dir, "t_0002.diff", 10, 9*24*time.Hour), pruneFile(t, dir, "t_0002.recorded.txt", 10, 9*24*time.Hour)}
	looks := 0
	stop := func() bool {
		if looks++; looks == 3 {
			_ = os.Remove(gone[0]) // another pass took one file of the first run
			if err := os.Remove(folder[0]); err != nil {
				t.Error(err)
			}
			if err := os.Mkdir(folder[0], 0o755); err != nil { // a folder has the other run's name
				t.Error(err)
			}
		}
		return false
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: runOf, MaxAge: 7 * 24 * time.Hour}, pruneNow, stop)
	if err != nil {
		t.Fatal(err)
	}
	if exists(gone[0]) || exists(gone[1]) {
		t.Fatal("the run with one file already gone was not removed")
	}
	if !exists(folder[0]) || !exists(folder[1]) {
		t.Fatal("a run whose name became a folder was touched")
	}
	// Of four files: the first run's two are out of the tally (one removed by this pass, one already gone), the second run's folder is
	// no longer a file; its twin is the one regular file left.
	if pass.Removed != 1 || pass.FilesAfter != 1 || pass.BytesAfter != 10 {
		t.Fatalf("pass = %+v; want one removal by this pass and one regular file of 10 bytes left", pass)
	}
}

func TestPruneFolderGoesOnPastAFailedRemovalAndGivesUpAfterEight(t *testing.T) {
	root, dir := pruneFolder(t)
	for i := range 12 {
		pruneFile(t, dir, fmt.Sprintf("f%02d.dat", i), 10, 9*24*time.Hour)
	}
	was := removeFile
	t.Cleanup(func() { removeFile = was })
	denied := errors.New("access is denied")
	attempts := 0
	removeFile = func(root, rel string) (bool, error) {
		if attempts++; attempts <= 3 {
			return false, denied
		}
		return was(root, rel)
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: 7 * 24 * time.Hour}, pruneNow, never)
	if !errors.Is(err, denied) || pass.Removed != 9 || pass.FilesAfter != 3 || strings.Count(err.Error(), "\n") != 0 {
		t.Fatalf("pass = %+v, err = %v; want 9 removed, three refused and kept, one error line", pass, err)
	}
	// Every removal refused over a dozen files again: it gives up at the limit.
	for i := range 12 {
		pruneFile(t, dir, fmt.Sprintf("g%02d.dat", i), 10, 9*24*time.Hour)
	}
	attempts = 0
	removeFile = func(string, string) (bool, error) { attempts++; return false, denied }
	_, err = PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: 7 * 24 * time.Hour}, pruneNow, never)
	if err == nil || attempts != MaxRemovalFailures || !strings.HasPrefix(err.Error(), "gave up after 8 failed removals") {
		t.Fatalf("after %d attempts: %v; want it to give up after %d", attempts, err, MaxRemovalFailures)
	}
}

// A group whose one removal fails is left in part, and the failure is reported: the rest were removed, and a later pass tries the file again.
func TestPruneFolderLeavesTheFileWhoseRemovalFailedAndRemovesTheRestOfItsGroup(t *testing.T) {
	root, dir := pruneFolder(t)
	files := map[string]string{
		"diff":   pruneFile(t, dir, "T_0000000000000001.diff", 10, 9*24*time.Hour),
		"manu":   pruneFile(t, dir, "T_0000000000000001.manuscript.txt", 10, 9*24*time.Hour),
		"record": pruneFile(t, dir, "T_0000000000000001.recorded.txt", 10, 9*24*time.Hour),
	}
	was := removeFile
	t.Cleanup(func() { removeFile = was })
	denied := errors.New("access is denied")
	removeFile = func(root, rel string) (bool, error) {
		if strings.HasSuffix(rel, ".manuscript.txt") {
			return false, denied
		}
		return was(root, rel)
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: runOf, MaxAge: 7 * 24 * time.Hour}, pruneNow, never)
	if !errors.Is(err, denied) || pass.Removed != 2 || exists(files["diff"]) || !exists(files["manu"]) || exists(files["record"]) {
		t.Fatalf("pass = %+v, err = %v; want the refused file left, the other two removed and the error reported", pass, err)
	}
	removeFile = was
	if pass, err := PruneFolder(root, "runs", PruneRule{Group: runOf, MaxAge: 7 * 24 * time.Hour}, pruneNow, never); err != nil || pass.Removed != 1 || exists(files["manu"]) {
		t.Fatalf("the next pass: %+v, %v; want the left-over file removed", pass, err)
	}
}

// Each file is looked at right before its own removal: one written while a sibling was being removed keeps itself and the files after it.
func TestPruneFolderLeavesAFileWrittenWhileItsSiblingWasBeingRemovedAndTheRestOfTheGroup(t *testing.T) {
	root, dir := pruneFolder(t)
	// In name order: the diff, the manuscript text, the recorded text.
	first := pruneFile(t, dir, "T_0000000000000001.diff", 10, 9*24*time.Hour)
	second := pruneFile(t, dir, "T_0000000000000001.manuscript.txt", 10, 9*24*time.Hour)
	third := pruneFile(t, dir, "T_0000000000000001.recorded.txt", 10, 9*24*time.Hour)
	was := removeFile
	t.Cleanup(func() { removeFile = was })
	removed := 0
	removeFile = func(root, rel string) (bool, error) {
		removed++
		ok, err := was(root, rel)
		if removed == 1 { // the run writes to the next file as the first is removed
			if werr := os.WriteFile(second, make([]byte, 40), 0o600); werr != nil {
				t.Error(werr)
			}
		}
		return ok, err
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: runOf, MaxAge: 7 * 24 * time.Hour}, pruneNow, never)
	if err != nil {
		t.Fatal(err)
	}
	if exists(first) || !exists(second) || !exists(third) {
		t.Fatalf("first kept %v, second kept %v, third kept %v; want only the first removed: the file written meanwhile and the one after it stay", exists(first), exists(second), exists(third))
	}
	// The diff went; the manuscript text now holds 40 bytes; the recorded text is untouched: 50 bytes of two files left.
	if pass.Removed != 1 || pass.FilesAfter != 2 || pass.BytesAfter != 50 {
		t.Fatalf("pass = %+v; want one removed and two files of 50 bytes left", pass)
	}
}

// A changed file's group is one a stopped pass may have reached; the oldest goes first.
func TestPruneFolderRemovesTheOldestGroupFirst(t *testing.T) {
	root, dir := pruneFolder(t)
	oldest := pruneFile(t, dir, "c.dat", 10, 30*24*time.Hour)
	middle := pruneFile(t, dir, "a.dat", 10, 20*24*time.Hour)
	newest := pruneFile(t, dir, "b.dat", 10, 10*24*time.Hour)
	looks := 0
	// Look 1 is before the listing, 2 the scan's, 3 before the first group, 4 before the second, 5 before the third.
	pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: time.Hour}, pruneNow, func() bool { looks++; return looks >= 5 })
	if err != nil || !pass.Stopped || exists(oldest) || exists(middle) || !exists(newest) || pass.Removed != 2 {
		t.Fatalf("pass = %+v, %v; oldest kept %v, middle kept %v, newest kept %v; want the two oldest removed in order and the pass stopped", pass, err, exists(oldest), exists(middle), exists(newest))
	}
}

// A future-dated file moved to now is looked at as it is after: a pass that dooms it (Guard 0) removes it at once, not a pass later.
func TestPruneFolderRemovesAFutureDatedFileTheSamePassItIsMovedWhenItIsDoomed(t *testing.T) {
	root, dir := pruneFolder(t)
	real := time.Now()
	future := filepath.Join(dir, "future.dat")
	if err := os.WriteFile(future, make([]byte, 10), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(future, real.Add(1000*24*time.Hour), real.Add(1000*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxBytes: 1}, real, never)
	if err != nil || exists(future) || pass.Removed != 1 || pass.BytesBefore != 10 || pass.BytesAfter != 0 {
		t.Fatalf("pass = %+v, %v, file kept %v; want it removed in the pass that moved its time", pass, err, exists(future))
	}
}

// A sibling that is gone or became a folder as the first file was removed is out of the tally; a gone one does not stop the group.
func TestPruneFolderCarriesOnPastASiblingGoneAsTheFirstWasRemoved(t *testing.T) {
	root, dir := pruneFolder(t)
	diff := pruneFile(t, dir, "T_0000000000000001.diff", 10, 9*24*time.Hour)
	manu := pruneFile(t, dir, "T_0000000000000001.manuscript.txt", 10, 9*24*time.Hour)
	record := pruneFile(t, dir, "T_0000000000000001.recorded.txt", 10, 9*24*time.Hour)
	was := removeFile
	t.Cleanup(func() { removeFile = was })
	removeFile = func(root, rel string) (bool, error) {
		ok, err := was(root, rel)
		if strings.HasSuffix(rel, ".diff") { // as the diff goes: another pass takes the manuscript text, and a folder takes the recorded text's name
			_ = os.Remove(manu)
			if rerr := os.Remove(record); rerr != nil {
				t.Error(rerr)
			}
			if merr := os.Mkdir(record, 0o755); merr != nil {
				t.Error(merr)
			}
		}
		return ok, err
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: runOf, MaxAge: 7 * 24 * time.Hour}, pruneNow, never)
	if err != nil || exists(diff) || exists(manu) || pass.Removed != 1 || pass.FilesAfter != 0 || pass.BytesAfter != 0 {
		t.Fatalf("pass = %+v, %v; want the diff removed by this pass, the other two out of the tally (one gone, one a folder)", pass, err)
	}
	if info, serr := os.Lstat(record); serr != nil || !info.IsDir() {
		t.Fatalf("the folder that took a file's name was touched: %v", serr)
	}
}

func TestPruneFolderWithNoStopFunctionRunsToTheEnd(t *testing.T) {
	root, dir := pruneFolder(t)
	old := pruneFile(t, dir, "a.dat", 10, 9*24*time.Hour)
	if pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: time.Hour}, pruneNow, nil); err != nil || pass.Removed != 1 || exists(old) {
		t.Fatalf("pass = %+v, %v; want the file removed", pass, err)
	}
}

func TestPruneFolderCountsOnlyWhatARemovalReports(t *testing.T) {
	root, dir := pruneFolder(t)
	pruneFile(t, dir, "a.dat", 10, 9*24*time.Hour)
	was := removeFile
	t.Cleanup(func() { removeFile = was })
	removeFile = func(string, string) (bool, error) { return false, nil }
	pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxAge: time.Hour}, pruneNow, never)
	if err != nil || pass.Removed != 0 || pass.FilesAfter != 0 {
		t.Fatalf("pass = %+v, %v; want nothing counted as removed by this pass and no file left in the tally", pass, err)
	}
}

func TestPruneFolderOfARelativeRootActsInTheFolderItNames(t *testing.T) {
	root, dir := pruneFolder(t)
	old := pruneFile(t, dir, "a.dat", 10, 9*24*time.Hour)
	// The root is cleaned: a path with a trailing separator and a "." names the same folder.
	if _, err := PruneFolder(root+string(os.PathSeparator)+".", "runs", PruneRule{Group: everyFileItsOwn, MaxAge: time.Hour}, pruneNow, never); err != nil {
		t.Fatal(err)
	}
	if exists(old) {
		t.Fatal("the file was not removed through an unclean root")
	}
}

func TestRecheckSaysWhatBecameOfAListedFile(t *testing.T) {
	_, dir := pruneFolder(t)
	path := pruneFile(t, dir, "a.dat", 10, time.Hour)
	listed, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	if state, current := Recheck(path, listed.Size(), listed.ModTime(), listed); state != FileSame || current == nil {
		t.Fatalf("an untouched file: %v", state)
	}
	// Written again: a new time.
	when := listed.ModTime().Add(time.Minute)
	if err := os.Chtimes(path, when, when); err != nil {
		t.Fatal(err)
	}
	if state, _ := Recheck(path, listed.Size(), listed.ModTime(), listed); state != FileChanged {
		t.Fatalf("a file with a new time: %v", state)
	}
	if err := os.Chtimes(path, listed.ModTime(), listed.ModTime()); err != nil {
		t.Fatal(err)
	}
	// Written in place, keeping the time but not the size.
	if err := os.WriteFile(path, make([]byte, 99), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, listed.ModTime(), listed.ModTime()); err != nil {
		t.Fatal(err)
	}
	if state, _ := Recheck(path, listed.Size(), listed.ModTime(), listed); state != FileChanged {
		t.Fatalf("a file of another size: %v", state)
	}
	// Another file of the same size and time renamed over the name.
	if err := os.WriteFile(path, make([]byte, 10), 0o600); err != nil {
		t.Fatal(err)
	}
	other := path + ".other"
	if err := os.WriteFile(other, make([]byte, 10), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(other, path); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, listed.ModTime(), listed.ModTime()); err != nil {
		t.Fatal(err)
	}
	if state, _ := Recheck(path, 10, listed.ModTime(), listed); state != FileChanged {
		t.Fatalf("another file under the name: %v", state)
	}
	// A path that cannot be looked at (a file where a folder should be).
	if state, current := Recheck(filepath.Join(path, "below"), 10, listed.ModTime(), listed); state != FileChanged || current != nil {
		t.Fatalf("a path below a file: %v", state)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if state, current := Recheck(path, 10, listed.ModTime(), listed); state != FileGone || current != nil {
		t.Fatalf("a removed file: %v", state)
	}
	if err := os.Mkdir(path, 0o755); err != nil {
		t.Fatal(err)
	}
	if state, _ := Recheck(path, 10, listed.ModTime(), listed); state != FileNotRegular {
		t.Fatalf("a folder: %v", state)
	}
}

func TestMarkUsedMovesAnOldOrFutureTimeToNowAndLeavesARecentOneAlone(t *testing.T) {
	_, dir := pruneFolder(t)
	now := time.Now().Truncate(time.Second)
	for name, age := range map[string]time.Duration{"old.dat": 48 * time.Hour, "future.dat": -1000 * 24 * time.Hour} {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, nil, 0o600); err != nil {
			t.Fatal(err)
		}
		when := now.Add(-age)
		if err := os.Chtimes(path, when, when); err != nil {
			t.Fatal(err)
		}
		MarkUsed(dir, name, time.Hour, now)
		if info, err := os.Stat(path); err != nil || !info.ModTime().Equal(now) {
			t.Fatalf("%s: time %v (%v); want now", name, info.ModTime(), err)
		}
	}
	recent := filepath.Join(dir, "recent.dat")
	if err := os.WriteFile(recent, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	used := now.Add(-10 * time.Minute)
	if err := os.Chtimes(recent, used, used); err != nil {
		t.Fatal(err)
	}
	MarkUsed(dir, "recent.dat", time.Hour, now)
	if info, err := os.Stat(recent); err != nil || !info.ModTime().Equal(used) {
		t.Fatalf("a file used ten minutes ago: time %v (%v); want it left", info.ModTime(), err)
	}
	MarkUsed(dir, "absent.dat", time.Hour, now) // nothing there: no panic, no file made
	if exists(filepath.Join(dir, "absent.dat")) {
		t.Fatal("MarkUsed made a file")
	}
}

func TestMarkUsedIgnoresAFileTimeItCannotSet(t *testing.T) {
	_, dir := pruneFolder(t)
	path := filepath.Join(dir, "a.dat")
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-48 * time.Hour).Truncate(time.Second)
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatal(err)
	}
	was := SetFileTime
	t.Cleanup(func() { SetFileTime = was })
	SetFileTime = func(string, string, time.Time) error { return errors.New("operation not permitted") }
	MarkUsed(dir, "a.dat", time.Hour, time.Now())
	if info, err := os.Stat(path); err != nil || !info.ModTime().Equal(old) {
		t.Fatalf("time %v (%v); want it left as it was", info.ModTime(), err)
	}
}

func TestSetFileTimeIsRefusedForAFolderThatIsNotThere(t *testing.T) {
	if err := SetFileTime(filepath.Join(t.TempDir(), "none"), "a.dat", time.Now()); err == nil {
		t.Fatal("a file time was set in a folder that is not there")
	}
}

func TestFailuresIsOneLine(t *testing.T) {
	first := errors.New("first")
	if Failures(nil) != nil || Failures([]error{first}) != first {
		t.Fatal("none is nil and one is itself")
	}
	err := Failures([]error{first, errors.New("second")})
	if err == nil || !errors.Is(err, first) || !strings.HasPrefix(err.Error(), "2 removals failed, the first: first") || strings.Contains(err.Error(), "second") {
		t.Fatalf("err = %v; want the count and the first only", err)
	}
}

// A time call that returns nil and moves nothing (a filesystem that ignores it) is not a move: the file is still the oldest, not "just used".
func TestPruneFolderTreatsAFutureTimeThatDidNotMoveAsTheOldest(t *testing.T) {
	root, dir := pruneFolder(t)
	was := SetFileTime
	t.Cleanup(func() { SetFileTime = was })
	SetFileTime = func(string, string, time.Time) error { return nil }
	real := time.Now()
	future := filepath.Join(dir, "future.dat")
	recent := filepath.Join(dir, "recent.dat")
	for _, path := range []string{future, recent} {
		if err := os.WriteFile(path, make([]byte, 10), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Chtimes(future, real.Add(1000*24*time.Hour), real.Add(1000*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(recent, real.Add(-time.Hour), real.Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxBytes: 10, Guard: time.Minute}, real, never); err != nil {
		t.Fatal(err)
	}
	if exists(future) || !exists(recent) {
		t.Fatalf("future kept %v, recent kept %v; want the file whose time did not move evicted first", exists(future), exists(recent))
	}
}

// The counters of a pass match the disk when a future-dated file is replaced by one of another size between the time call and the look.
func TestPruneFolderCountsAFutureFileAtTheSizeItHasAfterItsTimeMoves(t *testing.T) {
	root, dir := pruneFolder(t)
	real := time.Now().Add(time.Minute)
	future := filepath.Join(dir, "future.dat")
	if err := os.WriteFile(future, make([]byte, 10), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(future, real.Add(1000*24*time.Hour), real.Add(1000*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	was := SetFileTime
	t.Cleanup(func() { SetFileTime = was })
	SetFileTime = func(d, n string, at time.Time) error {
		if err := was(d, n, at); err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(d, n), make([]byte, 99), 0o600)
	}
	pass, err := PruneFolder(root, "runs", PruneRule{Group: everyFileItsOwn, MaxBytes: 1000, Guard: time.Minute}, real, never)
	if err != nil {
		t.Fatal(err)
	}
	if pass.BytesBefore != 99 || pass.BytesAfter != 99 || pass.BytesAfter < 0 {
		t.Fatalf("bytes before %d, after %d; want both 99, the size on disk", pass.BytesBefore, pass.BytesAfter)
	}
}

// What a hit promises is Guard minus the refresh: a file played just under the refresh ago is not moved, and is still kept at Guard minus that.
func TestMarkUsedAndGuardKeepAPreviewPlayedJustUnderTheGuardAgo(t *testing.T) {
	root, dir := pruneFolder(t)
	const refresh, guard = time.Minute, 10 * time.Minute
	played := pruneFile(t, dir, "played.dat", 100, refresh-time.Second)
	MarkUsed(dir, "played.dat", refresh, pruneNow)
	rule := PruneRule{Group: everyFileItsOwn, MaxBytes: 1, Guard: guard}
	if _, err := PruneFolder(root, "runs", rule, pruneNow.Add(guard-refresh-time.Second), never); err != nil || !exists(played) {
		t.Fatalf("a file played just under the refresh ago was removed inside Guard minus the refresh: %v", err)
	}
}
