import dataclasses, json, sys
from pathlib import Path

CORE = Path("/home/user/narration-studio/sidecars/transcript-compare/core")
if str(CORE) not in sys.path:
    sys.path.insert(0, str(CORE))
import recording_coverage as rc  # noqa: E402

SHIPPED_THRESHOLDS = rc.Thresholds(0.8, 3)


def dump(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False)


def aligned_from(rec):
    a = rec["aligned"]
    return rc.AlignedChapter(
        doc_tokens=tuple(a["doc_tokens"]), doc_words=tuple(a["doc_words"]), token_paragraph=tuple(a["token_paragraph"]),
        paragraph_ids=tuple(a["paragraph_ids"]), audio_tokens=tuple(a["audio_tokens"]), opcodes=tuple(tuple(o) for o in a["opcodes"]),
    )


def result_record(rec, aligned=None):
    aligned = aligned or aligned_from(rec)
    params = rc.AlignmentParams(**rec["params"])
    cov = rc.compute_coverage(aligned, params)
    d = _plain(cov)
    for p, pc in zip(d["paragraphs"], cov.paragraphs):
        p["present_fraction"] = pc.present_fraction
        p["passes"] = pc.passes(SHIPPED_THRESHOLDS)
    d["missing_tokens"] = cov.missing_tokens
    d["present_fraction"] = cov.present_fraction
    d["text_complete"] = cov.text_complete(SHIPPED_THRESHOLDS)
    tokens, extras = rc.align_tokens(aligned, params)
    return {"case": rec["case"], "coverage": d, "tokens": [[t.status, t.audio] for t in tokens], "extras": [list(e) for e in extras]}


def _plain(x):
    if dataclasses.is_dataclass(x):
        return {f.name: _plain(getattr(x, f.name)) for f in dataclasses.fields(x) if f.name != "by_id"}
    if isinstance(x, dict):
        return {k: _plain(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_plain(v) for v in x]
    return x
