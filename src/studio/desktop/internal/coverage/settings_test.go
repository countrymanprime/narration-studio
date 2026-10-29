package coverage

import "testing"

func lookupFrom(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func TestResolveSettingsReadsEveryKey(t *testing.T) {
	got := ResolveSettings(lookupFrom(map[string]string{
		SettingMinParagraphPresent: "0.9", SettingMaxMissingRun: "5", SettingMaxMisreadRun: "4", SettingMinAnchorRun: "2",
	}))
	want := Settings{
		Alignment: AlignmentParams{MaxMisreadRun: 4, MinAnchorRun: 2}, Thresholds: Thresholds{MinParagraphPresent: 0.9, MaxMissingRun: 5},
		Cascade: DefaultSettings.Cascade, Parallel: DefaultSettings.Parallel,
	}
	if got != want {
		t.Fatalf("ResolveSettings = %+v, want %+v", got, want)
	}
}

func TestResolveSettingsWithNothingSetIsTheShippedDefaults(t *testing.T) {
	got := ResolveSettings(lookupFrom(nil))
	want := Settings{
		Alignment: AlignmentParams{MaxMisreadRun: 8, MinAnchorRun: 3}, Thresholds: Thresholds{MinParagraphPresent: 0.8, MaxMissingRun: 3},
		Cascade:  CascadeSettings{Enabled: false, FirstPassModel: "tiny", RecheckModel: "large-v3-turbo", UnsureBelow: 0.5, Pipeline: true},
		Parallel: Parallel{Workers: 0, ChunkSeconds: 60, OverlapSeconds: 6, Chapters: 1},
	}
	if got != want || got != DefaultSettings {
		t.Fatalf("ResolveSettings = %+v, want the shipped defaults (MC1, MC2) %+v", got, want)
	}
}

func TestResolveSettingsReadsTheCascade(t *testing.T) {
	got := ResolveSettings(lookupFrom(map[string]string{
		SettingCascadeEnabled: "true", SettingCascadeFirstPassModel: "small", SettingCascadeRecheckModel: "large-v3",
	}))
	if got.Cascade != (CascadeSettings{Enabled: true, FirstPassModel: "small", RecheckModel: "large-v3", UnsureBelow: DefaultSettings.Cascade.UnsureBelow, Pipeline: true}) {
		t.Fatalf("Cascade = %+v", got.Cascade)
	}
}

func TestResolveSettingsPipelinesTheCascadeUnlessTurnedOff(t *testing.T) {
	if !ResolveSettings(lookupFrom(nil)).Cascade.Pipeline {
		t.Fatal("the pipelined cascade is on unless the narrator turns it off")
	}
	if ResolveSettings(lookupFrom(map[string]string{SettingCascadePipeline: "false"})).Cascade.Pipeline {
		t.Fatal("cascade_pipeline=false must turn the pipelining off")
	}
	if !ResolveSettings(lookupFrom(map[string]string{SettingCascadePipeline: "maybe"})).Cascade.Pipeline {
		t.Fatal("a value that is not true or false falls back to the default, on")
	}
}

func TestResolveSettingsCascadeFallsBackPerKeyOnABadValue(t *testing.T) {
	got := ResolveSettings(lookupFrom(map[string]string{SettingCascadeEnabled: "yes", SettingCascadeFirstPassModel: "", SettingCascadeRecheckModel: ""}))
	if got.Cascade != DefaultSettings.Cascade {
		t.Fatalf("Cascade = %+v, want every bad or unset key at its default", got.Cascade)
	}
}

func TestResolveSettingsFallsBackPerKeyOnABadValue(t *testing.T) {
	cases := map[string]map[string]string{
		"not numbers":  {SettingMinParagraphPresent: "most", SettingMaxMissingRun: "3.5", SettingMaxMisreadRun: "x", SettingMinAnchorRun: ""},
		"out of range": {SettingMinParagraphPresent: "1.5", SettingMaxMissingRun: "-1", SettingMaxMisreadRun: "-2", SettingMinAnchorRun: "0"},
		"NaN share":    {SettingMinParagraphPresent: "NaN"},
	}
	for name, values := range cases {
		t.Run(name, func(t *testing.T) {
			if got := ResolveSettings(lookupFrom(values)); got != DefaultSettings {
				t.Fatalf("ResolveSettings(%v) = %+v, want every bad key at its default", values, got)
			}
		})
	}
	mixed := ResolveSettings(lookupFrom(map[string]string{SettingMaxMissingRun: "7", SettingMinAnchorRun: "zero"}))
	if mixed.Thresholds.MaxMissingRun != 7 || mixed.Alignment.MinAnchorRun != 3 {
		t.Fatalf("a good key must survive a bad neighbour: %+v", mixed)
	}
}

func TestThresholdsValidate(t *testing.T) {
	for _, bad := range []Thresholds{{MinParagraphPresent: -0.1}, {MinParagraphPresent: 1.1}, {MinParagraphPresent: 0.5, MaxMissingRun: -1}} {
		if bad.validate() == nil {
			t.Fatalf("%+v should be invalid", bad)
		}
	}
	if err := DefaultThresholds.validate(); err != nil {
		t.Fatal(err)
	}
}

func TestResolveSettingsReadsTheParallelAndDoubtKeys(t *testing.T) {
	got := ResolveSettings(lookupFrom(map[string]string{
		SettingParallelWorkers: "3", SettingChunkSeconds: "600", SettingChunkOverlapSeconds: "10", SettingCascadeUnsureBelow: "0.4", SettingParallelChapters: "3",
	}))
	if got.Parallel != (Parallel{Workers: 3, ChunkSeconds: 600, OverlapSeconds: 10, Chapters: 3}) || got.Cascade.UnsureBelow != 0.4 {
		t.Fatalf("got %+v", got)
	}
}

func TestTheParallelAndDoubtDefaultsAreAutoWorkersFiveMinuteChunksAndAHalf(t *testing.T) {
	got := ResolveSettings(lookupFrom(nil))
	if got.Parallel != (Parallel{Workers: 0, ChunkSeconds: 60, OverlapSeconds: 6, Chapters: 1}) || got.Cascade.UnsureBelow != 0.5 {
		t.Fatalf("got %+v", got)
	}
}

func TestParallelAndDoubtFallBackPerKeyOnABadValue(t *testing.T) {
	// A chunk shorter than 30 s is not a size anyone chose on purpose: the sidecar's crossover would swallow it.
	bad := map[string]string{SettingParallelWorkers: "-1", SettingChunkSeconds: "10", SettingChunkOverlapSeconds: "-3", SettingCascadeUnsureBelow: "1.5", SettingParallelChapters: "0"}
	if got := ResolveSettings(lookupFrom(bad)); got != DefaultSettings {
		t.Fatalf("got %+v, want the defaults", got)
	}
	if got := ResolveSettings(lookupFrom(map[string]string{SettingChunkSeconds: "0"})); got.Parallel.ChunkSeconds != 0 {
		t.Fatalf("0 turns chunking off and must be kept: %+v", got.Parallel)
	}
}
