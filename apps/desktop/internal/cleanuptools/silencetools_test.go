package cleanuptools

import (
	"context"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/dawporttest"
)

// fakeRoles is a fake REAPER adapter declaring every capability Experimental, so its GainAdjuster role
// (ADR 0300) is available to type-assert, the same way the composition root gets it from the real adapter
// (apps/desktop/app.go).
func fakeRoles(t *testing.T) (*dawporttest.Fake, dawport.GainAdjuster) {
	t.Helper()
	fake := dawporttest.NewFake(dawport.KindREAPER, dawporttest.Levels(dawport.Experimental))
	adjuster, ok := fake.Role(dawport.CapItemGain).(dawport.GainAdjuster)
	if !ok {
		t.Fatal("the fake adapter did not return a GainAdjuster role")
	}
	return fake, adjuster
}

func TestApplyGainDelegatesToTheRole(t *testing.T) {
	fake, adjuster := fakeRoles(t)
	service := New(Config{SessionDir: t.TempDir()}, nil, adjuster, nil)
	candidates := []dawport.GainCandidate{{ItemGUID: "{GUID-A}"}}
	if _, err := service.ApplyGain(context.Background(), candidates); err != nil {
		t.Fatal(err)
	}
	if calls := fake.Calls(); len(calls) != 1 || calls[0] != "item_gain.Apply" {
		t.Fatalf("calls = %v", calls)
	}
}

func TestApplyGainWithoutARoleFails(t *testing.T) {
	service := New(Config{SessionDir: t.TempDir()}, nil, nil, nil)
	if _, err := service.ApplyGain(context.Background(), nil); err == nil || !strings.Contains(err.Error(), "REAPER bridge is unavailable") {
		t.Fatalf("err = %v", err)
	}
}
