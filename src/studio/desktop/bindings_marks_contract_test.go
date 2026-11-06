package main

import (
	"desktop/internal/brand"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/marks"
)

// The four bindings' payloads, the goldens the UI's schemas are checked against: an added question, the list in reading
// order with a stale mark, what a remove leaves, and the types after the narrator edits them.
func TestMarksContractGoldens(t *testing.T) {
	host, project := bookmarksHost(t)

	// "the Queen" after the closing curly quote: UTF-16 offsets 21 to 30.
	payload, err := host.MarksAdd("c-0001", "p-000001", 21, 30, "ask", "Shrill, or just loud?")
	checkBindingContract(t, "marks-add", payload)
	decodeMark(t)(payload, err)
	soldiers := decodeMark(t)(host.MarksAdd("c-0001", "p-000002", 4, 12, "stress", ""))
	decodeMark(t)(host.MarksAdd("c-0002", "p-000003", 0, 5, "note", "Lighter here.\nShe is not hurt."))

	// The narrator re-imports a manuscript where the soldiers' line changed and Alice's line is gone: both marks are stale,
	// never moved, and the one whose line is gone goes last.
	edited := strings.Replace(bookmarksManuscript, "The soldiers were silent.", "The guards were silent.", 1)
	edited = strings.Replace(edited, `,{"id":"p-000003","chapterId":"c-0002","index":2,"text":"Alice was not a bit hurt."}`, "", 1)
	writeNested(t, filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json"), edited)
	payload, err = host.MarksList()
	checkBindingContract(t, "marks-list", payload)
	list := decodeMarks(t)(payload, err)
	if len(list.Marks) != 3 || list.Marks[0].Stale || list.Marks[1].ID != soldiers.ID || list.Marks[1].StaleReason != "text_changed" || list.Marks[2].StaleReason != "paragraph_missing" || list.Marks[2].Paragraph != nil {
		t.Fatalf("list = %s", payload)
	}

	payload, err = host.MarksRemove(soldiers.ID)
	checkBindingContract(t, "marks-remove", payload)
	if remaining := decodeMarks(t)(payload, err); len(remaining.Marks) != 2 {
		t.Fatalf("after remove = %s", payload)
	}

	types := append([]marks.MarkType{}, list.Types...)
	types[1] = marks.MarkType{Key: "breath", Name: "Breathe", Colour: "ok", Style: "underline"}
	types = append(types, marks.MarkType{Key: "accent", Name: "Accent", Colour: "violet", Style: "box"})
	payload, err = host.MarksSaveTypes(types, false)
	checkBindingContract(t, "marks-types", payload)
	if saved := decodeMarks(t)(payload, err); len(saved.Types) != 7 || saved.Types[1].Name != "Breathe" {
		t.Fatalf("types = %s", payload)
	}
}

// What MarksTypesChanged sends: a JSON boolean. It reads the file only, so a project with old notes and no marks.json stays without one.
func TestContractMarksTypesChangedIsABooleanAndNeverCreatesTheFile(t *testing.T) {
	host, project := bookmarksHost(t)
	file := marks.File(project)
	answer, err := host.MarksTypesChanged()
	if err != nil || answer != "false" {
		t.Fatalf("no file: %q, %v", answer, err)
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatalf("MarksTypesChanged created marks.json: %v", err)
	}
	checkBindingContract(t, "marks-types-changed-default", answer)
	types := append(marks.DefaultTypes(), marks.MarkType{Key: "accent", Name: "Accent", Colour: "violet", Style: "box"})
	if _, err := host.MarksSaveTypes(types, false); err != nil {
		t.Fatal(err)
	}
	answer, err = host.MarksTypesChanged()
	if err != nil || answer != "true" {
		t.Fatalf("after adding a type: %q, %v", answer, err)
	}
	checkBindingContract(t, "marks-types-changed", answer)
}
