# Live engine evaluation: protocol and lag-capture aid

**Date:** moved here on 2026-10-12 from `docs/architecture/manuscript-teleprompter.md`. **Question:** which live engine, Whisper or Moonshine, should the Booth default to? **Tracking:** [#1476](https://github.com/countrymanprime/narration-utils/issues/1476). No real-time run is recorded yet.

**Goal.** Decide the default engine (whisper vs. moonshine) with evidence, per
the numeric gate in ADR 0414 (median cursor lag at least 25% lower than
Whisper tiny, no more false jumps or backward moves, on at least 3 readings
across at least 2 microphones) plus the owner's judgment. This note is the
protocol and the launch aid; a results table lands once runs exist (see
[ADR 0414](../adr/0414-the-teleprompter-default-engine-stays-whisper-tiny-until-a-real-time-ab-evaluation-runs.md),
Proposed).

**Lag-capture aid.** `NARRATION_TELEPROMPTER_EVAL=1` (same opt-in pattern as
`NARRATION_DEBUG`, `internal/runlog`) makes every teleprompter session the
host launches add `--timing` and `--log <session dir>/teleprompter_<id>.log`
to the sidecar's arguments (`internal/teleprompter/service.go`'s
`planSession`), whichever engine or model it names and whether the session
reads a live `--mic` or replays a `--wav` file. It is developer/evaluation
only: nothing in Settings or the UI can turn it on, and it changes no
contract the UI reads. This closes a gap: `--timing`/`--log` existed in `live_asr.py` already, but the host
passed neither.

**Two passes, not one — read this before running anything.** `iter_wav_chunks`
(`live_asr.py`) explicitly feeds a `--wav` file "as fast as the CPU allows, so
it checks accuracy but not real-time lag" — a `--wav` replay session is
useful and fast, but its `--timing` lag numbers are meaningless (the sidecar
races through the file, unpaced). The "cursor lag" gate is a
*wall-clock* number and needs the sidecar's `--mic` path, timed against a real
input device, whether that device is a live microphone or an audio-loopback
device fed by a real-time playback of a recording:

1. **Accuracy pass (`--wav`, no lag claim).** Fast, hardware-free, safe to run
   anywhere. Replays a recording through `--wav` (or through
   `sidecars/manuscript-teleprompter/core/replay.py` against a printed
   session's NDJSON, `--stream`) and reports `coverage`, `backward_moves`,
   `jumps`, `waiting_events` and flag counts — never `speculation_lead_seconds`
   as a lag figure, and never the Moonshine spike's old position-matched lag
   metric (rejected: it matched words by position). Use this to confirm the tracker behaves
   (reaches the end, no false restarts) before spending a real-time pass on a
   combination.
2. **Real-time pass (`--mic`, the actual gate).** The same recording played
   back in real time into a real or loopback capture device named by
   `--mic`, exactly the code path a live narrator uses, with
   `NARRATION_TELEPROMPTER_EVAL=1` set so `--timing`'s "how far behind the
   speaker" lines land in the session's log file. This is the only pass whose
   numbers may go in the ADR's results table as cursor lag.

**Protocol.**

- One script (plain text, exact words of the recording — the script tracker
  matches tokens, not audio) and one recording per reader/microphone
  combination. Development readings use public-domain audio (D70/D71):
  LibriVox by default, synthetic (e.g. Piper) as the fallback when a suitable
  LibriVox reading isn't available in the working environment; either way,
  results are provisional until re-run on the owner's own material, tracked as
  a QA item on [#510](https://github.com/countrymanprime/narration-utils/issues/510)
  (ENG-8). Record, next to the recording (never in the recording's own
  metadata, and never the audio file itself — see below): the source URL, the
  reader's name, the book/chapter title, and the public-domain statement (or,
  for synthetic audio, the TTS voice and the source text's public-domain
  statement).
- Runs: both engines (`whisper`, `moonshine`) × both models (`tiny`, `small`)
  × at least 3 real-time runs each, same chapter, same reader (or the same
  synthetic voice), same microphone (or loopback device) per batch, at least
  2 microphones/devices total before the gate is evaluated. Moonshine only
  where the platform ships it (Windows, ADR 0107).
- Per run, from the session's `--log` file and its emitted `position` events:
  median and p90 cursor lag (the `--timing` "behind the speaker" lines),
  `backward_moves`, `jumps`, and flag counts. Aggregate medians across the 3+
  runs per engine/model.
- **Do not store the recordings in git.** Keep them under a working directory
  the repo already ignores (for example `.test-tmp/` — see `.gitignore`) or
  another local, untracked path, and note that path (not the audio itself) in
  the write-up.

**Results table.** Not yet populated — no real-time pass has been run in any
environment this protocol's author has had access to (network policy denied
both the audio source and the model-weight hosts in the cloud session that
wrote this protocol and the lag-capture aid). A results table goes here, and
in ADR 0414's Consequences, once a real-time pass exists; until then the
default stays `whisper`/`tiny` (`config/defaults.json`, unchanged) and ADR
0414 stays Proposed.
