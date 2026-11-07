package voicesample

// A removed sample takes its region with it, and a mark whose store write then fails takes it back (issue 3122, ruling 4 on 3121). The
// DAW answering "no" (recording, a refusal, an engine without the role, no answer) never fails the removal of the sample: the region
// stays and the narrator is told in a plain sentence. The state matrix for the delete, each cell with the test that drives it:
//
//	project sample removed          TestRemovingAProjectSampleNeverAsksTheDaw
//	daw / both sample removed       TestRemovingADawSampleDeletesItsRegionAndTheSampleIsGone
//	the region is already gone      TestARegionTheDawNoLongerHasIsNotReported
//	the DAW refuses (recording)     TestADawThatWillNotDeleteTheRegionLeavesItAndSaysSo
//	the DAW cannot (no role)        TestADawThatWillNotDeleteTheRegionLeavesItAndSaysSo
//	the DAW did not answer          TestADawThatWillNotDeleteTheRegionLeavesItAndSaysSo
//	the store write fails after the
//	region was added                TestAMarkWhoseStoreWriteFailsTakesItsRegionBack
//	... and the DAW refuses that    TestAMarkWhoseStoreWriteFailsTakesItsRegionBack
//	remove all                      TestRemovingEverySampleDeletesTheirRegions
//	the DAW never answers late, repeats or restarts: the role's own tests; here the DAW answers or fails.

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// deletingRegions is a DAW that keeps and also deletes regions.
type deletingRegions struct {
	fakeRegions
	deleted   []int
	deleteErr error
	outcome   string
	// afterAdd runs once the region is added, so a test can break what the mark does next.
	afterAdd func()
	// beforeDelete runs as a delete arrives, before it answers.
	beforeDelete  func()
	deleteCtxErrs []error
	// listed, when not nil, is what read-back finds: the regions the project holds.
	listed *[]dawport.VoiceSampleRegion
	added  []dawport.VoiceSampleRegion
	reads  int
}

func (f *deletingRegions) ReadVoiceSampleRegions(context.Context) (dawport.VoiceSampleRegions, error) {
	f.reads++
	if f.listed == nil {
		return dawport.VoiceSampleRegions{Regions: f.added}, nil
	}
	return dawport.VoiceSampleRegions{Regions: *f.listed}, nil
}

func (f *deletingRegions) AddVoiceSampleRegion(ctx context.Context, start, end float64, name string) (dawport.VoiceSampleRegionKept, error) {
	kept, err := f.fakeRegions.AddVoiceSampleRegion(ctx, start, end, name)
	if err == nil {
		f.added = append(f.added, dawport.VoiceSampleRegion{Number: kept.Number, Start: start, End: end, Name: name})
	}
	if err == nil && f.afterAdd != nil {
		f.afterAdd()
	}
	return kept, err
}

func (f *deletingRegions) DeleteVoiceSampleRegion(ctx context.Context, number int) (dawport.VoiceSampleRegionRemoved, error) {
	f.deleteCtxErrs = append(f.deleteCtxErrs, ctx.Err())
	if f.beforeDelete != nil {
		f.beforeDelete()
	}
	f.deleted = append(f.deleted, number)
	if f.deleteErr != nil {
		return dawport.VoiceSampleRegionRemoved{}, f.deleteErr
	}
	outcome := f.outcome
	if outcome == "" {
		outcome = "deleted"
	}
	return dawport.VoiceSampleRegionRemoved{Number: number, Outcome: outcome}, nil
}

// notices collects what the narrator would be told.
func (r *rig) notices() *[]string {
	var told []string
	r.config.Reporter.Notify = func(text string) { told = append(told, text) }
	r.config.Reporter.Log = func(string, string) {}
	r.service = r.build()
	return &told
}

func (r *rig) useDeleting(storage string, regions *deletingRegions) {
	r.config.Storage = func() string { return storage }
	r.config.Regions = regions
	r.config.CharacterName = func(id string) string { return map[string]string{"hatter": "Hatter"}[id] }
	r.service = r.build()
}

