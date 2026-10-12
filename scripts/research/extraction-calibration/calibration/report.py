"""The report: per source the F1 table, the confidence-versus-correctness table and the confident-but-wrong share, then the
threshold sentence. Figures exist only where a source ran and a gold set was judged; everything else says `not run`."""

from __future__ import annotations

from typing import Any

from .scoring import Bin, KindScore, Recommendation

NOT_RUN = "not run"


def pct(value: float | None) -> str:
    return NOT_RUN if value is None else f"{value * 100:.1f}%"


def kind_table(scores: dict[str, KindScore]) -> list[str]:
    lines = ["| Kind | Emitted | Judged | Unjudged | Gold pool | Precision | Recall | F1 |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for kind, row in scores.items():
        lines.append(f"| {kind} | {row.emitted} | {row.judged} | {row.unjudged} | {row.gold} | {pct(row.precision)} | {pct(row.recall)} | {pct(row.f1)} |")
    return lines


def bin_table(bins: list[Bin]) -> list[str]:
    lines = ["| Confidence | Items | Correct | Share correct | Wilson 95% low | Note |", "| --- | --- | --- | --- | --- | --- |"]
    for row in bins:
        lines.append(f"| {row.label} | {row.items} | {row.correct} | {pct(row.share)} | {pct(row.wilson_low)} | {row.note} |")
    return lines


def source_section(result: dict[str, Any]) -> list[str]:
    """One source's section from its result dict (see run_calibration.evaluate)."""
    run = result["run"]
    title = f"### {run['name']}" + (" (fake: not a measurement)" if run["status"] == "fake" else "")
    lines = [title, ""]
    if run["status"] == "not run":
        return lines + [f"{NOT_RUN}: {run['reason']}", ""]
    versions = ", ".join(f"{k} {v}" for k, v in run["versions"].items())
    lines += [f"Versions: {versions or 'none recorded'}. Command: `{run['command']}`.", ""]
    for book, data in result["books"].items():
        if data.get("skipped"):
            lines += [f"**{book}:** {NOT_RUN}: {data['skipped']}", ""]
            continue
        lines += [f"**{book}**", ""] + kind_table(data["kinds"]) + [""]
    pooled = result.get("pooled")
    if pooled:
        wrong, applied = pooled["confident_but_wrong"]
        share = pct(wrong / applied) if applied else NOT_RUN
        lines += ["Confidence versus correctness, pooled over books and kinds:", ""] + bin_table(pooled["bins"]) + [""]
        lines += [
            f"Confident but wrong (applied at or above {pooled['threshold']}): {wrong} of {applied} ({share}). The 5% line is a proposal the owner confirms, so no pass is declared.",
            "",
        ]
    return lines


def recommendation_section(rec: Recommendation, fake: bool) -> list[str]:
    note = " (computed from fake demo data; ignore it)" if fake else ""
    return ["## Threshold recommendation", "", rec.sentence + note, ""]
