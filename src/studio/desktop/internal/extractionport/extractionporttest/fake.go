package extractionporttest

import (
	"context"
	"slices"

	"github.com/countrymanprime/narration-utils/shell/internal/extractionport"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
)

// Fake is a test-only extraction source: it is what its fields say, and its extractor offers Raws.
type Fake struct {
	ID       string
	IconName string
	Starts   bool
	Scores   bool
	AssetIDs []string
	// Unavailable is the reason the source cannot run; empty when it can.
	Unavailable string
	Raws        []extractionport.Raw
	// Panics makes Extract panic; IgnoresCancel makes it answer as if its context were never cancelled.
	Panics        bool
	IgnoresCancel bool
}

var _ extractionport.Source = Fake{}

// NewFake is an available source called name that the narrator can start, gives confidences and offers raws.
func NewFake(name string, raws ...extractionport.Raw) Fake {
	return Fake{ID: name, IconName: "list", Starts: true, Scores: true, Raws: raws}
}

// Name is ID.
func (f Fake) Name() string { return f.ID }

// Icon is IconName.
func (f Fake) Icon() string { return f.IconName }

// Runs is Starts.
func (f Fake) Runs() bool { return f.Starts }

// Assets is a copy of AssetIDs.
func (f Fake) Assets() []string { return slices.Clone(f.AssetIDs) }

// Scored is Scores.
func (f Fake) Scored() bool { return f.Scores }

// Available is ok unless Unavailable gives a reason.
func (f Fake) Available() extractionport.Availability {
	if f.Unavailable != "" {
		return extractionport.Availability{Reason: f.Unavailable}
	}
	return extractionport.Availability{OK: true}
}

// Extractor refuses with Unavailable when it is set, and otherwise offers Raws.
func (f Fake) Extractor() (extractionport.Extractor, error) {
	if f.Unavailable != "" {
		return nil, &port.NotSupportedError{
			Capability: f.ID,
			Support:    port.Support{Level: port.NotYetAvailable, Reason: port.ReasonNotYet, Message: f.Unavailable},
		}
	}
	return fakeExtractor{f}, nil
}

type fakeExtractor struct{ f Fake }

func (e fakeExtractor) Extract(ctx context.Context, _ extractionport.Input) ([]extractionport.Raw, error) {
	if e.f.Panics {
		panic("the fake extractor broke")
	}
	if err := ctx.Err(); err != nil && !e.f.IgnoresCancel {
		return nil, err
	}
	return slices.Clone(e.f.Raws), nil
}
