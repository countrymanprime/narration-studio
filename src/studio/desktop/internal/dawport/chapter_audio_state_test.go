package dawport

import (
	"context"
	"testing"
)

type oneTrackReader struct{ asked []string }

func (r *oneTrackReader) ChapterTrackState(_ context.Context, guid string) (TrackState, error) {
	r.asked = append(r.asked, "track:"+guid)
	return TrackState{TrackGUID: guid}, nil
}

type folderReader struct{ oneTrackReader }

func (r *folderReader) ChapterFolderState(_ context.Context, guid string) (TrackState, error) {
	r.asked = append(r.asked, "folder:"+guid)
	return TrackState{TrackGUID: guid, Items: []TrackItem{{TrackGUID: "{CHILD}"}}, ItemsTotal: 1}, nil
}

func TestChapterAudioStateReadsTheFolderWhenTheEngineCan(t *testing.T) {
	reader := &folderReader{}
	state, err := ChapterAudioState(context.Background(), reader, "{F}")
	if err != nil {
		t.Fatal(err)
	}
	if len(reader.asked) != 1 || reader.asked[0] != "folder:{F}" || len(state.Items) != 1 {
		t.Fatalf("asked %v, state %+v: want one folder read", reader.asked, state)
	}
}

func TestChapterAudioStateFallsBackToTheTrackOnAnEngineWithNoFolders(t *testing.T) {
	reader := &oneTrackReader{}
	if _, err := ChapterAudioState(context.Background(), reader, "{T}"); err != nil {
		t.Fatal(err)
	}
	if len(reader.asked) != 1 || reader.asked[0] != "track:{T}" {
		t.Fatalf("asked %v: want the one-track read", reader.asked)
	}
}
