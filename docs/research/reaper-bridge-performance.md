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

## Fix 2: encoding by table lookup

`encode` looks each reserved byte up in a table built once, instead of calling a Lua function and `string.format` for it; the output is byte for byte the same (`tests/protocol_test.lua` compares all 256 bytes with the harness's copy of the host's encoder). Same scenarios, 2026-10-30:

| Measure | After fix 1 | After fix 2 |
| --- | --- | --- |
| 1000-item handler, median of 7 | 29.0 ms | 24.8 ms |
| Longest tick polling 1000 items every 1 s | 40.1 ms | 33.9 ms |
| Busy share of the main thread polling 1000 items every 1 s | 3.42% | 2.85% |
| Longest tick polling 50 items every 1 s | 4.9 ms | 3.6 ms |

What is left of a track read is about 9 to 12 ms of ReaScript calls per 1000 items and the Lua that builds the lines, both proportional to what the read lists.

## Requests per action (#3647)

The owner reports every REAPER interaction slow and hitting the 3 s limit. Two questions: what one command costs REAPER, and how many commands one user action sends.

**One command, on a project of 50 tracks and 1,800 items** (the bridge harness with a counting proxy around `reaper`; times convert the call and line counts with the unit costs above, about 1.1 µs a ReaScript call and 27 µs an event line; Linux, Windows unmeasured):

| Command | ReaScript calls | Event lines | Bytes | REAPER ms |
| --- | ---: | ---: | ---: | ---: |
| `ping`, `project_state`, `read_place`, `select_track`, `chapter_folders`, `last_action` | 7 to 19 | 1 | under 100 | under 0.1 |
| `tracks_read` | 214 | 52 | 3.7 KB | 1.6 |
| `chapter_track_state`, no items | 128 | 2 | 0.2 KB | 0.2 |
| `chapter_track_state`, one voice track, with items | 629 | 48 | 8 to 10 KB | 2 |
| `chapter_track_state`, a chapter folder, with items | 4,128 | 363 | 80 KB | 14 |
| `go_to`, a folder (`end`, `start`) | 1,141, 777 | 2, 1 | 0.1 KB | 1.3, 0.9 |
| `arm_lane` | 316 | 1 | 0.1 KB | 0.4 |

No command on a page-open, poll, focus or lane path reads every item of the project: `tracks_read` reads none, and an item read is bounded by the one chapter asked for. The commands that scan `CountMediaItems(0)` look an item up by GUID or edit it (navigation, takes, replace, range, retake lanes, line identity, level normalize, workspace) and run on a click. A lane switch's Lua commands cost about 3 ms of REAPER time together, so no handler explains a 3 s limit.

**One user action, in requests** (from the UI hooks and host bindings on `main` at the time; `TR` is `tracks_read`, `CTS` is `chapter_track_state` without items):

| Action | Requests before | Where they came from |
| --- | --- | --- |
| Booth idle, per 5 s | 3 TR + 1 CTS | the page's live read (`useLiveTracks`) answers, and its `readAt` re-runs `boothVoiceGet` (a TR) and `readAloudReaperState` (a TR and a CTS) |
| Booth idle, per 15 s | 1 TR + 1 CTS | `useRecordControl` asks the same `readAloudReaperState` as `useBoothVoices` |
| Booth lane switch | about 4 TR + 3 CTS + `arm_lane` | `BoothVoiceSet` (TR, then `arm_lane`), then three `readAloudReaperState` from the choice's epoch and voice changes |
| Booth window focus | about 9 | live tracks, record control, voices, listening mic and the pull-back all listen to focus |
| Editing idle | 1 TR per 5 s, a transport lease every 3 s, 2 requests per REAPER edit | |

The answers are small, so the volume costs REAPER little; what it multiplies is the round trip of each request (a command file, a REAPER tick that lists and reads the folder, an `events.log` append, a host poll): 11 to 80 ms measured on Linux above, unmeasured on Windows.

**Fix 1: one track list per edit counter.** The live track list is read through `cachedTrackLister` (`tracks_cache.go`): while the heartbeat's change count equals the count the last answer carried, and the answer is under 10 s old, the last answer is reused; callers that arrive while a read is out share it; a track this app creates drops the answer. With no counter nothing is reused, and nothing read before the bridge may have started over (a heartbeat gap longer than 5 s, another project, a counter that went down: `Reachability.Epoch`). An unchanged idle Booth tick goes from 3 TR to at most 1 TR per 10 s, and the four callers of one action share one read.

