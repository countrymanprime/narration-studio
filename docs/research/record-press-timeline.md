# Where a Booth record press spends its time before REAPER's pre-roll

**Measured 2026-11-01 on Linux x86_64 (4 cores) in a cloud container: REAPER 7.82 under `xvfb-run` with the JACK dummy device, and the teleprompter sidecar run from source (`.venv`, faster-whisper 1.2.1) replaying a WAV in place of a microphone. Not measured on Windows, with the frozen sidecar, or with a real microphone.** Refs #2251: the owner hears several seconds of nothing between pressing Record (or Punch and roll) and REAPER's own pre-roll. The four bridge steps and REAPER's two-measure pre-roll were measured earlier ([What the REAPER bridge costs REAPER](reaper-bridge-performance.md)); this note adds what runs before them.

## The press, step by step

`beginTake` in [`useBoothPage.ts`](../../src/studio/ui/src/components/booth/page/useBoothPage.ts) runs these one after another, each waiting for the last:

| Step | Host call | What it waits for |
| --- | --- | --- |
| Model check | `AssetsList` (`ensureModel`) | The asset catalog; reads no file contents |
| Listening start | `TeleprompterStart` | `liveModelDir`: on the first start of an app session, `assets.Ready` reads every byte of the model to verify it. Then the sidecar is spawned, loads the speech model, opens the microphone, and the host waits (`awaitListening`, up to 20 s) for its first event other than `script` |
| Record start | `ReadAloudRecordStart` / `ReadAloudRecordStartAt` | `chapter_track_state`, `arm_only`, `punch_to` (a punch only), `record_start`; the last answers once REAPER reports recording, which with pre-roll on record is when the pre-roll begins |

Listening ends with every take (`now.session.stop()` when the recording stops), so every press spawns a new sidecar and loads the model again. Only the full read of the model is once per app session.

## Measured

Sidecar spawn to its first event (`level`, the first chunk's meter), from [a scratch script](#method), four runs each, the first after dropping the page cache:

| Model | First run (cold cache) | Runs 2 to 4 |
| --- | --- | --- |
| `tiny` (the default, 75 MB) | 1503 ms | 717 to 890 ms |
| `base.en` (141 MB) | 1543 ms | 831 to 978 ms |
| `small.en` (464 MB) | 4203 ms | 1628 to 1786 ms |

Reading the whole model, as the first start of an app session does (`sha256sum`, the same work as `assets.Ready`): `tiny` 0.31 s cold, 0.22 s warm; `small.en` 1.54 s cold, 1.32 s warm.

The four bridge steps in REAPER, a 4050-item project, five presses (`perf: a record press's four bridge steps ...` in [`scenarios_perf.py`](../../scripts/ci/real-reaper/scenarios_perf.py)):

| Step | p50 | p95 |
| --- | --- | --- |
| `chapter_track_state` | 30 ms | 41 ms |
| `arm_only` | 36 ms | 37 ms |
| `punch_to` | 36 ms | 42 ms |
| `record_start` | 53 ms | 66 ms |
| All four | 153 ms | 177 ms |

## What this says

On this machine a press waits 0.7 to 4.2 s for listening before REAPER is asked to record, against 0.15 s for REAPER's part. The listening start is the pause. On Windows the frozen sidecar also loads its DLLs (CTranslate2, PyAV) under the antivirus scanner, and `dshow` opens the device; neither is measured here, and both add to the same wait.

## The timeline diagnostic

Switched on in REAPER with the bridge timing switch ([owner steps](reaper-bridge-performance.md#owner-hands-on), step 2), the heartbeat carries a seventh field and the host appends one line per press to `record-timeline.log` in the bridge session folder, beside `bridge-timing.log` ([`internal/presstimeline`](../../src/studio/desktop/internal/presstimeline/timeline.go), [`presstimeline_host.go`](../../src/studio/desktop/presstimeline_host.go)). Off, the host stamps nothing. A line holds step names, an outcome word (`started` or the refusal's reason) and milliseconds since the first step, on the host's monotonic clock. Its shape, with made-up numbers:

```text
2026-11-01T18:52:02Z record_press outcome=started total_ms=2653 assets_list=0 assets_listed=3 listen_call=5 model_checked=7 sidecar_spawned=40 sidecar_first_line=900 listening=2403 listen_answered=2404 record_call=2410 track_state=2440 armed=2476 punched=2512 recording=2565 answered=2566
```

| Step | Stamped when |
| --- | --- |
| `assets_list`, `assets_listed` | The model check's `AssetsList` begins and answers. A press starts here; an asset listing more than 5 s before the next step (another page's) is left off |
| `listen_call`, `model_checked` | `TeleprompterStart` begins; the model is verified (`liveModelDir`) |
| `sidecar_spawned`, `sidecar_first_line`, `listening` | The sidecar process started; printed its first line; printed its first event other than `script` |
| `listen_answered` | `TeleprompterStart` answers the Booth. When the record start answers first, the line waits for this step |
| `record_call`, `track_state`, `armed`, `punched`, `recording`, `answered` | `ReadAloudRecordStart(At)` begins; each bridge step answers; the start answers |

A press with listening already running has no listening steps. The press itself, in the WebView, is before `assets_list` by one Wails call; that gap is not stamped.

## Method

- The sidecar runs: `live_asr.py --wav <5 s 220 Hz tone> --script <one sentence> --model-dir <model> --language en`, timed from `Popen` to the first stdout line whose `type` is not `script`, killed there. Models from `Systran/faster-whisper-*` on Hugging Face. The page cache was dropped with `/proc/sys/vm/drop_caches` before each model's first run.
- The bridge steps: `NARRATION_CI_ONLY="perf: a record press's four bridge steps answer within budget in a 4050-item project and the heartbeat says when timing is on" scripts/ci/real-reaper/run-linux-check.sh <out>`; numbers in `<out>/out/perf/record_press.json`. It also checks that real REAPER's heartbeat carries the timing field.

## Pending

- Owner, on Windows: the same timeline with the frozen sidecar, a real microphone and the model the owner uses. Steps in [the bridge note](reaper-bridge-performance.md#owner-hands-on); send `record-timeline.log` with `bridge-timing.log`.
