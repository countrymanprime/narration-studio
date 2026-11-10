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

## Fix 1: listening starts alongside the recording

`beginTake` starts listening and asks the DAW to record at the same time (`Promise.all`), so REAPER's pre-roll plays while the model loads. A take is still never kept without listening: when listening fails, `dropUnheardTake` stops the recording and, when the DAW reports undo steps for it, takes it back with `undoLast('record_take', n)`. The failed take writes no passage-map run and says no "take saved". Stopped inside REAPER's pre-roll, nothing was recorded: the real-REAPER scenario `record stopped inside REAPER's pre-roll leaves no item and no undo point` ([`scenarios_transport.py`](../../scripts/ci/real-reaper/scenarios_transport.py)) stopped 1.2 s into a 2-measure pre-roll, with the item count and the top undo point unchanged and `undoPoints` 0. The built-in recorder has no pre-roll and keeps its file from the first instant, so it still starts once listening has.

Time from the press until REAPER is asked to record, from the measurements above (estimated from the parts, not timed end to end; the `Bootstrap` check and the optional start tone in `useRecordControl.toggle` come before `record_start` both times and are not measured):

| Model | Before | After |
| --- | --- | --- |
| `tiny` | 0.9 to 1.7 s (listening, then 0.15 s of bridge steps) | 0.15 s (bridge steps; listening loads during the pre-roll) |
| `small.en` | 1.8 to 4.4 s | 0.15 s |

With REAPER's pre-roll at 2 measures (4 s at 120 BPM), listening is ready before the first recorded word in every measured case except `small.en` with a cold page cache (4.2 s). With pre-roll off, the opening second or so of a take is recorded before the text can follow it.

## Fix 2: a take pressed during a cold read does not wait for it to stop

Refs #3221: the owner measured about 10 s from Record to REAPER's pre-roll. Measured 2026-11-08 in the same container with the Go host's record start (`readAloudRecordStartIn`, the real bridge client) against a fake REAPER that answers on a 33 ms tick, in a 62-track, 4030-item project, three presses each in a flat and a Voice folders layout:

