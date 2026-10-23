package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// linkAudacityProject records an .aup3 for the fixture's project, as AudacityLinkFile does after the pick.
func linkAudacityProject(t *testing.T, f *audacityLinkFixture) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "Book.aup3")
	writeFile(t, file, "x")
	if err := f.host.linkAudacityFile(file); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestAClosedAudacityGetsScriptingTurnedOnAndIsStartedOnTheLinkedProjectOnce(t *testing.T) {
	f := newAudacityLinkFixture(t)
	f.server.SetDown(true)
	file := linkAudacityProject(t, f)
	f.write(t, "[Module]\nmod-script-pipe=4\n")
	f.host.dawAutoEnabled.Store(true)
	svc := f.host.services()
	f.host.audacityAutoConnect(svc, svc.audacity, f.check(t))
	content, err := os.ReadFile(f.config)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(content), "mod-script-pipe=1") {
		t.Fatalf("scripting is on: %s", content)
	}
	if len(*f.launched) != 1 || len((*f.launched)[0]) != 2 || (*f.launched)[0][1] != file {
		t.Fatalf("Audacity is started on the linked project: %v", *f.launched)
	}
	f.host.audacityAutoConnect(svc, svc.audacity, f.check(t))
	if len(*f.launched) != 1 {
		t.Fatalf("once per opened project: %v", *f.launched)
	}
}

func TestAnOpenAudacityIsNeitherChangedNorStarted(t *testing.T) {
	f := newAudacityLinkFixture(t)
	f.server.SetDown(true)
	linkAudacityProject(t, f)
	f.write(t, "[Module]\nmod-script-pipe=0\n")
	*f.running = true
	f.host.dawAutoEnabled.Store(true)
	svc := f.host.services()
	link := f.check(t)
	f.host.audacityAutoConnect(svc, svc.audacity, link)
	content, _ := os.ReadFile(f.config)
	if strings.Contains(string(content), "mod-script-pipe=1") || len(*f.launched) != 0 {
		t.Fatalf("Audacity writes its settings when it closes, so nothing is written while it runs: %s %v", content, *f.launched)
	}
	if !strings.Contains(link.Message, "Close Audacity") || strings.Contains(link.Message, "another recorder") {
		t.Fatalf("message: %s", link.Message)
	}
}

func TestWithoutTheEnabledFlagAudacityIsLeftAlone(t *testing.T) {
	f := newAudacityLinkFixture(t)
	f.server.SetDown(true)
	linkAudacityProject(t, f)
	f.write(t, "[Module]\nmod-script-pipe=4\n")
	svc := f.host.services()
	f.host.audacityAutoConnect(svc, svc.audacity, f.check(t))
	content, _ := os.ReadFile(f.config)
	if strings.Contains(string(content), "mod-script-pipe=1") || len(*f.launched) != 0 {
		t.Fatal("a host the app's start did not enable changes nothing")
	}
}
