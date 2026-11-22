package main

import (
	"strings"
	"testing"

	"desktop/internal/settings"
)

// The number kind: a finite decimal written as plain
// text, inside the field's range and on its step. Any other feature's numeric setting uses the same kind.
func TestValidateNumberSettingAcceptsOnlyAPlainNumberInRangeAndOnStep(t *testing.T) {
	minimum, maximum, tenth, whole := -60.0, 0.0, 0.1, 1.0
	peak := numberSpec{min: &minimum, max: &maximum, step: &tenth, unit: "dBTP"}
	count := numberSpec{min: &maximum, step: &whole, unit: "words"}
	free := numberSpec{}
	cases := []struct {
		name    string
		spec    numberSpec
		value   string
		wantErr string
	}{
		{"a negative decimal", peak, "-3.5", ""},
		{"the minimum itself", peak, "-60", ""},
		{"the maximum itself", peak, "0", ""},
		{"a leading zero decimal", peak, "-0.1", ""},
		{"a value computed with float error still on step", peak, "-2.3", ""},
		{"empty", peak, "", "must be a number"},
		{"a word", peak, "loud", "must be a number"},
		{"a unit suffix", peak, "-3 dB", "must be a number"},
		{"surrounding space", peak, " -3", "must be a number"},
		{"an exponent", peak, "-3e0", "must be a number"},
		{"a hex float", peak, "0x1p-2", "must be a number"},
		{"NaN", peak, "NaN", "must be a number"},
		{"Inf", peak, "Inf", "must be a number"},
		{"a plus sign", peak, "+1", "must be a number"},
		{"a comma decimal", peak, "-3,5", "must be a number"},
		{"below the minimum", peak, "-60.1", "between -60 and 0 dBTP"},
		{"above the maximum", peak, "0.5", "between -60 and 0 dBTP"},
		{"off the step", peak, "-3.25", "in steps of 0.1"},
		{"a whole count", count, "3", ""},
		{"a fractional count", count, "2.5", "in steps of 1"},
		{"a count below its minimum", count, "-1", "at least 0 words"},
		{"no range at all", free, "123456.789", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateNumberSetting("limit", tc.spec, tc.value)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("validateNumberSetting(%q) = %v, want no error", tc.value, err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) || !strings.Contains(err.Error(), "limit") {
				t.Fatalf("validateNumberSetting(%q) = %v, want an error naming the setting and containing %q", tc.value, err, tc.wantErr)
			}
		})
	}
}

// Every number field declares its range, and every declared range belongs to a number field, so a field can never
// reach the page (or a save) without the bounds that validate it.
func TestEveryNumberFieldHasARangeAndEveryRangeAField(t *testing.T) {
	for tool, schemas := range fieldSchemas {
		for _, schema := range schemas {
			_, declared := numberSpecs[tool][schema.key]
			if schema.kind == "number" && !declared {
				t.Errorf("%s.%s is a number field with no numberSpecs entry", tool, schema.key)
			}
			if schema.kind != "number" && declared {
				t.Errorf("%s.%s has a numberSpecs entry but kind %q", tool, schema.key, schema.kind)
			}
		}
	}
	for tool, specs := range numberSpecs {
		for key := range specs {
			if _, ok := schemaFor(tool, key); !ok {
				t.Errorf("numberSpecs names %s.%s, which is not a field", tool, key)
			}
		}
	}
}

// A number field's shipped default is a value its own range accepts, so the page never opens on a value a save of the
// same text would refuse. A field with no default reads back "" (unset) and is skipped.
//
// defaultsOffTheirStep lists the defaults that fail today: the two Cleanup thresholds count their 0.5 dB step from a
// minimum of 0.1, so 12 and 30 are off it. Shrink-only: fix the range and delete the entry, never add one.
func TestEveryNumberFieldsDefaultPassesItsOwnRange(t *testing.T) {
	defaultsOffTheirStep := map[string]bool{"Cleanup.breath_below_speech_db": true, "Cleanup.click_above_silence_db": true}
	host := newTestHostForDeliverySettings(t, t.TempDir())
	for tool, schemas := range fieldSchemas {
		for _, schema := range schemas {
			if schema.kind != "number" {
				continue
			}
			value, _ := host.settings.Effective(tool, schema.key, "")
			if value == "" {
				continue
			}
			err := validateSettingValue(tool, schema, value)
			known := defaultsOffTheirStep[tool+"."+schema.key]
			if err != nil && !known {
				t.Errorf("%s.%s default %q: %v", tool, schema.key, value, err)
			}
			if err == nil && known {
				t.Errorf("%s.%s default %q now passes: delete it from defaultsOffTheirStep", tool, schema.key, value)
			}
		}
	}
}

