package main

import (
	"context"
	"errors"
	"testing"

	"desktop/internal/contractfile"
	"desktop/internal/dawport"
)

func liveReturning(items []dawport.TrackItem, refused *dawport.Result, err error) splitLive {
	return func(context.Context, string) ([]dawport.TrackItem, *dawport.Result, error) {
		return items, refused, err
	}
}

func TestLiveItemsAreTheTracksItemsAsTheDAWHasThemNow(t *testing.T) {
	muted := true
	view := dawLiveItemsIn(context.Background(), liveReturning([]dawport.TrackItem{
		{ItemGUID: "{A}", SourceFile: "C:/a.wav", Position: 12.5, Length: 40, SourceOffset: 3, PlayRate: 1.25},
		{ItemGUID: "{B}", SourceFile: "C:/a.wav", Position: 52.5, Length: 10, PlayRate: 0, Muted: &muted},
	}, nil, nil), "ch1")
	if !view.Available || len(view.Items) != 2 {
		t.Fatalf("view = %+v", view)
	}
	if got := view.Items[0]; got.Guid != "{A}" || got.Position != 12.5 || got.SourceStart != 3 || got.PlayRate != 1.25 || got.Muted {
		t.Fatalf("first = %+v", got)
	}
	if got := view.Items[1]; got.PlayRate != 1 || !got.Muted {
		t.Fatalf("second = %+v (an unset rate is 1, as the bridge's)", got)
	}
}

func TestLiveItemsAnUnreadableTrackIsUnavailableNotAnError(t *testing.T) {
	refusal := dawport.Refused("no")
	for name, live := range map[string]splitLive{
		"refused": liveReturning(nil, &refusal, nil),
		"error":   liveReturning(nil, nil, errors.New("down")),
	} {
		view := dawLiveItemsIn(context.Background(), live, "ch1")
		if view.Available || view.Items == nil || len(view.Items) != 0 {
			t.Fatalf("%s: view = %+v, want unavailable with an empty, non-nil list", name, view)
		}
	}
}

func TestLiveItemsGoldens(t *testing.T) {
	muted := true
	contractfile.Check(t, "daw-live-items", dawLiveItemsIn(context.Background(), liveReturning([]dawport.TrackItem{
		{ItemGUID: "{4F1C0A3E-0000-4000-8000-000000000001}", SourceFile: "C:/Book/chapter-01.wav", Position: 12.5, Length: 40, SourceOffset: 3, PlayRate: 1.25},
		{ItemGUID: "{4F1C0A3E-0000-4000-8000-000000000002}", SourceFile: "C:/Book/chapter-01.wav", Position: 52.5, Length: 10, SourceOffset: 43, PlayRate: 1, Muted: &muted},
	}, nil, nil), "ch1"))
	contractfile.Check(t, "daw-live-items-unavailable", dawLiveItemsIn(context.Background(), liveReturning(nil, nil, errors.New("down")), "ch1"))
}
