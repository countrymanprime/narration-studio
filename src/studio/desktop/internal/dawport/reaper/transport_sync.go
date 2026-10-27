package reaper

import (
	"context"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/daw"
	"desktop/internal/dawport"
)

// transportSyncer is the transport_sync role over bridge's set_cursor, play_from, stop_play and watch_transport (narration_transport.lua). It
// only asks the capability first and translates; the script owns what each does in REAPER.
type transportSyncer struct {
	actions *bridge.Actions
	allowed func(dawport.Capability) error
	feed    *daw.PositionFeed
}

var _ dawport.TransportSyncer = transportSyncer{}

// OnPosition sets the function told each TRANSPORT event the bridge streams while a Watch lease holds.
func (s transportSyncer) OnPosition(handler func(dawport.TransportPosition)) {
	s.feed.OnPosition(handler)
}

func (s transportSyncer) check() error {
	if s.allowed == nil {
		return nil
	}
	return s.allowed(dawport.CapTransportSync)
}

// SetCursor puts the edit cursor at seconds and returns the cursor REAPER holds. The capability's own refusal is returned first.
func (s transportSyncer) SetCursor(ctx context.Context, seconds float64) (float64, error) {
	if err := s.check(); err != nil {
		return 0, err
	}
	return s.actions.SetCursor(ctx, seconds)
}

// PlayFrom starts the transport at seconds and returns the time it was told to play from.
func (s transportSyncer) PlayFrom(ctx context.Context, seconds float64) (float64, error) {
	if err := s.check(); err != nil {
		return 0, err
	}
	return s.actions.PlayFrom(ctx, seconds)
}

// PlayRange plays the project from `from` to `to` and has REAPER stop itself at `to`; it returns the stretch REAPER took.
func (s transportSyncer) PlayRange(ctx context.Context, from, to float64) (float64, float64, error) {
	if err := s.check(); err != nil {
		return 0, 0, err
	}
	return s.actions.PlayRange(ctx, from, to)
}

// Stop stops a playing or paused transport and returns the edit cursor after it. A recording is never stopped.
func (s transportSyncer) Stop(ctx context.Context) (float64, error) {
	if err := s.check(); err != nil {
		return 0, err
	}
	return s.actions.StopPlay(ctx)
}

// Watch takes or renews the lease on the position stream and returns the lease granted.
func (s transportSyncer) Watch(ctx context.Context, lease time.Duration) (time.Duration, error) {
	if err := s.check(); err != nil {
		return 0, err
	}
	return s.actions.WatchTransport(ctx, lease)
}
