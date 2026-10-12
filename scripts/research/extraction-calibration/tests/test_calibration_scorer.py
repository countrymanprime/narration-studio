"""The scorer on a tiny hand-made gold set (acceptance test 1): every figure below is worked by hand in its comment."""

import sys
import unittest
from pathlib import Path
from typing import ClassVar

sys.path.insert(0, str(Path(__file__).parents[1]))

from calibration import scoring
from calibration.fingerprint import fingerprint


def speaker(quote, who, confidence, text=None):
    item = {"payload": {"kind": "speaker", "quote": quote, "speaker": who}, "confidence": confidence}
    item["quotes"] = [{"paragraphId": "p1", "text": text or "said Mole"}]
    return item


def fp(quote, who):
    return fingerprint({"kind": "speaker", "quote": quote, "speaker": who})


class FingerprintTest(unittest.TestCase):
    def test_spelling_case_and_typography_do_not_split_a_match(self):
        a = fingerprint({"kind": "speaker", "quote": "“Don’t”  go", "speaker": "MOLE"})
        b = fingerprint({"kind": "speaker", "quote": '"don\'t" go', "speaker": "mole"})
        self.assertEqual(a, b)
        self.assertEqual(fingerprint({"kind": "bogus"}), "")


class ScorerTest(unittest.TestCase):
    PARAGRAPHS: ClassVar = {"p1": "“Hello,” said Mole."}

    def setUp(self):
        # Gold: A B C D. Emitted: A, B (gold), X (adjudicated invalid), Z (adjudicated valid, so it joins the pool), Y (unjudged).
        self.gold = {"speaker": {fp("a", "m"), fp("b", "m"), fp("c", "m"), fp("d", "m")}}
        self.adjudicated = {fp("x", "m"): False, fp("z", "m"): True}
        self.emitted = [
            speaker("a", "m", 0.9),
            speaker("b", "m", 0.8),
            speaker("x", "m", 0.9),
            speaker("z", "m", 0.6),
            speaker("y", "m", 0.4),
            speaker("a", "m", 0.5),  # the same item twice counts once, at its higher confidence
        ]
        self.judged = scoring.judge(self.emitted, {f for s in self.gold.values() for f in s}, self.adjudicated, None)

    def test_precision_recall_f1_match_hand_worked_numbers(self):
        row = scoring.score_kinds(self.judged, self.gold, self.adjudicated, ["speaker"])["speaker"]
        # judged = A, B, X, Z (4; Y is unjudged); correct = A, B, Z (3) -> precision 3/4
        self.assertEqual((row.emitted, row.judged, row.unjudged, row.correct), (5, 4, 1, 3))
        self.assertAlmostEqual(row.precision, 0.75)
        # pool = A B C D + Z = 5; found = A, B, Z = 3 -> recall 3/5
        self.assertEqual((row.gold, row.found), (5, 3))
        self.assertAlmostEqual(row.recall, 0.6)
        self.assertAlmostEqual(row.f1, 2 * 0.75 * 0.6 / 1.35)

    def test_a_kind_with_no_emitted_items_has_no_precision_not_zero(self):
        row = scoring.score_kinds(self.judged, self.gold, self.adjudicated, ["claim"])["claim"]
        self.assertIsNone(row.precision)
        self.assertIsNone(row.f1)

    def test_a_quote_that_is_not_in_the_paragraph_is_wrong_whatever_its_content(self):
        good = speaker("a", "m", 0.9, text="“Hello,” said Mole.")
        bad = speaker("b", "m", 0.9, text="said Toad.")
        judged = scoring.judge([good, bad], {f for s in self.gold.values() for f in s}, {}, self.PARAGRAPHS)
        self.assertEqual({j.fp: j.correct for j in judged}, {fp("a", "m"): True, fp("b", "m"): False})
        # a speaker with no quote at all fails too
        none = {"payload": {"kind": "speaker", "quote": "c", "speaker": "m"}, "confidence": 0.9, "quotes": []}
        self.assertFalse(scoring.quote_ok(none, self.PARAGRAPHS))

    def test_wilson_lower_bound(self):
        # 38 of 40: centre .998, margin .0829, denominator 1.0960 -> 0.835
        self.assertAlmostEqual(scoring.wilson_lower(38, 40), 0.835, places=3)
        self.assertIsNone(scoring.wilson_lower(0, 0))