func TestRemovingAProjectSampleNeverAsksTheDaw(t *testing.T) {
	r := newRig(t)
	regions := &deletingRegions{}
	r.useDeleting(StorageProject, regions)
	sample := r.mustMark(request(10, 12))
	if removed, err := r.service.Remove(sample.ID); err != nil || removed.Removed != 1 {
		t.Fatalf("removed = %+v, %v", removed, err)
	}
	if len(regions.deleted) != 0 || len(regions.calls) != 0 {
		t.Fatalf("the DAW was asked for a project sample: added %q deleted %v", regions.calls, regions.deleted)
	}
}

func TestRemovingADawSampleDeletesItsRegionAndTheSampleIsGone(t *testing.T) {
	for _, storage := range []string{StorageDAW, StorageBoth} {
		t.Run(storage, func(t *testing.T) {
			r := newRig(t)
			regions := &deletingRegions{}
			r.useDeleting(storage, regions)
			told := r.notices()
			sample := r.mustMark(request(10, 12))
			number := r.stored().Samples[0].DawRegion.Number
			removed, err := r.service.Remove(sample.ID)
			if err != nil || removed.Removed != 1 {
				t.Fatalf("removed = %+v, %v", removed, err)
			}
			if fmt.Sprint(regions.deleted) != fmt.Sprint([]int{number}) {
				t.Fatalf("deleted regions = %v, want [%d]", regions.deleted, number)
			}
			if len(r.stored().Samples) != 0 || len(r.clipFiles()) != 0 {
				t.Fatalf("the sample or its clip is still there: %+v %v", r.stored().Samples, r.clipFiles())
			}
			if len(*told) != 0 {
				t.Fatalf("the narrator was told something about a clean removal: %q", *told)
			}
		})
	}
}

func TestARegionTheDawNoLongerHasIsNotReported(t *testing.T) {
	for _, c := range []struct {
		name    string
		outcome string
		err     error
	}{
		{"already gone", "unchanged", nil},
		{"now another kind of region", "", &bridge.VoiceSampleRegionStaleError{Number: 1}},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := newRig(t)
			regions := &deletingRegions{outcome: c.outcome, deleteErr: c.err}
			r.useDeleting(StorageDAW, regions)
			told := r.notices()
			sample := r.mustMark(request(10, 12))
			if removed, err := r.service.Remove(sample.ID); err != nil || removed.Removed != 1 {
				t.Fatalf("removed = %+v, %v", removed, err)
			}
			if len(regions.deleted) != 1 || len(*told) != 0 {
				t.Fatalf("deleted %v, told %q", regions.deleted, *told)
			}
		})
	}
}

func TestADawThatWillNotDeleteTheRegionLeavesItAndSaysSo(t *testing.T) {
	for _, c := range []struct {
		name string
		err  error
		have bool
	}{
		{"recording", bridge.ErrRecording, true},
		{"refused by the DAW", &bridge.RefusalError{Sentence: "no"}, true},
		{"the engine cannot", dawport.ErrNotSupported, true},
		{"did not answer", errors.New("REAPER did not answer"), true},
		{"not connected", nil, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := newRig(t)
			regions := &deletingRegions{}
			r.useDeleting(StorageBoth, regions)
			sample := r.mustMark(request(10, 12))
			if c.have {
				regions.deleteErr = c.err
			} else {
				r.config.Regions = &fakeRegions{} // a DAW that can add but not delete, or none now
				r.config.Reporter.Log = func(string, string) {}
				r.service = r.build()
			}
			told := r.notices()
			removed, err := r.service.Remove(sample.ID)
			if err != nil || removed.Removed != 1 {
				t.Fatalf("a DAW that would not delete must not fail the removal: %+v, %v", removed, err)
			}
			if len(r.stored().Samples) != 0 {
				t.Fatalf("the sample is still there: %+v", r.stored().Samples)
			}
			if len(*told) != 1 || !strings.Contains((*told)[0], "region") || !strings.Contains((*told)[0], "stays") {
				t.Fatalf("told = %q, want one plain sentence saying the region stays", *told)
			}
		})
	}
}

