package main

import (
	"testing"

	"desktop/internal/dawport"
	"desktop/internal/dawport/dawporttest"
)

// hostWithArmingDAW wires a DAW port whose creator and recorder are the given fakes, so ChapterTrackCreate (the binding every screen calls) finds both.
func hostWithArmingDAW(t *testing.T, host *Host, creator dawport.TrackCreator, recorder dawport.Recorder) {
	t.Helper()
	adapter := rolesAdapter{Fake: dawporttest.NewFake(dawport.KindREAPER, dawporttest.Levels(dawport.Supported)), creator: creator, recorder: recorder}
	host.dawPortResolver = dawport.NewResolver(dawport.ResolverConfig{
		Adapter: adapter,
		Runtime: func() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} },
	})
}

// #3670, the owner's decision: a created track is armed and monitored only by the Booth, open on that chapter, with the follow switch on (the page's own
// arm after the create). ChapterTrackCreate itself arms nothing, whichever screen asked, because arm_lane disarms the narrator's other tracks: creating
// chapter B's track from the Engine panel must not move the arm off the chapter the Booth is on.
func TestChapterTrackCreateNeverArmsAnything(t *testing.T) {
	for name, layout := range map[string]string{"flat": "", "voice folders": "folders"} {
		t.Run(name, func(t *testing.T) {
			host, ids := newTestHostForChapterMatch(t)
			recorder := &fakeLaneRecorder{}
			var creator dawport.TrackCreator = &fakeCreator{}
			if layout != "" {
				setLayout(t, host, layout)
				creator = &fakeFolderCreator{}
			}
			hostWithArmingDAW(t, host, creator, recorder)
			raw, err := host.ChapterTrackCreate(ids[0], "")
			if err != nil {
				t.Fatal(err)
			}
			if decodeBinding(t, raw)["outcome"] != "created" {
				t.Fatalf("answer %s", raw)
			}
			if len(recorder.laneArmed) != 0 || len(recorder.calls) != 0 {
				t.Fatalf("the create armed %v (calls %v): it must leave every arm where the narrator put it", recorder.laneArmed, recorder.calls)
			}
		})
	}
}
