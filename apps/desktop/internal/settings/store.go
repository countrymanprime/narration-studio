// Package settings preserves Narration Utils' three-layer JSON settings
// contract: project overrides, then per-user global settings, then repository
// defaults. It intentionally reads existing files without rewriting schemas.
package settings

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/countrymanprime/narration-utils/shell/internal/layout"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

type Values map[string]string

type Store struct {
	mu sync.Mutex
	// +checklocks:mu
	repo string
	// +checklocks:mu
	project string
	persist atomic.Pointer[persist.Reporter]
}

func New(repo, project string) *Store      { return &Store{repo: repo, project: project} }
func (s *Store) SetProject(project string) { s.mu.Lock(); defer s.mu.Unlock(); s.project = project }

// SetPersist says where to report a settings file that cannot be read (ADR 0069). Without it a corrupt file is still kept aside.
func (s *Store) SetPersist(reporter *persist.Reporter) { s.persist.Store(reporter) }

// reporter is read without s.mu: Save holds it while it reads the file it is about to change.
func (s *Store) reporter() *persist.Reporter { return s.persist.Load() }

func (s *Store) Effective(tool, key, fallback string) (string, string) {
	if value, ok := s.Project(tool)[key]; ok {
		return value, "project"
	}
	if value, ok := s.Global(tool)[key]; ok {
		return value, "global"
	}
	if value, ok := s.Defaults(tool)[key]; ok {
		return value, "repo_default"
	}
	return fallback, "hardcoded"
}

