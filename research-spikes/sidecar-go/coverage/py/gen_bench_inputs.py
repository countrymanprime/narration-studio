"""Benchmark inputs from out/inputs.jsonl: x50.jsonl (every case 50 times) and synth.jsonl (one
synthetic 10,000-word chapter with a narrated transcript: skipped sentences, misreads, retakes,
asides, a skipped paragraph). Usage: gen_bench_inputs.py OUTDIR"""
import contextlib, dataclasses, io, json, random, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import dump, rc  # noqa: E402
import compare as engine  # noqa: E402

out = Path(sys.argv[1])
records = [json.loads(line) for line in open(out / "inputs.jsonl", encoding="utf-8")]
with open(out / "x50.jsonl", "w", encoding="utf-8") as f:
    for k in range(50):
        for r in records:
            f.write(dump(dict(r, case=f"{r['case']}#{k}")) + "\n")

rng = random.Random(10000)
stream = [w for r in records[:4] for p in r["chapter"]["paragraphs"] for w in p.split()]
stream = [w.strip(".!?") for w in stream if w.strip(".!?")]
paragraphs, total = [], 0
while total < 10000:
    sentences = []
    for _ in range(rng.randint(3, 8)):
        n = min(rng.randint(6, 24), 10000 - total)
        if n <= 0:
            break
        sentences.append(" ".join(rng.choice(stream) for _ in range(n)) + rng.choice(".....!?"))
        total += n
    if sentences:
        paragraphs.append(" ".join(sentences))
ids = [f"p-{k + 1:06d}" for k in range(len(paragraphs))]
spoken, t = [], 0.0
skip_para = rng.randrange(len(paragraphs))


def say(text):
    global t
    for w in text.split():
        spoken.append([w, round(t, 2), round(t + 0.36, 2)])
        t += 0.4


say("Chapter Twelve The Long Synthetic Chapter")
for p, para in enumerate(paragraphs):
    if p == skip_para:
        continue
    for s in engine.split_sentences(para):
        roll = rng.random()
        if roll < 0.02:
            continue  # skipped sentence
        words = s.split()
        if roll < 0.05:  # false start then retake
            say(" ".join(words[: max(1, len(words) // 3)]))
            say("sorry let me take that again")
        if roll > 0.97:
            say("um anyway")
        words = [rng.choice(stream) if rng.random() < 0.02 else w for w in words]  # misreads
        say(" ".join(words))
        t += 0.3
chapter = {"heading": "Chapter XII The Long Synthetic Chapter", "paragraphs": paragraphs, "paragraph_ids": ids}
with contextlib.redirect_stderr(io.StringIO()):
    units, tokens, unit_idx, raw = engine.build_chapter_units({"title": chapter["heading"], "paragraphs": paragraphs})
    _m, _c, alignment = engine.diff_and_build_markers(tokens, unit_idx, raw, [tuple(w) for w in spoken], 1)
aligned = rc.aligned_chapter_from_markers(alignment, units, ids)
rec = {"case": "synth-10000", "params": {"max_misread_run": 8, "min_anchor_run": 3}, "chapter": chapter, "words": spoken,
       "aligned": {k: [list(x) if isinstance(x, tuple) else x for x in v] for k, v in dataclasses.asdict(aligned).items()}}
with open(out / "synth.jsonl", "w", encoding="utf-8") as f:
    f.write(dump(rec) + "\n")
print(f"x50: {50 * len(records)} records; synth: {len(paragraphs)} paragraphs, {sum(len(p.split()) for p in paragraphs)} words, "
      f"{len(aligned.doc_tokens)} doc tokens, {len(spoken)} transcript words, {len(aligned.opcodes)} opcodes", file=sys.stderr)
