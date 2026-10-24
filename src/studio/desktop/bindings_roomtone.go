package main

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"desktop/internal/brand"
)

// roomTonePath resolves the per-user room-tone file, alongside series.json. Like seriesPath, this mirrors
// settings.Store's own %APPDATA%-with-%USERPROFILE%-fallback chain rather than sharing it.
func roomTonePath() string {
	if value := os.Getenv("APPDATA"); value != "" {
		return filepath.Join(value, brand.DataFolder, "room-tone.json")
	}
	if value := os.Getenv("USERPROFILE"); value != "" {
		return filepath.Join(value, "AppData", "Roaming", brand.DataFolder, "room-tone.json")
	}
	return filepath.Join("AppData", "Roaming", brand.DataFolder, "room-tone.json")
}

// RoomToneResult is TeleprompterRoomTone's answer: the room tone kept for a microphone (dBFS, when it was last heard,
// how many seconds it was taken from), or every field null when that microphone has none yet.
type RoomToneResult struct {
	DB         *float64 `json:"db"`
	MeasuredAt *string  `json:"measuredAt"`
	Seconds    *float64 `json:"seconds"`
}

// TeleprompterRoomTone answers device's room tone, measured by any capture of it the app ran (a reading session or the
// level meter) and kept in room-tone.json (#2251 item 10). It reads only; nothing is measured by asking.
func (h *Host) TeleprompterRoomTone(device string) (string, error) {
	service := h.services().teleprompter
	if service == nil {
		return "", fmt.Errorf("the teleprompter service is unavailable")
	}
	var result RoomToneResult
	if reading, ok := service.RoomTone(device); ok {
		at := reading.MeasuredAt.UTC().Format(time.RFC3339)
		result = RoomToneResult{DB: &reading.DB, MeasuredAt: &at, Seconds: &reading.Seconds}
	}
	return encodeBinding(result, nil)
}