**The resume prompt's follow reads items only when the cursor settles** (#3664). The follow loop of the read-aloud dialog's resume prompt (`resumefollow.go`) asked for the chapter's whole folder every second for up to 30 minutes, to see that REAPER plays or records, that the cursor moved, and, once it settled, whether it is on the chapter's audio. It now reads the itemless state each tick (the transport and the edit cursor) and the items once, when the cursor has settled; a play or record that starts between the two reads, or a cursor that moved on, is judged on the second read. For a chapter folder of 360 items on the project above, one tick goes from about 4,100 ReaScript calls, 360 event lines and 80 KB to about 130 calls, 2 to 3 lines and under 0.3 KB (the two rows of the table above), so a minute of following no longer appends about 4.8 MB to `events.log` (which restarts at 8 MiB) but about 15 KB. The settle itself still reads the whole folder, once per settle (and once per tick while that read fails): a bounded summary of "where the audio ends and what is under the cursor" is the next step.

**Lane actions against a real REAPER, at 0 to 5,000 items** (#3645, the rigs are #3702). Each Booth action timed with the host's own client, its 150 ms tick and the page's concurrent reads, on REAPER 7.82 in CI with items cut from the pinned LibriVox chapter. Linux: lane switch about 105 ms, lane create about 75 ms, record press 121 to 150 ms; Windows (no audio device, so no record): lane switch 120 to 209 ms, lane create 87 to 105 ms; nothing above 226 ms and none of it grows with the item count except the folder read (31 to 78 ms at 5,000). The app's log now explains a slow case on its own: `bridge.slow`, with `queue_ms` and `reaper_ms`.

**A voice switch reads the DAW's arms once, after the host's answer** (#3647). `useBoothVoices` re-read the chapter's arm state (`readAloudReaperState`: a track list and a state read) whenever the voice, the epoch or the live track list changed, and a choice bumps the epoch when it starts, so a switch asked for one read while the host was still arming the lane (it waits in REAPER's queue beside `arm_lane`) and another once the answer landed. The first answers before the arm lands (both wait in REAPER's queue), so it is the DAW's word on the voice being left, and the Booth drops it from the arm-by-hand follow when the choice ends (the epoch bump); the arm dot would have shown it. The hook now reads nothing while a choice is in flight, and the dot keeps its last state until the read after the answer (a host choice is bounded by its lane command timeout). Measured with the mock api around the hook: 2 reads per switch before, 1 after (a held `boothVoiceSet` sees none). Not changed: `useRecordControl` reads on the capability counter and on a take starting or stopping, not on a switch.

## Not measured here

- Windows: file opens, directory listings and antivirus scans of `events.log`, which grows for the whole session. Each is a candidate this Linux run cannot rank.
- A real audio device and driver (ASIO, WASAPI), real input monitoring, real plug-ins.
- The app's own CPU (Go host and WebView) competing with REAPER on the owner's machine.
- REAPER drawing a 4050-item arrange view on a real display; `xvfb` draws to memory.

## Owner hands-on

Pending, owner: where REAPER's time goes on the Windows machine, with a real audio device. The bridge's timing diagnostic is off unless switched on. On, it adds one summary line every 10 s to `bridge-timing.log` in the bridge's session folder and to REAPER's console: ticks, tick time (p50, p99, max), the share of the main thread the bridge used, the commands-folder listing, and each command by name with its count and time. It never writes a path or project text. Measured in REAPER 7.82 on Linux with it on: tick p99 0.23 ms, busy 0.21%.

1. Install this build and open REAPER and the app as usual, with the project that feels slow.
2. In REAPER: Actions > Show action list > New action > New ReaScript. Name it `bridge timing on.lua`, paste this line, save and close the editor, then select the new action in the action list and press Run:

   ```lua
   reaper.SetExtState('NarrationStudio', 'bridge_timing', '1', false)
   ```

3. Work as you do when REAPER feels slow for at least two minutes: edit in REAPER with the app's Editing page open, then record a take from the Booth. Note the clock time of each slow moment.
4. Copy REAPER's console window (it opens on the first line), or send the file: Options > Show REAPER resource path, then `NarrationStudio/sessions/`, the newest `hub_…` folder, `bridge-timing.log`, and `record-timeline.log` beside it: one line per record press from the Booth, the time of each step before REAPER's pre-roll ([record-press timeline](record-press-timeline.md#the-timeline-diagnostic)). A press that ended with a sentence at one of the Booth's limits has no line there: send the `ui.record.limit` lines from `logs/run.jsonl` instead.
5. Switch it off with a second ReaScript holding `reaper.DeleteExtState('NarrationStudio', 'bridge_timing', false)`, or close REAPER (the switch does not outlive REAPER).
6. Also note the app's and REAPER's CPU in Task Manager while idle and while it feels slow.

How to read it: a `busy` share or `tick_ms max` that stays small while REAPER is slow rules the bridge out. A large `listing_ms` points at the commands-folder listing (a Windows file system or antivirus cost this Linux run cannot show). A large `max_ms` beside one command names that command.