| Stage | ms |
| --- | --- |
| `AssetsList` (the model check) | 0 |
| `Bootstrap` (the project check in `useRecordControl.toggle`) | 2 |
| `chapter_track_state` answered | 29 to 46 |
| `arm_only` answered | 59 to 76 |
| `record_start` answered (REAPER's pre-roll begins) | 92 to 111 |
| Parsing the `.rpp` and identifying 65 take files, the Start from here lookup's file work | 17 and 10 |

None of these comes near 10 s. The one wait before `record_start` that can is `endColdRead` in `beginOnce`: a press during a cold read waited for that session to end before asking the DAW to record. The sidecar notices its stop file only when it reads the next audio chunk, then decodes what it still holds; one that has fallen behind real time ends at the host's kill after 8 s, and the Booth gave up waiting after 9 s (`STOP_WAIT_MS`). A press now asks the DAW at once, its pre-roll runs while the cold read ends, and the take's listening starts from the real cursor once it has ended. A listening start that then fails drops the take as in Fix 1. Not measured: the real sidecar's stop time on the owner's machine, and the Start from here lookup (`BoothPunchTarget`), which runs before the press's first timeline step and is not on its line.

## Fix 3: a repeat lookup reads no take

Refs #3221. A press with a start chosen (Start from here, Record from here, Punch and roll) asks `BoothPunchTarget` first, and the start stays chosen after a take. The lookup compares the chapter's stored check with the audio it was made from, so it opened every item on the chapter's track and read three 64 KiB blocks of each (`evidence.Identify`), on every press. That cost grows with the takes already recorded. Measured 2026-11-10 on a Linux VM with real files (60 MB each, one chapter track, page cache dropped before the first lookup):

| Takes on the track | First lookup | Before: every lookup | After: repeat lookup |
| --- | --- | --- | --- |
| 500 | 158 ms | 120 ms | 10 ms |
| 5,000 | 1.34 s | 1.09 s | 72 to 78 ms |

At 0.26 ms per take this machine needs tens of thousands of takes to reach 10 s. Windows (antivirus scanning each open, a slower disk) is not measured, and this was not shown to be the owner's 10 s: it is a measured cost that scales with takes. `evidence.IdentityCache` now answers a repeat ask with one `stat`: an identity holds while the file's size and modification time are the ones it was read with. The first lookup after launch is not faster (it reads every take, plus one `stat` each); a check run writes the identities with a fresh read (`Refresh`) and the cache keeps them, so the first lookup after a check is a repeat. A take rewritten with the same size and the same modification time, or a symlink retargeted to a file of the same size and time, is not noticed by a lookup (the next check run sees it); a take whose time is less than two seconds old when it is read is not remembered, so a quick rewrite on a filesystem with a coarse time (FAT32 keeps two seconds) is read again. The cache sits under every coverage evaluation (`Result`, `Alignment`, `ResultIn`), not only the Start from here lookup: the Booth, the workspace and replace bindings, the DAW range and FX range gates, the chapter sync and the pickup list all read take identities through it, so a take rewritten with the same size and time is not noticed by any of them until the next check run (no tool in the app does that; replace goes through REAPER, which writes new files). The check run, the editing scans, replace and the peaks read the file every time. A take is read once per app launch. The table is for a flat chapter: for a chapter linked to a Voice folder the lookup identifies only the linked track's own items, so the cost removed there is unmeasured. The lookup stays before the cue and the DAW command: the punch position comes from it, and a refused lookup (the check is stale, several voices) starts no take, so a cue sounded before it would announce a recording that never begins.

## REAPER while the app works with it

The same scenario wraps REAPER's defer loop with the probe of [the bridge note](reaper-bridge-performance.md#method) and sends what the host sends: the Booth's idle read (`chapter_track_state` every 15 s, `READY_POLL_MS` in [`useRecordControl.ts`](../../src/studio/ui/src/components/booth/record/useRecordControl.ts)), then five record presses. It sends the host's commands from the harness; the Go host itself was not running. 4050 items, 62 tracks, 120 FX, 2026-11-01:

| Window | Tick p99 | Longest tick | Main thread busy with the bridge | Probe gap p95 / max |
| --- | --- | --- | --- | --- |
| Idle, the Booth's read every 15 s (32 s) | 0.23 ms | 4.0 ms | 0.41% | 34 / 68 ms |
| Five record presses, a stop after each (30 s) | 5.5 ms | 17.5 ms | 0.91% | 36 / 55 ms |

The probe gap is REAPER's own defer cadence (33 to 41 ms p95 with the bridge held, in the bridge note), so on Linux neither window shows the bridge holding REAPER up.

The teleprompter sidecar while it listens, from source on this machine, over 40 s of LibriVox speech paced at real time (`--wav` with each chunk released at its own time, as a microphone does): `tiny` used 0.79 of a core on average, up to 19 threads, and finished 147 s after the audio began, so its decoding fell behind real time; `small.en` had not finished after 600 s. It competes with REAPER for CPU only while a take or a cold read runs (listening ends with the take); idle, no sidecar runs unless the Levels meter is open. Not measured on the owner's machine.

## The timeline diagnostic

Switched on in REAPER with the bridge timing switch ([owner steps](reaper-bridge-performance.md#owner-hands-on), step 2), the heartbeat carries a seventh field and the host appends one line per press to `record-timeline.log` in the bridge session folder, beside `bridge-timing.log` ([`internal/presstimeline`](../../src/studio/desktop/internal/presstimeline/timeline.go), [`presstimeline_host.go`](../../src/studio/desktop/presstimeline_host.go)). Off, the host stamps nothing. A line holds step names, an outcome word (`started` or the refusal's reason) and milliseconds since the first step, on the host's monotonic clock. Its shape, with made-up numbers:

```text
2026-11-01T18:52:02Z record_press outcome=started total_ms=2653 assets_list=0 assets_listed=3 listen_call=5 model_checked=7 sidecar_spawned=40 sidecar_first_line=900 listening=2403 listen_answered=2404 record_call=2410 track_state=2440 armed=2476 punched=2512 recording=2565 answered=2566
```

| Step | Stamped when |
| --- | --- |
| `punch_lookup`, `punch_looked_up` | A press that starts from a chosen phrase (Start from here, Punch and roll) asks `BoothPunchTarget` first: the alignment and the saved project are read. Only such a press has them; it starts here, and `assets_list` continues it only if it follows within 2 s |
| `assets_list`, `assets_listed` | The model check's `AssetsList` begins and answers. A press with no lookup starts here; an asset listing more than 5 s before the next step (another page's) is left off |
| `bootstrap_call`, `bootstrapped` | The project check (`Bootstrap`) just before the start tone. The tone sounds when `bootstrapped` is stamped, so that step is when the narrator hears the app start. Stamped only within 5 s of the press's last step of its own; the page asks for this all the time, and those calls never chain one press to the next |
| `listen_call`, `model_checked` | `TeleprompterStart` begins; the model is verified (`liveModelDir`) |
| `sidecar_spawned`, `sidecar_first_line`, `listening` | The sidecar process started; printed its first line; printed its first event other than `script` |
| `listen_answered` | `TeleprompterStart` answers the Booth. When the record start answers first, the line waits for this step |
| `record_call`, `track_state`, `armed`, `punched`, `recording`, `answered` | `ReadAloudRecordStart(At)` begins; each bridge step answers; the start answers |

A press with listening already running has no listening steps. The click itself, in the WebView, is before the line's first step by one Wails call; that gap is not stamped.

## Method

- The sidecar runs: `live_asr.py --wav <5 s 220 Hz tone> --script <one sentence> --model-dir <model> --language en`, timed from `Popen` to the first stdout line whose `type` is not `script`, killed there. Models from `Systran/faster-whisper-*` on Hugging Face. The page cache was dropped with `/proc/sys/vm/drop_caches` before each model's first run.
- The bridge steps: `NARRATION_CI_ONLY="perf: a record press's four bridge steps answer within budget in a 4050-item project and the heartbeat says when timing is on" scripts/ci/real-reaper/run-linux-check.sh <out>`; numbers in `<out>/out/perf/record_press.json`. It also checks that real REAPER's heartbeat carries the timing field.

## Pending

- Owner, on Windows: the same timeline with the frozen sidecar, a real microphone and the model the owner uses. Steps in [the bridge note](reaper-bridge-performance.md#owner-hands-on); send `record-timeline.log` with `bridge-timing.log`.