// builtinDefaults mirrors config/defaults.json. That file only exists in
// a source checkout; an installed build has no repo root, so without this every
// effective default read back empty - most visibly the Settings color pickers,
// which rendered #000000 for every color. store_test.go keeps the two in sync.
var builtinDefaults = map[string]Values{
	// notifications defaults on (OS notifications are on by default and opt-out in Settings,
	// docs/architecture/native-notifications.md). debug_logging defaults
	// off (ADR 0251): decision records are opt-in, on the Settings page or with
	// NARRATION_DEBUG=1.
	"General": {"log_verbosity": "normal", "notifications": "true", "credits_room_tone_seconds": "0", "debug_logging": "false"},
	// build_after_import defaults on: the Story Bible is built after import unless the narrator opts out.
	// analysis_prompt defaults to ask: the optional analysis tools are offered until the narrator chooses "Don't ask again" (basic).
	"ManuscriptGuide":   {"spacy_model": "en_core_web_sm", "build_after_import": "true", "analysis_prompt": "ask"},
	"Piper":             {"tts_provider": "piper", "tts_voice_id": "en_US-ljspeech-high"},
	"Updates":           {"check_on_startup": "true", "channel": "candidates"},
	"Manuscript":        {"color_note": "B85C1E"},
	"TranscriptCompare": {"chunk_seconds": "60", "model_size": "small", "color_misread": "FF4040", "color_skipped": "FFC000", "color_extra": "40A0FF"},
	"Teleprompter":      {"engine": "whisper", "model": "tiny", "punch_preroll_seconds": "3"},
	// auto_start_launcher defaults off: the spike that proved REAPER auto-runs a script
	// argument (ADR 0092) does not by itself decide whether the app should always do it.
	// experimental_reaper_actions defaults off (ADR 0230): the bridge commands not yet verified in a real
	// REAPER stay off until the narrator turns them on (internal/bridge/actions.go).
	// capability.<name> is the narrator's per-capability toggle for the DAW port (ADR 0300): auto, on or off, defaulting
	// auto, which is today's behaviour (on when Supported; when Experimental, on only while
	// experimental_reaper_actions is on). One row per dawport capability; dawport's toggles_test.go holds the rows to its catalog.
	// backups.window_seconds and backups.retention_days are the Audacity backups' window either side of an edit and how long a
	// backup is kept (ADR 0863): the process defaults, two minutes and seven days.
	"DAW": {"auto_start_launcher": "false", "experimental_reaper_actions": "false",
		"backups.window_seconds": "120", "backups.retention_days": "7",
		"capability.review": "auto", "capability.navigate": "auto", "capability.markers": "auto", "capability.pickups": "auto",
		"capability.line_identity": "auto", "capability.render_config": "auto", "capability.cleanup_tools": "auto",
		"capability.retake_lanes": "auto", "capability.project_state": "auto", "capability.take_create": "auto",
		"capability.heartbeat": "auto", "capability.project_read": "auto", "capability.track_state": "auto",
		"capability.record": "auto", "capability.punch": "auto", "capability.regions": "auto", "capability.takes": "auto",
		"capability.fx_chains": "auto", "capability.silence_trim": "auto", "capability.item_gain": "auto",
		"capability.track_select": "auto", "capability.render_with_fx": "auto", "capability.master_chain_read": "auto",
		"capability.macro_render": "auto", "capability.cut_range": "auto", "capability.fx_range": "auto",
		"capability.stack_takes": "auto", "capability.backups": "auto",
		"capability.file_preview": "auto", "capability.file_reveal": "auto"},
	// RecordingCoverage mirrors coverage.DefaultSettings: the recording check's shipped values, chosen on synthetic fixtures
	// and still Proposed and uncalibrated on real narration (docs/utilities/recording-coverage.md, ADR 0132).
	// background_checks defaults on: it only ever runs with the model installed, on mains power and while
	// REAPER is idle (coverage.NextBackground, ADR 0211).
	// cascade_enabled defaults off (MC1 in docs/utilities/recording-coverage.md); the two model settings default
	// to tiny (first pass) and large-v3-turbo (re-check), MC2.
	"RecordingCoverage": {
		"min_paragraph_present": "0.8", "max_missing_run": "3", "max_misread_run": "8", "min_anchor_run": "3", "background_checks": "true",
		"cascade_enabled": "false", "cascade_first_pass_model": "tiny", "cascade_recheck_model": "large-v3-turbo",
	},
	// StageRecommendations defaults every signal to required and suggestions on
	// (docs/architecture/stage-recommendations.md): a narrator who never opens this settings page gets the engine's
	// own behaviour, where every declared signal id is required. editing.empty_space, editing.clicks and
	// editing.breaths default to required because all three belong to an edited chapter; the narrator can set
	// editing.clicks or editing.breaths to "ignored" here to leave one out of the recommendation.
	"StageRecommendations": {
		"suggestions_enabled": "true", "recording.text_present": "required",
		"editing.empty_space": "required", "editing.clicks": "required", "editing.breaths": "required",
		// proofing.pickups is the always-required proofing signal.
		"proofing.pickups": "required",
		// The proofing delivery checks default to required; each is required only while the project's delivery profile
		// has a required rule for it (and the length check only while a tolerance is set), so this default blocks nothing
		// the narrator has not limited.
		"proofing.delivery.integrated_lufs": "required", "proofing.delivery.rms_dbfs": "required",
		"proofing.delivery.sample_peak_dbfs": "required", "proofing.delivery.true_peak_dbtp": "required",
		"proofing.delivery.noise_floor_dbfs": "required", "proofing.delivery.sample_rate": "required",
		"proofing.delivery.duration_seconds": "required", "proofing.delivery.head_room_tone_seconds": "required",
		"proofing.delivery.tail_room_tone_seconds": "required", "proofing.delivery.render_length": "required",
	},
	// TakeReview holds the pickup/duplicate detector's thresholds and
	// scan-scope settings (internal/takereview), layered like every
	// other tool here. Thresholds mirror repeats.DefaultThresholds();
	// pickup_track_name and the pickup_range pair are mutually exclusive
	// narrator-designated additions to the chapter track's own items
	// and both default empty (no pickup scope beyond the
	// chapter track).
	"TakeReview": {
		"full_coverage_threshold":          "0.9",
		"near_duplicate_quality_threshold": "0.97",
		"pickup_track_name":                "",
		"pickup_range_start_seconds":       "",
		"pickup_range_end_seconds":         "",
	},
	// Preview mirrors preview.DefaultSettings (docs/architecture/preview-suggestion.md):
	// 5:00 target, 10% tolerance, the Sample preset, ending exclusion off.
	"Preview": {
		"target_seconds":          "300",
		"tolerance_fraction":      "0.1",
		"preset":                  "sample",
		"exclude_ending_fraction": "0",
	},
	// Keymap.overrides: the narrator's remap changes from the input registry's default keymap, as a versioned JSON
	// document of only the gestures that differ from the defaults. Empty bindings is the fresh-install default: every
	// command keeps its shipped gesture until the narrator remaps it. Global scope only (a narrator's pedal belongs
	// to the booth, not the book), enforced in apps/desktop/app.go's saveSettings.
	"Keymap": {"overrides": `{"version":1,"bindings":{}}`},
	// Cleanup mirrors measure.DefaultCleanupOptions (ADR 0238 decision 4): the silence cleanup analyzer's own starting thresholds, read by cleanupSettings
	// (apps/desktop/cleanup_settings.go). They are not a delivery specification, and every one can be changed here.
	"Cleanup": {
		"pad_seconds":            "0.15",
		"min_breath_seconds":     "0.12",
		"max_breath_seconds":     "0.9",
		"breath_below_speech_db": "12",
		"click_above_silence_db": "30",
	},
}

// Defaults returns the repo file's values for tool, with any key the file does
// not provide filled from builtinDefaults.
func (s *Store) Defaults(tool string) Values {
	values := s.readTool(layout.Path(s.repoPath(), layout.DefaultsFile), tool, persist.Disposable)
	for key, value := range builtinDefaults[tool] {
		if _, ok := values[key]; !ok {
			values[key] = value
		}
	}
	return values
}
func (s *Store) Global(tool string) Values {
	return s.readTool(globalPath(), tool, persist.NarratorData)
}
func (s *Store) Project(tool string) Values {
	project := s.projectPath()
	if project == "" {
		return Values{}
	}
	return s.readTool(project, tool, persist.NarratorData)
}