func TestAMarkWhoseStoreWriteFailsTakesItsRegionBack(t *testing.T) {
	for _, c := range []struct {
		name      string
		deleteErr error
		wantTold  int
	}{{"the DAW deletes it", nil, 0}, {"the DAW refuses to", bridge.ErrRecording, 1}} {
		t.Run(c.name, func(t *testing.T) {
			r := newRig(t)
			regions := &deletingRegions{deleteErr: c.deleteErr}
			r.useDeleting(StorageDAW, regions)
			told := r.notices()
			// Once the region is added, the store cannot be read again, as a disk that failed in between.
			regions.afterAdd = func() {
				if err := os.MkdirAll(r.storePath(), 0o755); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := r.mark(request(10, 12)); err == nil {
				t.Fatal("the mark succeeded although the store could not be written")
			}
			if fmt.Sprint(regions.deleted) != "[1]" {
				t.Fatalf("deleted regions = %v, want the one just added", regions.deleted)
			}
			if len(*told) != c.wantTold || (c.wantTold == 1 && !strings.Contains((*told)[0], "could not be kept")) {
				t.Fatalf("told = %q, want %d (a sentence about the mark, not about a removal)", *told, c.wantTold)
			}
		})
	}
}

func TestRemovingEverySampleDeletesTheirRegions(t *testing.T) {
	r := newRig(t)
	regions := &deletingRegions{}
	r.useDeleting(StorageDAW, regions)
	r.mustMark(request(10, 12))
	r.mustMark(request(20, 22))
	if removed, err := r.service.RemoveAll(); err != nil || removed.Removed != 2 {
		t.Fatalf("removed = %+v, %v", removed, err)
	}
	if fmt.Sprint(regions.deleted) != "[1 2]" {
		t.Fatalf("deleted regions = %v, want [1 2]", regions.deleted)
	}
}

// The DAW can take as long as its timeout, and every other voice sample writer waits for the store's lock: no DAW call runs under it.
func TestNoDawDeleteRunsUnderTheStoreLock(t *testing.T) {
	probe := func(r *rig, t *testing.T) func() {
		return func() {
			got := make(chan func(), 1)
			go func() { got <- lockFile(storePath(r.project)) }()
			select {
			case unlock := <-got:
				unlock()
			case <-time.After(2 * time.Second):
				t.Error("the store lock was still held during the DAW's delete")
			}
		}
	}
	t.Run("remove", func(t *testing.T) {
		r := newRig(t)
		regions := &deletingRegions{}
		r.useDeleting(StorageDAW, regions)
		sample := r.mustMark(request(10, 12))
		regions.beforeDelete = probe(r, t)
		if _, err := r.service.Remove(sample.ID); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("a mark that could not be kept", func(t *testing.T) {
		r := newRig(t)
		regions := &deletingRegions{}
		r.useDeleting(StorageDAW, regions)
		regions.afterAdd = func() { _ = os.MkdirAll(r.storePath(), 0o755) }
		regions.beforeDelete = probe(r, t)
		if _, err := r.mark(request(10, 12)); err == nil {
			t.Fatal("the mark succeeded")
		}
		if len(regions.deleted) != 1 {
			t.Fatalf("deleted = %v", regions.deleted)
		}
	})
}

// A request that was cancelled or timed out is a likely reason a mark failed; taking its region back is not the request's to cancel.
func TestACancelledMarkStillTakesItsRegionBack(t *testing.T) {
	r := newRig(t)
	regions := &deletingRegions{}
	r.useDeleting(StorageDAW, regions)
	told := r.notices()
	ctx, cancel := context.WithCancel(context.Background())
	regions.afterAdd = func() {
		cancel()
		_ = os.MkdirAll(r.storePath(), 0o755)
	}
	if _, err := r.service.Mark(ctx, request(10, 12)); err == nil {
		t.Fatal("the mark succeeded")
	}
	if len(regions.deleted) != 1 || regions.deleteCtxErrs[0] != nil || len(*told) != 0 {
		t.Fatalf("deleted %v, ctx errors %v, told %q: the delete must run and be told nothing", regions.deleted, regions.deleteCtxErrs, *told)
	}
}

// The number is the host's record; the region REAPER holds under it may be another sample's if ours was deleted and the number reused,
// or the store came from somewhere else. When the read-back shows another name under it, nothing of ours is left to delete.
func TestARegionTheDawNowHoldsUnderAnotherNameIsNotDeleted(t *testing.T) {
	r := newRig(t)
	regions := &deletingRegions{}
	r.useDeleting(StorageDAW, regions)
	told := r.notices()
	sample := r.mustMark(request(10, 12))
	stored := r.stored().Samples[0].DawRegion
	other := []dawport.VoiceSampleRegion{{Number: stored.Number, Start: 1, End: 2, Name: RegionPrefix + "Alice - another sample [zzzz]"}}
	regions.listed = &other
	if removed, err := r.service.Remove(sample.ID); err != nil || removed.Removed != 1 {
		t.Fatalf("removed = %+v, %v", removed, err)
	}
	if len(regions.deleted) != 0 || len(*told) != 0 {
		t.Fatalf("another sample's region was deleted or reported: deleted %v, told %q", regions.deleted, *told)
	}
	// With our region read back under the number and the name, it is deleted.
	r2 := newRig(t)
	regions2 := &deletingRegions{}
	r2.useDeleting(StorageDAW, regions2)
	sample2 := r2.mustMark(request(10, 12))
	kept := r2.stored().Samples[0].DawRegion
	mine := []dawport.VoiceSampleRegion{{Number: kept.Number, Start: kept.Start, End: kept.End, Name: kept.Name}}
	regions2.listed = &mine
	if _, err := r2.service.Remove(sample2.ID); err != nil || len(regions2.deleted) != 1 || regions2.reads != 1 {
		t.Fatalf("deleted %v after %d reads, err %v", regions2.deleted, regions2.reads, err)
	}
}

// Thirty samples and a DAW that is recording must not mean thirty calls and thirty sentences.
func TestRemovingEverySampleStopsAskingADawThatSaidNoAndTellsOnce(t *testing.T) {
	r := newRig(t)
	regions := &deletingRegions{}
	r.useDeleting(StorageDAW, regions)
	told := r.notices()
	r.mustMark(request(10, 12))
	r.mustMark(request(20, 22))
	r.mustMark(request(30, 32))
	regions.deleteErr = bridge.ErrRecording
	if removed, err := r.service.RemoveAll(); err != nil || removed.Removed != 3 {
		t.Fatalf("removed = %+v, %v", removed, err)
	}
	if len(regions.deleted) != 1 {
		t.Fatalf("a DAW that said it is recording was asked %d times: %v", len(regions.deleted), regions.deleted)
	}
	if len(*told) != 1 || !strings.Contains((*told)[0], "3 of their regions stay") || !strings.Contains((*told)[0], "recording") {
		t.Fatalf("told = %q", *told)
	}
}

func TestAnInvalidRegionNumberIsWordedLikeARefusal(t *testing.T) {
	if got := whyRegionStays(bridge.ErrBadVoiceSampleRegion); got != "because the DAW would not delete it" {
		t.Fatalf("got %q", got)
	}
}

// removerOnly can delete a region but not read the regions back: the host cannot tell whose region a number holds, so it deletes none.
type removerOnly struct {
	fakeRegions
	deleted []int
}

func (f *removerOnly) DeleteVoiceSampleRegion(_ context.Context, number int) (dawport.VoiceSampleRegionRemoved, error) {
	f.deleted = append(f.deleted, number)
	return dawport.VoiceSampleRegionRemoved{Number: number, Outcome: "deleted"}, nil
}

func TestADawThatCannotReadTheRegionsBackIsNotAskedToDeleteByNumberAlone(t *testing.T) {
	r := newRig(t)
	regions := &removerOnly{}
	r.config.Storage = func() string { return StorageDAW }
	r.config.Regions = regions
	r.config.CharacterName = func(id string) string { return map[string]string{"hatter": "Hatter"}[id] }
	r.service = r.build()
	told := r.notices()
	sample := r.mustMark(request(10, 12))
	if removed, err := r.service.Remove(sample.ID); err != nil || removed.Removed != 1 {
		t.Fatalf("removed = %+v, %v", removed, err)
	}
	if len(regions.deleted) != 0 {
		t.Fatalf("a region was deleted by its number alone: %v", regions.deleted)
	}
	if len(*told) != 1 || !strings.Contains((*told)[0], "stays") {
		t.Fatalf("told = %q, want the region stays", *told)
	}
}
