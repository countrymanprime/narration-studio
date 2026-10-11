package main

import (
	"path/filepath"
	"strings"
	"testing"
)

// The four bindings' payloads, the goldens the UI's schemas are checked against: an empty list, an added bookmark, an updated
// one, the list in reading order with a stale bookmark, and what a remove leaves.
func TestBookmarksContractGoldens(t *testing.T) {
	host, project := bookmarksHost(t)
	payload, err := host.BookmarksList()
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "bookmarks-list-empty", payload)

	// "the Queen" after the closing curly quote: UTF-16 offset 21.
	payload, err = host.BookmarksAdd("c-0001", "p-000001", 21)
	checkBindingContract(t, "bookmarks-add", payload)
	queen := decodeBookmark(t)(payload, err)

	payload, err = host.BookmarksUpdate(queen.ID, "The Queen", "Shout, but do not clip the end.")
	checkBindingContract(t, "bookmarks-update", payload)
	decodeBookmark(t)(payload, err)

	soldiers := decodeBookmark(t)(host.BookmarksAdd("c-0001", "p-000002", 20))
	decodeBookmark(t)(host.BookmarksAdd("c-0002", "p-000003", 0))

	// The narrator re-imports a manuscript where the soldiers' line is shorter: that bookmark is stale, never moved.
	edited := strings.Replace(bookmarksManuscript, "The soldiers were silent.", "Silence.", 1)
	writeNested(t, filepath.Join(project, "narration-utils", "manuscript", "manuscript.json"), edited)
	payload, err = host.BookmarksList()
	checkBindingContract(t, "bookmarks-list", payload)
	list := decodeBookmarks(t)(payload, err)
	if len(list) != 3 || list[1].ID != soldiers.ID || !list[1].Stale || list[0].Stale || list[2].Stale {
		t.Fatalf("list = %s", payload)
	}

	payload, err = host.BookmarksRemove(soldiers.ID)
	checkBindingContract(t, "bookmarks-remove", payload)
	if remaining := decodeBookmarks(t)(payload, err); len(remaining) != 2 {
		t.Fatalf("after remove = %s", payload)
	}
}
