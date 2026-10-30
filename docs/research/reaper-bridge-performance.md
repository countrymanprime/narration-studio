# What the REAPER bridge costs REAPER

**Measured 2026-10-30 in REAPER 7.82, Linux x86_64 under `xvfb-run`, JACK dummy audio device, 4 cores. Not measured on Windows or with a real audio device.** Refs #2251: the owner reports that REAPER turns sluggish while the app runs, when they work in REAPER or start a recording from the Booth. The Booth's four bridge steps of a record press (about 200 ms, and REAPER's own two-measure pre-roll) were measured earlier and are not repeated here.

## Method

[`scenarios_perf.py`](../../scripts/ci/real-reaper/scenarios_perf.py) runs in the real-REAPER Linux check (`NARRATION_CI_ONLY=perf scripts/ci/real-reaper/run-linux-check.sh <out>`). A `ci_exec` snippet:

- wraps `reaper.defer`, so every deferred callback, the bridge's tick among them, is timed with `reaper.time_precise`;
- runs a probe defer loop of its own: the gap between two of its callbacks is how long REAPER's main thread was busy, the wait a click in REAPER has;
- "holds" the bridge for a window (the wrapper re-defers its tick without running it), which is REAPER with the bridge detached.

The driver reads REAPER's CPU from `/proc/<pid>/stat`, counts the main thread's file system calls with `strace -c` in separate windows (strace slows each call, so those windows' timings are not kept), and times round trips by tailing `events.log` every 2 ms. The large project is 4050 items: a "Chapter 1" track of 50 items, a "Retakes" track of 1000, and 60 tracks of 50 items each with ReaEQ and ReaComp. Each window is 10 to 12 s. Raw numbers land in `<out>/out/perf/*.json`.

## What the bridge does

Per defer tick (about 30 a second), [`narration_ui_bridge.lua`](../../src/studio/integrations/reaper/narration_ui_bridge.lua) lists the `commands` folder (`EnumerateFiles(dir, -1)` clears REAPER's listing cache, so each tick reads the directory), runs any commands, sends the heartbeat when 1.5 s passed or the play state changed, and runs the transport watch. It scans no items and writes no file on an idle tick except the heartbeat.

Every event line is one `io.open(events.log, 'a')`, write and close ([`narration_bridge_core.lua`](../../src/studio/integrations/reaper/narration_bridge_core.lua), `event`). A command that answers many lines opens the file once per line. `chapter_track_state` answers one `TRACK_ITEM` per item on the track, up to 1000.

What the host sends REAPER without a press, from the code:

| Caller | Command | When |
| --- | --- | --- |
| Editing page, [`useWordClock.ts`](../../src/studio/ui/src/components/editing/follow/useWordClock.ts) → `WorkspaceWordTimes` | `chapter_track_state` | On open, and on every `daw_project_edited`: each edit in REAPER, seen at the next heartbeat |
| Booth, [`useRecordControl.ts`](../../src/studio/ui/src/components/booth/record/useRecordControl.ts) → `ReadAloudReaperState` | `chapter_track_state` | Every 4 s while recording or not ready, every 15 s otherwise, and on window focus |
| Resume prompt, [`resumefollow.go`](../../src/studio/desktop/resumefollow.go) | `chapter_track_state` | Every 1 s for up to 30 min |
| Live session, [`teleprompterpunchpoll.go`](../../src/studio/desktop/teleprompterpunchpoll.go) | `play_position` | Every 3 s |

The host's other timers (`transcriptLoop` 150 ms, `chapterSyncWatchLoop` 2 s, `backgroundCheckLoop` 15 s) read the heartbeat or files and send REAPER nothing.

## Results

| Window | REAPER CPU, bridge on / held | Bridge tick p50 / p99 / max | Main thread busy with the bridge | Probe gap p95 / max |
| --- | --- | --- | --- | --- |
| Small project, idle | 5.6% / 5.4% | 0.062 / 0.168 / 3.1 ms | 0.24% | 41 / 76 ms |
| 4050 items, idle | 23.7% / 23.1% | 0.057 / 0.178 / 0.39 ms | 0.20% | 33 / 97 ms |
| 4050 items, recording | 33.1% / 33.2% | 0.065 / 0.161 / 0.23 ms | 0.22% | 34 / 37 ms |
| 4050 items, recording, 50-item read every 4 s | 34.2% | 0.067 / 1.2 / 3.8 ms | 0.31% | 35 / 75 ms |
| 4050 items, 50-item read every 1 s | 24.8% | 0.061 / 3.6 / 4.7 ms | 0.48% | 33 / 42 ms |
| 4050 items, 1000-item read every 1 s | 26.8% | 0.056 / 38.1 / 39.7 ms | 3.62% | 42 / 53 ms |

With the bridge held the probe gap is the same (33 to 41 ms p95): REAPER's own defer cadence, not the bridge.

Round trips, command file written to answer read, 10 each:

| Command | p50 | p95 |
| --- | --- | --- |
| `ping` | 11 ms | 11 ms |
| `project_state` | 31 ms | 39 ms |
| `chapter_track_state`, no track | 32 ms | 34 ms |
| `chapter_track_state`, 50 items | 36 ms | 37 ms |
| `chapter_track_state`, 1000 items | 76 ms | 81 ms |

File system calls by REAPER's main thread, per second:

| Window | `openat` | `getdents64` | `close` | `write` | `lseek` |
| --- | --- | --- | --- | --- | --- |
| Small project, idle, bridge on | 30 | 58 | 30 | 0.8 | 0.7 |
| Small project, idle, bridge held | 0.4 | 0.6 | 0.4 | 0.1 | 0.1 |
| 4050 items, 1000-item read every 1 s | 1021 | 36 | 1021 | 1002 | 1002 |

## Where a track read's time goes

The `chapter_track_state` handler of a 1000-item track, called inside REAPER with its events sent three ways, median of 7 runs:

| Events | Time |
| --- | --- |
| Not built | 9.0 ms |
| Percent-encoded and joined, not written | 23.2 ms |
| Written as the bridge writes them, one append per line | 36.7 ms |

About 9 µs an item is ReaScript calls (`item_row`: the item and take GUIDs, `GetMediaSourceFileName`, five `Get*Info_Value`), about 14 µs is `encode` (a Lua function call and a `string.format` for every character outside `[%w-_.~]`, and a source path has many), and about 13 µs is the append.

## Ranking

1. **`chapter_track_state` cost per item**: about 37 µs an item, so 37 ms for 1000 items and 2 to 5 ms for a 50-item chapter, plus 4 file system calls per item. It runs after every edit in REAPER while the Editing page is open, every 4 s while the Booth records, and every 1 s while the resume prompt follows. The per-line appends are a third of the time on Linux; on Windows each open and close of a written file also passes the file system filter drivers (antivirus), so they are expected to weigh more there: not measured. Encoding is the other large part on every platform.
2. **The idle tick's folder listing**: 30 directory opens and 58 `getdents64` a second, 0.06 ms a tick, 0.2% of the main thread. REAPER's CPU is the same with the bridge held. Not worth slowing the first command after idle for, on these numbers; Windows unmeasured.
3. Everything else (heartbeat, transport watch, the record watch loop): below what these windows resolve.

On Linux the bridge does not explain a sluggish REAPER: nothing it does idle or while recording costs more than 0.3% of the main thread, and the worst read measured, 40 ms, is about one dropped frame.

## Fix 1: one append per command

[`narration_bridge_core.lua`](../../src/studio/integrations/reaper/narration_bridge_core.lua) `batched` holds the events a command sends and appends them in one write when it returns or fails; events sent outside a command (the heartbeat, a feature's own defer callback) are written at once as before. Same scenarios, same REAPER, 2026-10-30:

| Measure | Before | After |
| --- | --- | --- |
| 1000-item read at one a second: `openat` / `write` / `close` per second | 1021 / 1002 / 1021 | 30 / 2.7 / 30 |
| 1000-item handler, median of 7 | 36.7 ms | 29.0 ms |
| Longest tick polling 1000 items every 1 s | 39.7 ms | 40.1 ms |
| Idle, 4050 items: tick p99, REAPER CPU on / held | 0.178 ms, 23.7% / 23.1% | 0.218 ms, 24.0% / 23.4% |

The remaining 30 opens a second are the idle loop's listing. The longest tick moved within run-to-run noise: on Linux the appends were a third of the handler, and the encoding and the API calls remain.

## Not measured here

- Windows: file opens, directory listings and antivirus scans of `events.log`, which grows for the whole session. Each is a candidate this Linux run cannot rank.
- A real audio device and driver (ASIO, WASAPI), real input monitoring, real plug-ins.
- The app's own CPU (Go host and WebView) competing with REAPER on the owner's machine.
- REAPER drawing a 4050-item arrange view on a real display; `xvfb` draws to memory.

## Owner hands-on

Pending, owner: confirm on the Windows machine where REAPER's time goes. The steps need the bridge timing diagnostic, which is not in this change.
