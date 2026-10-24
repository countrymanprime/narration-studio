package teleprompter

import (
	"encoding/json"

	"desktop/internal/roomtone"
)

// SetRoomTone has every capture from now on measure its microphone's room tone into meter (#2251 item 10).
func (s *Service) SetRoomTone(meter *roomtone.Meter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.roomTone = meter
}

// RoomTone answers device's kept room tone, if one was measured.
func (s *Service) RoomTone(device string) (roomtone.Reading, bool) {
	s.mu.RLock()
	meter := s.roomTone
	s.mu.RUnlock()
	if meter == nil {
		return roomtone.Reading{}, false
	}
	return meter.Reading(device)
}

// levelReading is the part of a sidecar `level` event the room tone reads: its RMS in dBFS.
type levelReading struct {
	RMS *float64 `json:"rms"`
}

// observeLevel gives one `level` event of device's capture to the room tone meter. A level with no RMS, or a capture
// with no microphone (a WAV), measures nothing.
func (s *Service) observeLevel(device string, raw json.RawMessage) {
	s.mu.RLock()
	meter := s.roomTone
	s.mu.RUnlock()
	if meter == nil || device == "" {
		return
	}
	var level levelReading
	if json.Unmarshal(raw, &level) != nil || level.RMS == nil {
		return
	}
	meter.Observe(device, s.clock(), *level.RMS)
}

// endRoomTone ends device's capture: the meter keeps its last floor and starts afresh next time.
func (s *Service) endRoomTone(device string) {
	s.mu.RLock()
	meter := s.roomTone
	s.mu.RUnlock()
	if meter != nil && device != "" {
		meter.Stop(device)
	}
}