func (s *Store) Fields(scope string) map[string]map[string]any {
	result := map[string]map[string]any{}
	for _, tool := range []string{"General", "ManuscriptGuide", "Piper", "Manuscript", "TranscriptCompare", "Updates"} {
		defaults := s.Defaults(tool)
		global := s.Global(tool)
		project := s.Project(tool)
		keys := map[string]bool{}
		for key := range defaults {
			keys[key] = true
		}
		for key := range global {
			keys[key] = true
		}
		for key := range project {
			keys[key] = true
		}
		for key := range keys {
			value, source := s.Effective(tool, key, "")
			if scope == "" || scope == source || scope == "effective" {
				result[tool+"."+key] = map[string]any{"value": value, "source": source}
			}
		}
	}
	return result
}

// Save changes exactly one requested tier. A nil value removes a project
// override; global nil is retained as JSON null for compatibility with the
// previous host's explicit global reset representation.
func (s *Store) Save(tool, scope string, changes map[string]*string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	path := globalPath()
	if scope == "project" {
		path = projectPath(s.project)
		if path == "" {
			return fmt.Errorf("open a project before changing project settings")
		}
	} else if scope != "global" {
		return fmt.Errorf("unsupported settings scope")
	}
	document := s.readDocument(path, persist.NarratorData)
	if err := persist.CanOverwrite(path, "settings"); err != nil {
		return err
	}
	section, _ := document[tool].(map[string]any)
	if section == nil {
		section = map[string]any{}
	}
	for key, value := range changes {
		if value == nil && scope == "project" {
			delete(section, key)
		} else if value == nil {
			section[key] = nil
		} else {
			section[key] = *value
		}
	}
	document[tool] = section
	return writeDocument(path, document)
}

func (s *Store) repoPath() string { s.mu.Lock(); defer s.mu.Unlock(); return s.repo }
func (s *Store) projectPath() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return projectPath(s.project)
}
func projectPath(project string) string {
	if project == "" {
		return ""
	}
	return filepath.Join(project, "narration-utils", "settings.json")
}
func globalPath() string {
	if value := os.Getenv("APPDATA"); value != "" {
		return filepath.Join(value, "narration-utils", "global-settings.json")
	}
	if value := os.Getenv("USERPROFILE"); value != "" {
		return filepath.Join(value, "AppData", "Roaming", "narration-utils", "global-settings.json")
	}
	return filepath.Join("AppData", "Roaming", "narration-utils", "global-settings.json")
}

// readTool reads one tool's section of a settings file as text. Every setting is stored as a string, but a hand-edited file may hold
// a boolean or a number (a bool setting written as true, for one): those are read as their text. An object or a list is not a
// setting value: it is ignored, and the log names the key (never the value). A null is the explicit global reset that Save writes,
// so it is ignored without a log line.
func (s *Store) readTool(path, tool string, class persist.Class) Values {
	raw := s.readDocument(path, class)
	section, _ := raw[tool].(map[string]any)
	result := Values{}
	var ignored []string
	for key, value := range section {
		switch typed := value.(type) {
		case string:
			result[key] = typed
		case bool:
			result[key] = strconv.FormatBool(typed)
		case float64:
			result[key] = strconv.FormatFloat(typed, 'f', -1, 64)
		case nil:
		default:
			ignored = append(ignored, key)
		}
	}
	if len(ignored) > 0 {
		sort.Strings(ignored)
		s.reporter().Warn("settings_value_ignored", fmt.Sprintf("%s section %s has values that are not text, numbers or booleans and were ignored: %s", filepath.Base(path), tool, strings.Join(ignored, ", ")))
	}
	return result
}

// readDocument reads a settings file. A file that cannot be decoded is handled by class (kept aside and reported for the narrator's
// own settings), so the Save that follows never replaces it without a trace.
func (s *Store) readDocument(path string, class persist.Class) map[string]any {
	var document map[string]any
	s.reporter().ReadJSON(path, "settings", class, func(bytes []byte) error {
		var decoded map[string]any
		if err := json.Unmarshal(bytes, &decoded); err != nil {
			return err
		}
		if decoded == nil {
			return fmt.Errorf("not a JSON object")
		}
		document = decoded
		return nil
	})
	if document == nil {
		return map[string]any{}
	}
	return document
}
func writeDocument(path string, document map[string]any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create settings directory: %w", err)
	}
	bytes, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, bytes, 0o600); err != nil {
		return fmt.Errorf("could not write settings: %w", err)
	}
	if err := os.Rename(temporary, path); err != nil {
		return fmt.Errorf("could not activate settings: %w", err)
	}
	return nil
}
