package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bookmarks"
)

// bookmarksManuscript is a two-chapter manuscript the reader would show, written where the manuscript service reads it.
const bookmarksManuscript = `{"schemaVersion":1,"documentId":"doc-1","chapters":[{"id":"c-0001","title":"Chapter One","contentKind":"narration"},{"id":"c-0002","title":"Chapter Two","contentKind":"narration"}],"paragraphs":[{"id":"p-000001","chapterId":"c-0001","index":0,"text":"“Off with her head!” the Queen shouted."},{"id":"p-000002","chapterId":"c-0001","index":1,"text":"The soldiers were silent."},{"id":"p-000003","chapterId":"c-0002","index":2,"text":"Alice was not a bit hurt."}]}`

func bookmarksHost(t *testing.T) (*Host, string) {
	t.Helper()
	project := t.TempDir()
	writeNested(t, filepath.Join(project, "narration-utils", "manuscript", "manuscript.json"), bookmarksManuscript)
	host := NewHost()
	next := host.config
	next.projectFolder = project
	if attached, reason := host.attachProjectLocked(next); !attached {
		t.Fatalf("attach failed: %s", reason)
	}
	return host, project
}

func decodeBookmark(t *testing.T) func(string, error) bookmarks.Resolved {
	return func(payload string, err error) bookmarks.Resolved {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var bookmark bookmarks.Resolved
		if err := json.Unmarshal([]byte(payload), &bookmark); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return bookmark
	}
}

func decodeBookmarks(t *testing.T) func(string, error) []bookmarks.Resolved {
	return func(payload string, err error) []bookmarks.Resolved {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var list []bookmarks.Resolved
		if err := json.Unmarshal([]byte(payload), &list); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return list
	}
}

func TestBookmarksBindingsRoundtripInReadingOrder(t *testing.T) {
	host, _ := bookmarksHost(t)
	if list := decodeBookmarks(t)(host.BookmarksList()); len(list) != 0 {
		t.Fatalf("list of a new project = %+v", list)
	}
	later := decodeBookmark(t)(host.BookmarksAdd("c-0002", "p-000003", 6))
	// A chapter bookmark is a spot at the start of its first line.
	chapter := decodeBookmark(t)(host.BookmarksAdd("c-0001", "p-000001", 0))
	if again := decodeBookmark(t)(host.BookmarksAdd("c-0001", "p-000001", 0)); again.ID != chapter.ID {
		t.Fatalf("the same spot twice = %+v, want %+v", again, chapter)
	}
	updated := decodeBookmark(t)(host.BookmarksUpdate(later.ID, "Alice lands", "Lighter here."))
	if updated.Label != "Alice lands" || updated.Note != "Lighter here." {
		t.Fatalf("updated = %+v", updated)
	}
	list := decodeBookmarks(t)(host.BookmarksList())
	if len(list) != 2 || list[0].ID != chapter.ID || list[1].ID != later.ID || list[1].Label != "Alice lands" {
		t.Fatalf("list = %+v", list)
	}
	remaining := decodeBookmarks(t)(host.BookmarksRemove(chapter.ID))
	if len(remaining) != 1 || remaining[0].ID != later.ID {
		t.Fatalf("after remove = %+v", remaining)
	}
}

func TestBookmarksBindingsRefuseASpotTheManuscriptLacks(t *testing.T) {
	host, project := bookmarksHost(t)
	for _, spot := range []struct {
		chapterID, paragraphID string
		offset                 int
	}{{"c-0009", "p-000001", 0}, {"c-0002", "p-000001", 0}, {"c-0001", "p-000002", 26}, {"c-0001", "p-000002", -1}} {
		if _, err := host.BookmarksAdd(spot.chapterID, spot.paragraphID, spot.offset); err == nil {
			t.Errorf("a bookmark at %+v was saved", spot)
		}
	}
	if _, err := os.Stat(bookmarks.File(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused add wrote the file: %v", err)
	}
}

// The bindings take ids, offsets and plain text, never a path: a label or note shaped like one is stored as text and nothing
// at that path is opened or written.
func TestBookmarksBindingsStoreAPathShapedLabelAsText(t *testing.T) {
	host, project := bookmarksHost(t)
	added := decodeBookmark(t)(host.BookmarksAdd("c-0001", "p-000002", 4))
	outside := filepath.Join(filepath.Dir(project), "bookmark-target.txt")
	updated := decodeBookmark(t)(host.BookmarksUpdate(added.ID, "../../../etc/passwd", outside))
	if updated.Label != "../../../etc/passwd" || updated.Note != outside {
		t.Fatalf("updated = %+v", updated)
	}
	if _, err := os.Stat(outside); !os.IsNotExist(err) {
		t.Fatalf("a path-shaped note touched the file system: %v", err)
	}
	raw, err := os.ReadFile(bookmarks.File(project))
	if err != nil || !strings.Contains(string(raw), "../../../etc/passwd") {
		t.Fatalf("the label was not stored as text: %s, %v", raw, err)
	}
}

func TestBookmarksBindingsWithNoProject(t *testing.T) {
	host := NewHost()
	if payload, err := host.BookmarksList(); err != nil || payload != "[]" {
		t.Fatalf("list with no project = %s, %v", payload, err)
	}
	if _, err := host.BookmarksAdd("c-0001", "p-000001", 0); err == nil {
		t.Fatal("an add with no project succeeded")
	}
	if _, err := host.BookmarksUpdate("x", "", ""); err == nil {
		t.Fatal("an update with no project succeeded")
	}
	if _, err := host.BookmarksRemove("x"); err == nil {
		t.Fatal("a remove with no project succeeded")
	}
}

// Replacing the manuscript is the import's own test (internal/manuscript); Clear project data through its binding removes
// the file too.
func TestClearProjectDataRemovesBookmarks(t *testing.T) {
	host, project := bookmarksHost(t)
	decodeBookmark(t)(host.BookmarksAdd("c-0001", "p-000002", 4))
	if _, err := host.ManuscriptClearProjectData(true); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(bookmarks.File(project)); !os.IsNotExist(err) {
		t.Fatalf("bookmarks after Clear project data: %v", err)
	}
}
