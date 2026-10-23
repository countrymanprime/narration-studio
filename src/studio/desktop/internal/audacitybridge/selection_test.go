package audacitybridge_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	abt "github.com/countrymanprime/narration-utils/shell/internal/audacitybridge/audacitybridgetest"
)

func TestSelectionReadsTheCursorAndTheRange(t *testing.T) {
	client, server := newClient(t, time.Second)
	ctx := context.Background()
	if err := client.SelectTime(ctx, 12.5, 12.5); err != nil {
		t.Fatal(err)
	}
	if start, end, err := client.Selection(ctx); err != nil || start != 12.5 || end != 12.5 {
		t.Errorf("cursor = %v, %v, %v", start, end, err)
	}
	if err := client.SelectTime(ctx, 3, 7.5); err != nil {
		t.Fatal(err)
	}
	if start, end, err := client.Selection(ctx); err != nil || start != 3 || end != 7.5 {
		t.Errorf("range = %v, %v, %v", start, end, err)
	}
	server.With(func(p *abt.Project) { p.NoProject = true })
	if _, _, err := client.Selection(ctx); !errors.Is(err, audacitybridge.ErrNoProject) {
		t.Errorf("no project = %v", err)
	}
}
