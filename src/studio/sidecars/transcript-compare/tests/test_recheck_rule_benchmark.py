"""Tests for `scripts/dev/recheck_rule.py`: the window-rule variants the recording-check benchmark tries, and the launcher that applies one to
the sidecar without changing the shipped rule."""

import importlib.util
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[5]
CORE = REPO / "src" / "studio" / "sidecars" / "transcript-compare" / "core"
if str(CORE) not in sys.path:
    sys.path.insert(0, str(CORE))

_spec = importlib.util.spec_from_file_location("recheck_rule", REPO / "scripts" / "dev" / "recheck_rule.py")
rule_module = importlib.util.module_from_spec(_spec)
sys.modules["recheck_rule"] = rule_module
_spec.loader.exec_module(rule_module)

import coverage_pipeline as pipeline


class TestParseRules:
    def test_current_is_the_shipped_rule(self):
        (current,) = rule_module.parse_rules("current")
        assert (current.name, current.min_window, current.merge_gap, current.edge_pad, current.line) == (
            "current",
            pipeline.MIN_WINDOW_SECONDS,
            pipeline.MERGE_GAP_SECONDS,
            pipeline.EDGE_PAD_SECONDS,
            None,
        )

    def test_a_variant_overrides_only_what_it_names(self):
        rules = rule_module.parse_rules("current;min10:min=10;words:min=0,pad=1.5,gap=5,line=0.4")
        assert [r.name for r in rules] == ["current", "min10", "words"]
        assert (rules[1].min_window, rules[1].merge_gap, rules[1].edge_pad) == (10.0, pipeline.MERGE_GAP_SECONDS, pipeline.EDGE_PAD_SECONDS)
        assert (rules[2].min_window, rules[2].edge_pad, rules[2].merge_gap, rules[2].line) == (0.0, 1.5, 5.0, 0.4)

    @pytest.mark.parametrize("text", ["", "x:min", "x:colour=3", "x:min=-1", "x:line=2", "a;a"])
    def test_a_bad_spec_is_refused(self, text):
        with pytest.raises(SystemExit):
            rule_module.parse_rules(text)

    def test_a_rule_round_trips_through_the_environment(self):
        (_, variant) = rule_module.parse_rules("current;v:min=10,gap=8,pad=2")
        assert rule_module.Rule.from_json(variant.to_json()) == variant


class TestApply:
    def test_apply_changes_what_the_pipeline_pads_and_merges_then_restores(self):
        (variant,) = rule_module.parse_rules("v:min=0,pad=1,gap=5")
        before = pipeline.pad_window(30.0, 31.0, 0.0, 100.0)
        assert before == (18.0, 43.0)
        with rule_module.applied(variant):
            assert pipeline.pad_window(30.0, 31.0, 0.0, 100.0) == (29.0, 32.0)
            assert pipeline.merge_windows([(0.0, 3.0), (8.0, 9.0)]) == [(0.0, 3.0), (8.0, 9.0)]
        assert pipeline.pad_window(30.0, 31.0, 0.0, 100.0) == before
