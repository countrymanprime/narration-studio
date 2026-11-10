package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// DawSaveProject (#3262). What REAPER does is narration_save_project.lua's (save_project_test.lua) and what the role answers is
// dawport/reaper's (save_project_test.go). These cover the host's wiring: the capability, the linked file, the role's answers.

type fakeSaver struct {
	files  []string
	answer dawport.Result
	err    error
}

func (f *fakeSaver) SaveProject(_ context.Context, file string) (dawport.Result, error) {
	f.files = append(f.files, file)
	return f.answer, f.err
}

func TestDawSaveProjectSendsTheLinkedFileAndAnswersTheRolesResult(t *testing.T) {
	saved := dawport.OK("Saved the project in REAPER: 3 tracks and 12 items.", false)
	role := &fakeSaver{answer: saved}
	got, err := dawSaveProjectIn(t.Context(), "REAPER", available(), role, "C:/Books/Book.rpp")
	if err != nil || got.Message != saved.Message || !got.OK || len(role.files) != 1 || role.files[0] != "C:/Books/Book.rpp" {
		t.Fatalf("got %+v, %v; asked %v", got, err, role.files)
	}
}

func TestDawSaveProjectRefusesWithNothingAskedWhenItCannotSave(t *testing.T) {
	role := &fakeSaver{}
	off := dawport.Support{Available: false, Message: "Audacity cannot save the project from this app."}
	for name, test := range map[string]struct {
		support dawport.Support
		saver   dawport.ProjectSaver
		file    string
		want    string
	}{
		"capability off": {off, role, "Book.rpp", off.Message},
		"no linked file": {available(), role, "", saveProjectNoLinkSentence},
		"no live engine": {available(), nil, "Book.rpp", "REAPER is not connected to this app, so the project was not saved."},
	} {
		got, err := dawSaveProjectIn(t.Context(), "REAPER", test.support, test.saver, test.file)
		if err != nil || got.OK || got.Refused != test.want {
			t.Errorf("%s: got %+v, %v; want a refusal %q", name, got, err, test.want)
		}
	}
	if len(role.files) != 0 {
		t.Fatalf("asked %v", role.files)
	}
}

func TestDawSaveProjectWordsWhatKeptTheRoleFromAnswering(t *testing.T) {
	for name, test := range map[string]struct {
		err  error
		want string
	}{
		"no answer":   {bridge.ErrNoAnswer, "REAPER is not answering."},
		"unavailable": {bridge.ErrUnavailable, "REAPER is not connected to this app"},
		"late":        {context.DeadlineExceeded, "did not answer the save within 15 seconds"},
		"other":       {errors.New("disk on fire"), "REAPER could not save the project: disk on fire."},
	} {
		got, err := dawSaveProjectIn(t.Context(), "REAPER", available(), &fakeSaver{err: test.err}, "Book.rpp")
		if err != nil || got.OK || !strings.Contains(got.Refused, test.want) {
			t.Errorf("%s: got %+v, %v; want a refusal holding %q", name, got, err, test.want)
		}
	}
}