def judged(confidence, correct, quote_ok=True):
    return scoring.Judged("speaker", confidence, f"speaker|{confidence}|{correct}|{id(object())}", correct, quote_ok)


class BinTest(unittest.TestCase):
    def test_bins_are_the_protocols_and_null_is_its_own_row(self):
        items = [judged(0.95, i < 38) for i in range(40)] + [judged(0.55, i < 15) for i in range(30)] + [judged(None, True) for _ in range(3)]
        bins = {b.label: b for b in scoring.confidence_bins(items)}
        self.assertEqual((bins["0.9-1.0"].items, bins["0.9-1.0"].correct), (40, 38))
        self.assertAlmostEqual(bins["0.9-1.0"].share, 0.95)
        self.assertEqual((bins["0.5-0.6"].items, bins["0.5-0.6"].correct), (30, 15))
        self.assertAlmostEqual(bins["0.5-0.6"].share, 0.5)
        self.assertEqual((bins["null"].items, bins["null"].correct), (3, 3))
        self.assertEqual(bins["<0.5"].items, 0)

    def test_a_bin_under_thirty_items_is_merged_into_its_lower_neighbour_and_says_so(self):
        items = [judged(0.65, True) for _ in range(30)] + [judged(0.75, False) for _ in range(10)]
        bins = {b.label: b for b in scoring.confidence_bins(items)}
        self.assertEqual((bins["0.6-0.8"].items, bins["0.6-0.8"].correct), (40, 30))
        self.assertIn("merged", bins["0.6-0.8"].note)

    def test_confident_but_wrong_counts_applied_items_only(self):
        items = (
            [judged(0.9, True)] * 18
            + [judged(0.9, False)] * 2
            + [judged(0.75, False), judged(0.7, False), judged(None, False), judged(0.9, False, quote_ok=False), judged(0.9, None)]
        )
        # applied = confidence >= 0.75, quote verified, judged: 20 at 0.9 plus the one at 0.75 -> 21; wrong = 2 + 1
        self.assertEqual(scoring.confident_but_wrong(items), (3, 21))


class DecisionRuleTest(unittest.TestCase):
    def book(self, high_correct=40, low_correct=15):
        return [judged(0.95, i < high_correct) for i in range(40)] + [judged(0.65, i < low_correct) for i in range(30)]

    def test_both_books_agreeing_moves_the_value_to_the_lowest_qualifying_edge(self):
        rec = scoring.recommend({"a": self.book(), "b": self.book()})
        # 0.7 and above holds only the 0.95 items, all correct on both books; 0.6 and below includes the 50% items
        self.assertEqual((rec.status, rec.value), ("moves", 0.7))

    def test_one_book_qualifying_is_a_note_not_a_change(self):
        rec = scoring.recommend({"a": self.book(), "b": self.book(high_correct=30)})
        self.assertEqual((rec.status, rec.value), ("no-edge", 0.75))
        self.assertIn("raise it with the owner", rec.sentence)
        self.assertEqual(scoring.recommend({"a": self.book()}).status, "one-book")

    def test_no_judged_book_is_not_run_and_the_value_stays(self):
        rec = scoring.recommend({"a": [judged(0.9, None)]})
        self.assertEqual((rec.status, rec.value), ("not-run", 0.75))

    def test_the_whole_app_value_is_the_highest_per_kind_answer_and_small_kinds_cannot_move_it(self):
        def kind(k, books):
            return {b: [scoring.Judged(k, j.confidence, j.fp, j.correct) for j in items] for b, items in books.items()}

        small = {"a": [judged(0.95, True)] * 5, "b": [judged(0.95, True)] * 5}
        per_kind = {"entry": kind("entry", {"a": self.book(), "b": self.book()}), "claim": kind("claim", small)}
        self.assertEqual(scoring.recommend_overall(per_kind).value, 0.7)
        self.assertEqual(scoring.recommend_overall({"claim": kind("claim", small)}).status, "not-run")


if __name__ == "__main__":
    unittest.main()