// Room tone per credits file is a number of whole seconds from 0 to 10. The values the old choice list stored ("0" to
// "10") stay valid, and the default is still 0.
func TestRoomToneIsAWholeNumberOfSecondsFromZeroToTen(t *testing.T) {
	host := newTestHostForDeliverySettings(t, t.TempDir())
	schema, ok := schemaFor("General", "credits_room_tone_seconds")
	if !ok || schema.kind != "number" || len(schema.choices) != 0 {
		t.Fatalf("credits_room_tone_seconds = %+v, want a number field with no choices", schema)
	}
	if got := numberSpecs["General"]["credits_room_tone_seconds"].wire(); got["min"] != 0.0 || got["max"] != 10.0 || got["step"] != 1.0 || got["unit"] != "s" {
		t.Fatalf("range = %v, want 0 to 10 s in steps of 1", got)
	}
	for _, stored := range []string{"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"} {
		if err := host.saveSettings("General", "global", map[string]*string{"credits_room_tone_seconds": ptr(stored)}); err != nil {
			t.Errorf("saveSettings(%q) = %v, want a value the old list stored accepted", stored, err)
		}
		if got := effectiveValues(host, "General")["credits_room_tone_seconds"]; got != stored {
			t.Errorf("effective value after saving %q = %q", stored, got)
		}
	}
	for value, wantErr := range map[string]string{"2.5": "steps of 1", "abc": "must be a number", "11": "between 0 and 10 s", "-1": "between 0 and 10 s", "": "must be a number"} {
		err := host.saveSettings("General", "global", map[string]*string{"credits_room_tone_seconds": ptr(value)})
		if err == nil || !strings.Contains(err.Error(), wantErr) {
			t.Errorf("saveSettings(%q) = %v, want an error containing %q", value, err, wantErr)
		}
	}
	if err := host.saveSettings("General", "global", map[string]*string{"credits_room_tone_seconds": nil}); err != nil {
		t.Fatalf("clearing the value: %v", err)
	}
	if got := effectiveValues(host, "General")["credits_room_tone_seconds"]; got != "0" {
		t.Fatalf("default after clearing = %q, want 0", got)
	}
}

// The old Delivery limits (src/studio/desktop/settings_number.go) left the settings page when delivery profiles replaced them:
// the keys stay in the settings files, read once to move them into a profile, and no field offers them.
func TestTheOldDeliveryLimitsAreNoLongerSettings(t *testing.T) {
	if fields := fieldSchemas["Delivery"]; len(fields) != 0 {
		t.Fatalf("Delivery fields = %v, want none: the profile judges, not settings", fields)
	}
	if specs := numberSpecs["Delivery"]; len(specs) != 0 {
		t.Fatalf("Delivery number ranges = %v, want none", specs)
	}
}

func TestSettingsForScopeSendsTheRangeOfANumberField(t *testing.T) {
	host := newTestHostForDeliverySettings(t, t.TempDir())
	result, err := host.settingsForScope("global")
	if err != nil {
		t.Fatal(err)
	}
	fields, _ := result["RecordingCoverage"].([]map[string]any)
	var run map[string]any
	for _, field := range fields {
		if field["key"] == "max_missing_run" {
			run = field
		}
	}
	if run == nil || run["kind"] != "number" {
		t.Fatalf("RecordingCoverage fields = %v, want max_missing_run as a number", fields)
	}
	number, _ := run["number"].(map[string]any)
	if number["unit"] != "words" || number["step"] != 1.0 || number["min"] == nil || number["max"] == nil {
		t.Fatalf("number = %v, want its range, step and unit", run["number"])
	}
	general, _ := result["General"].([]map[string]any)
	if _, ok := general[0]["number"]; ok {
		t.Fatalf("a non-number field must not carry a range: %v", general[0])
	}
}

func TestSavingANumberSettingValidatesItAndStoresIt(t *testing.T) {
	host := newTestHostForDeliverySettings(t, t.TempDir())
	if err := host.saveSettings("RecordingCoverage", "global", map[string]*string{"max_missing_run": ptr("many")}); err == nil || !strings.Contains(err.Error(), "must be a number") {
		t.Fatalf("saveSettings(many) = %v, want a non-numeric value rejected", err)
	}
	if err := host.saveSettings("RecordingCoverage", "global", map[string]*string{"max_missing_run": ptr("7")}); err != nil {
		t.Fatal(err)
	}
	if value, source := host.settings.Effective("RecordingCoverage", "max_missing_run", ""); value != "7" || source != "global" {
		t.Fatalf("Effective() = %q from %s, want 7 from global", value, source)
	}
}

func newTestHostForDeliverySettings(t *testing.T, projectFolder string) *Host {
	t.Helper()
	appData := t.TempDir()
	t.Setenv("APPDATA", appData)
	t.Setenv("USERPROFILE", appData)
	host := &Host{settings: settings.New(t.TempDir(), projectFolder)}
	host.config.projectFolder = projectFolder
	return host
}

func effectiveValues(host *Host, tool string) map[string]string {
	values := map[string]string{}
	for _, schema := range fieldSchemas[tool] {
		values[schema.key], _ = host.settings.Effective(tool, schema.key, "")
	}
	return values
}
