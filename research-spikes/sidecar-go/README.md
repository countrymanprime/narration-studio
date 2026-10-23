# Sidecar Go-port spike (2026-10-23)

Evidence for `docs/research/sidecar-go-vs-python.md` (issue #2251, item R1). Not shipped and not built by CI; this branch is not for merging.

| Folder | What | Re-run |
| --- | --- | --- |
| `divergence/` | `take_divergence.py`, the compare.py tokenizer, `spoken_forms` and `difflib.SequenceMatcher` in Go | `gen.py .`, `cd goport && go build -o ../divergence .`, then `bench.sh`; compare `py*.out` with `go*.out` |
| `coverage/` | `recording_coverage.py` and the opcode path from words, in Go | `run_all.sh` |
| `tracker/` | `script_tracker.py`, `flags.py` and part of `spoken_forms` in Go | `verify.sh`, then `bench.sh` |
| `asr/` | whisper.cpp through its cgo bindings (`gowhisper/`), libmoonshine through purego (`gomoonshine/`), the faster-whisper and Moonshine Python timers and the WER script | see the note's ASR section for the inputs and builds |

The Python scripts run with the repository's `.venv` from the repository root's `sys.path` set up the way each `tests/conftest.py` does.
