import csv
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st
from narration_common import spoken_forms


def test_homophones_canonicalize_to_the_first_member_of_their_group():
    assert spoken_forms.canonical_tokens("They're there with their bags") == ["their", "their", "with", "their", "bags"]


def test_number_homophones_are_deliberately_absent_so_number_merging_stays_safe():
    for word in ("one", "won", "two", "too", "to", "four", "for", "eight", "ate"):
        assert word not in spoken_forms.HOMOPHONE_CANON


def test_canonical_tokens_fold_curly_apostrophes_possessives_and_split_hyphens():
    assert spoken_forms.canonical_tokens("The sentinel’s so-called post.") == ["the", "sentinels", "so", "called", "post"]


def test_merge_number_words_collapses_runs_and_keeps_the_index_of_the_first_word():
    tokens = ["page", "two", "hundred", "and", "five", "of", "one", "thousand"]

    assert spoken_forms.merge_number_words(tokens, list(range(len(tokens)))) == (["page", "205", "of", "1000"], [0, 1, 5, 6])


@pytest.mark.parametrize(
    ("heard", "written"),
    [
        ("daisy chain", "daisy-chain"),
        ("twenty three", "23"),
        ("there", "their"),
        ("sentinel's", "sentinels"),
        ("Evening", "evening."),
        ("7 o clock", "seven o'clock"),
    ],
)
def test_said_the_same_forgives_spelling_that_does_not_change_what_was_said(heard, written):
    assert spoken_forms.said_the_same(heard, written)


@pytest.mark.parametrize(("heard", "written"), [("cited", "tired"), ("won", "one"), ("", ""), ("lamp", "lump")])
def test_said_the_same_does_not_forgive_a_different_word_or_nothing_at_all(heard, written):
    assert not spoken_forms.said_the_same(heard, written)


def test_filler_words_are_the_hesitations_transcript_compare_drops():
    assert {"uh", "um", "hmm"} <= spoken_forms.FILLER_WORDS
    assert "the" not in spoken_forms.FILLER_WORDS


def test_the_hosts_copy_carries_the_same_homophone_list():
    # The host's tokenizer (src/studio/desktop/internal/compare) embeds the built-in homophone groups as a CSV (a Go
    # embed cannot reach Python data); the teleprompter's live flags read these. This guard keeps the two the same.
    go_copy = Path(__file__).resolve().parents[3] / "desktop" / "internal" / "compare" / "homophones.csv"
    rows = csv.reader(line for line in go_copy.read_text(encoding="utf-8").splitlines() if line.strip() and not line.lstrip().startswith("#"))
    go_groups = tuple(tuple(word.strip() for word in row if word.strip()) for row in rows)
    assert go_groups == spoken_forms.HOMOPHONE_GROUPS


NUMBER_TOKEN = st.sampled_from(sorted(spoken_forms.NUMBER_WORDS) + ["and"])
PLAIN_TOKEN = st.text(alphabet="abcdefg", min_size=1, max_size=5)
TOKENS = st.lists(NUMBER_TOKEN | PLAIN_TOKEN, max_size=14)


@given(TOKENS)
def test_merging_number_words_keeps_the_index_map_aligned_and_ordinary_tokens_intact(tokens):
    index_map = list(range(len(tokens)))
    merged, merged_map = spoken_forms.merge_number_words(tokens, index_map)
    assert len(merged) == len(merged_map) <= len(tokens)
    assert merged_map == sorted(merged_map), "the map never moves backwards"
    assert all(0 <= index < len(tokens) for index in merged_map)
    for token, index in zip(merged, merged_map):
        if token.isdigit():
            assert tokens[index] in spoken_forms.NUMBER_WORDS, "a digit token points at the first number word it replaced"
        else:
            assert token == tokens[index], "any other token is passed through untouched"


@given(st.lists(PLAIN_TOKEN, max_size=14))
def test_text_with_no_number_words_is_not_changed_by_merging(tokens):
    index_map = list(range(len(tokens)))
    assert spoken_forms.merge_number_words(tokens, index_map) == (tokens, index_map)


def test_spelled_out_numbers_merge_into_their_digit_value():
    for words, digits in [("one", "1"), ("twenty three", "23"), ("one hundred and five", "105"), ("two thousand", "2000")]:
        tokens = words.split()
        assert spoken_forms.merge_number_words(tokens, list(range(len(tokens)))) == ([digits], [0]), words
