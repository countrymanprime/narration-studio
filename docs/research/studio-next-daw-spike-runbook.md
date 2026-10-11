# Studio Next DAW spikes: the owner's run sheet for SND-1a to SND-1g

**Status: written 2026-10-11. Nothing in this note was run.** The slice that wrote it had no REAPER and no Audacity. Every "Expected" line below is a hypothesis taken from [the DAW PRD](../prds/studio-next-daw-ports-and-capabilities.prd.md) or from the API's documented behaviour, not an observation. Every Lua and Python block is untested until your run: a script error is itself a result, so send back the report file even when a spike fails.

Tracking: issue #1096, part of #1016. The run is one entry on #992, not one per spike. Phase 1 of the PRD stays pending until you return the table.

## What you return

1. The filled [results table](#results-table).
2. Everything in each spike's output folder: `spike-<id>-report.txt`, plus `1a` and `1f` CSV files and the `1g` JSON and WAV hashes.
3. The step 0 and step 9 SHA-256 lines.

Paste the table on #992 or commit it back. A spike that cannot run is returned as a table row with result left empty and the reason in notes; say which gate failed (no audio interface, no `mod-script-pipe`, wrong version).

## Rules that apply to every REAPER spike

- REAPER starts with `-cfgfile <fresh temp folder>\reaper.ini -nosplash -newinst -noactivate`, so your settings, scripts and ExtState are never read or written. `integrations/reaper/spikes/run-reaper.ps1` builds that command line and refuses a `-Cfg`, `-Out` or `-Project` outside `%TEMP%` or under a `REAPER Media` folder.
- REAPER opens only a **copy** of the project, under the temp folder. Nothing in the `Challenges_001` folder is written. Step 0 and step 9 hash the original to prove it.
- Each script builds its own tracks and items from synthetic tones (`make_media.py`) on the copy. Nothing is saved: `run-reaper.ps1` answers No to REAPER's save prompt on close.
- The first call of every REAPER script is the guard in `common.lua`. It asserts that REAPER's resource path is the scratch `-cfgfile` folder. Then it closes the audio device (`reaper.Audio_Quit()`) and asserts it is closed. Spikes 1a (real record part) and 1f need the device and say so; their guard asserts the resource path only.
- A spike reads undo points by pressing Undo through the API until the baseline label returns, so each REAPER spike ends by undoing its own work. Run each spike from a fresh `-Out` and `-Cfg` folder; running one twice from clean folders should give the same report apart from GUIDs and timestamps.

## Step 0: set up (once per sitting)

Run from the repository root in PowerShell 7. Edit `$orig` to your project path.

```powershell
$orig = "C:\Users\<you>\Documents\REAPER Media\Projects\Challenges\Challenges_001.rpp"
$root = Join-Path $env:TEMP ("nu-daw-spike-" + (Get-Date -Format yyyyMMdd-HHmmss))
New-Item -ItemType Directory -Force "$root\lua", "$root\project" | Out-Null
$before = (Get-FileHash -Algorithm SHA256 $orig).Hash
"BEFORE $before  $orig" | Tee-Object "$root\sha256.txt"

function Invoke-Spike {
  param([Parameter(Mandatory)][string]$Id, [Parameter(Mandatory)][string]$Script, [string]$CfgName = '', [int]$TimeoutSec = 90)
  $dir = "$root\$Id"
  $cfg = if ($CfgName) { "$root\$CfgName" } else { "$dir\cfg" }
  $out = "$dir\out"
  if (Test-Path $out) { throw "$out exists: use a fresh `$root for a rerun" }
  New-Item -ItemType Directory -Force $out | Out-Null
  python integrations/reaper/spikes/make_media.py "$out\media"
  Copy-Item "$root\lua\common.lua" "$out\common.lua"
  Copy-Item $orig "$dir\copy.rpp"
  pwsh integrations/reaper/spikes/run-reaper.ps1 -Cfg $cfg -Out $out -Script "$root\lua\$Script" `
    -Project "$dir\copy.rpp" -Done "$out\spike-$Id-report.txt" -IgnoreErrors -TimeoutSec $TimeoutSec
  Get-Content "$out\spike-$Id-report.txt"
}
```

Save the shared Lua below as `$root\lua\common.lua`. Every REAPER script `dofile`s it from its output folder (`Invoke-Spike` copies it there).

```lua
-- common.lua: guard, fixture helpers, undo walk, report. Saved to <root>\lua\common.lua.
local M = {}
local out = os.getenv('NARRATION_UTILS_SPIKE_OUT')
local lines = {}

function M.log(...)
  local parts = {}
  for i = 1, select('#', ...) do parts[#parts + 1] = tostring((select(i, ...))) end
  lines[#lines + 1] = table.concat(parts, '\t')
end

-- The S0/S6 guard. needs_device = true skips closing the audio device (spikes 1a real record and 1f only).
function M.guard(needs_device)
  local bs = string.char(92)
  local wanted = os.getenv('NARRATION_UTILS_SPIKE_CFG')
  assert(out and out ~= '', 'NARRATION_UTILS_SPIKE_OUT is not set: start this script with run-reaper.ps1')
  assert(wanted and wanted ~= '', 'NARRATION_UTILS_SPIKE_CFG is not set: start this script with run-reaper.ps1')
  local actual = reaper.GetResourcePath()
  assert(actual:gsub(bs, '/'):lower() == wanted:gsub(bs, '/'):lower(), 'REAPER is not using the isolated -cfgfile: ' .. actual)
  if needs_device then
    M.log('audio_device_needed', 'Audio_IsRunning', reaper.Audio_IsRunning())
  else
    reaper.Audio_Quit()
    assert(reaper.Audio_IsRunning() == 0, 'the audio device could not be closed')
    M.log('audio_device_closed', 'Audio_IsRunning', reaper.Audio_IsRunning())
  end
end

function M.out() return out end

function M.track(name)
  local index = reaper.CountTracks(0)
  reaper.InsertTrackAtIndex(index, true)
  local track = reaper.GetTrack(0, index)
  reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', name, true)
  return track
end

function M.item(track, file, position, length, offset)
  local item = reaper.AddMediaItemToTrack(track)
  reaper.SetMediaItemInfo_Value(item, 'D_POSITION', position)
  reaper.SetMediaItemInfo_Value(item, 'D_LENGTH', length)
  local take = reaper.AddTakeToMediaItem(item)
  reaper.SetMediaItemTake_Source(take, reaper.PCM_Source_CreateFromFile(out .. '/media/' .. file))
  reaper.SetMediaItemTakeInfo_Value(take, 'D_STARTOFFS', offset or 0)
  return item, take
end

-- One line per item on the track: position, length, take count, active take index.
function M.describe(label, track)
  for i = 0, reaper.CountTrackMediaItems(track) - 1 do
    local item = reaper.GetTrackMediaItem(track, i)
    local active = reaper.GetActiveTake(item)
    M.log(label, 'item', i,
      string.format('pos=%.3f len=%.3f', reaper.GetMediaItemInfo_Value(item, 'D_POSITION'), reaper.GetMediaItemInfo_Value(item, 'D_LENGTH')),
      'takes=' .. reaper.CountTakes(item),
      'active=' .. (active and reaper.GetMediaItemTakeInfo_Value(active, 'IP_TAKENUMBER') or 'none'))
  end
end

-- API edits leave no undo point of their own, so the fixture ends with a named point the walk below stops at.
function M.baseline()
  reaper.Undo_OnStateChange2(0, 'spike baseline')
end

-- Presses Undo until the baseline label is on top. Returns the labels it undid, newest first.
function M.undo_walk()
  local names = {}
  for _ = 1, 25 do
    local label = reaper.Undo_CanUndo2(0)
    if label == nil or label == 'spike baseline' then break end
    names[#names + 1] = label
    reaper.Undo_DoUndo2(0)
  end
  M.log('UNDO_POINTS', #names, table.concat(names, ' | '))
  return names
end

-- Rewrites the report with everything logged so far; defer-driven scripts call it again when they finish.
function M.flush(id)
  local f = io.open(out .. '/spike-' .. id .. '-report.txt', 'w')
  f:write(table.concat(lines, '\n'), '\n')
  f:close()
end

-- Runs body(common) after the guard, then writes the report (the report file is the run-reaper.ps1 done marker).
function M.run(id, needs_device, body)
  local ok, err = xpcall(function()
    M.guard(needs_device)
    M.log('reaper_version', reaper.GetAppVersion(), 'os', reaper.GetOS(), _VERSION)
    body(M)
  end, debug.traceback)
  M.log(ok and 'RESULT_SCRIPT_FINISHED' or 'RESULT_SCRIPT_ERROR', ok and '' or tostring(err))
  M.flush(id)
end

return M
```

Each spike's Lua starts with `local c = dofile(os.getenv('NARRATION_UTILS_SPIKE_OUT') .. '/common.lua')`. Save it to `$root\lua\<name>.lua` and run the `Invoke-Spike` line under it.

## 1a Roll (SND-S1)

**Question (PRD, verbatim):** Can a roll while recording be one command that keeps the earlier audio as a take in REAPER, and what undo points result?

**Needs:** REAPER 7.80 on a copy. The real-record part needs the audio interface; the scripted fake does not.

**Expected (hypothesis):** the earlier audio survives as a take on the same item when the project's recording mode is one that overdubs into takes, and the whole roll is one undo block when the command wraps it.

| Result | What it changes in the PRD |
| --- | --- |
| Yes | Roll ships as one command (`roll`, SND-6a). Record the recording mode that worked; the command refuses with that mode named when the project is in another, and never changes preferences. |
| No | SND-6a is dropped from the Booth and ADR 0246's cursor-only roll stays; the PRD row "Roll as one command (A8)" is reopened. |
| Partly | Roll ships only for the recording mode(s) that kept the audio, refusing otherwise; list which modes, and any extra undo points the narrator would see. |

### 1a-fake: scripted, no device (run first)

Stand-in for a roll: in one undo block, add a new recording (a tone file) as a new take on the item under the cursor. This measures the undo points and the take state a one-block roll leaves.

Save as `$root\lua\spike_1a_fake.lua`:

```lua
local c = dofile(os.getenv('NARRATION_UTILS_SPIKE_OUT') .. '/common.lua')
c.run('1a-fake', false, function()
  local track = c.track('Spike roll')
  local item, first = c.item(track, 'take_a.wav', 0, 3)
  c.baseline()
  c.describe('before', track)
  reaper.Undo_BeginBlock2(0)
  local take = reaper.AddTakeToMediaItem(item)
  reaper.SetMediaItemTake_Source(take, reaper.PCM_Source_CreateFromFile(c.out() .. '/media/take_b.wav'))
  reaper.SetActiveTake(first)
  reaper.Undo_EndBlock2(0, 'Narration Utils: spike roll', -1)
  c.describe('after', track)
  c.log('earlier_take_still_active', reaper.GetActiveTake(item) == first)
  c.undo_walk()
  c.describe('after_undo', track)
end)
```

```powershell
Invoke-Spike -Id 1a-fake -Script spike_1a_fake.lua
```

Expected: after: 1 item, 2 takes, active take 1; `UNDO_POINTS 1 Narration Utils: spike roll`; after_undo: 1 take.

### 1a-real: recording on the audio interface

**Needs the audio interface.** This script arms a track and records for 6 seconds with a real device. The isolated REAPER has its own device settings, so set them once in a **kept** cfg folder:

```powershell
$deviceCfg = "$root\cfg-device"
New-Item -ItemType Directory -Force $deviceCfg | Out-Null
& 'C:\Program Files\REAPER (x64)\reaper.exe' -cfgfile "$deviceCfg\reaper.ini" -newinst -noactivate
# In that window: Options > Preferences > Audio > Device, pick your interface and an input, then close REAPER.
```

Then, for each recording mode you want to test, run the script below once from a fresh `$root` sibling folder. The mode is a project setting (Project settings > Recording > Recording mode), which the script cannot set safely; change it in the copy before the run by opening the copy by hand under the same `-cfgfile` and saving it, or run the spike once per mode and write the mode in the notes column. The script reads the mode if the API offers it and logs `recmode_unknown` if not. It never touches preferences.

Save as `$root\lua\spike_1a_real.lua`:

```lua
local c = dofile(os.getenv('NARRATION_UTILS_SPIKE_OUT') .. '/common.lua')
c.run('1a-real', true, function()
  local track = c.track('Spike roll')
  c.item(track, 'take_a.wav', 0, 3)
  reaper.SetMediaTrackInfo_Value(track, 'I_RECARM', 1)
  reaper.SetEditCurPos(1.5, true, false)
  c.baseline()
  local ok, mode = pcall(reaper.get_config_var_string, 'recmode')
  c.log('recmode', ok and tostring(mode) or 'recmode_unknown')
  c.log('inputs', reaper.GetNumAudioInputs(), 'outputs', reaper.GetNumAudioOutputs())
  c.describe('before', track)
  local started = reaper.time_precise()
  reaper.CSurf_OnRecord()
  local function finish()
    reaper.CSurf_OnStop()
    c.log('recorded_seconds', reaper.time_precise() - started)
    c.describe('after', track)
    c.undo_walk()
    c.describe('after_undo', track)
    -- run() has returned by now, so the report is rewritten here
    c.flush('1a-real')
  end
  local function wait()
    if reaper.time_precise() - started < 6 then reaper.defer(wait) else finish() end
  end
  wait()
end)
```

The script calls `c.flush` at the end because `defer` outlives `run`.

```powershell
Invoke-Spike -Id 1a-real -Script spike_1a_real.lua -CfgName cfg-device -TimeoutSec 60
```

`Invoke-Spike` stops waiting at the done marker, which `run` writes before the defer loop ends; if the report has no `recorded_seconds` line, rerun with `-TimeoutSec 120` and read the file after REAPER closes. Say input monitoring and the input you used in the notes.

Expected: record starts at the cursor (1.5 s), and the report shows whether the earlier 3 s item survives as a take, a split item or an overwritten region, and how many undo points the record adds. Any item REAPER wrote lands next to the copy under `$root\1a-real`, not in the original folder.

**If it cannot run:** send the 1a-fake row, and in the 1a-real row write "no interface" or the REAPER error text.

## 1b Cut (SND-S2)

**Question (PRD, verbatim):** Is "split at both ends, move middle to a muted Cuts track" one undo block, and does closing up later audio stay correct for other items?

**Needs:** REAPER 7.80 on a copy.

**Expected (hypothesis):** one block gives one undo point; items on the same track after the cut move left by the cut length, an item on another track that spans the cut end does not move.

| Result | What it changes in the PRD |
| --- | --- |
| Yes | `delete_range` (SND-6b) is one block and closes up the same track; the mock's one-step undo is kept. |
| No | The undo is more than one step: SND-6b lists the steps (as Audacity does) or the command stops closing up and fills with room tone instead. |
| Partly | Record which half failed: if only the close-up is wrong for other tracks, `delete_range` closes up its own track only and the Cuts-track move stays one step. |

Save as `$root\lua\spike_1b_cut.lua`:

```lua
local c = dofile(os.getenv('NARRATION_UTILS_SPIKE_OUT') .. '/common.lua')
c.run('1b', false, function()
  local words = c.track('Words')
  local cuts = c.track('Cuts')
  local room = c.track('Room')
  reaper.SetMediaTrackInfo_Value(cuts, 'B_MUTE', 1)
  c.item(words, 'take_a.wav', 0, 3)
  c.item(words, 'take_b.wav', 3, 3)
  c.item(words, 'take_c.wav', 6, 3)
  c.item(room, 'take_a.wav', 5.5, 3) -- spans the cut end (5): must not move
  c.baseline()
  local from, to = 4, 5
  for _, t in ipairs({ { 'before words', words }, { 'before cuts', cuts }, { 'before room', room } }) do c.describe(t[1], t[2]) end

  reaper.Undo_BeginBlock2(0)
  local victim
  for i = 0, reaper.CountTrackMediaItems(words) - 1 do
    local item = reaper.GetTrackMediaItem(words, i)
    local pos = reaper.GetMediaItemInfo_Value(item, 'D_POSITION')
    if pos <= from and pos + reaper.GetMediaItemInfo_Value(item, 'D_LENGTH') >= to then victim = item end
  end
  assert(victim, 'no item covers the cut range')
  local middle = reaper.SplitMediaItem(victim, from)
  local tail = reaper.SplitMediaItem(middle, to)
  reaper.MoveMediaItemToTrack(middle, cuts)
  local gap = to - from
  for i = 0, reaper.CountTrackMediaItems(words) - 1 do
    local item = reaper.GetTrackMediaItem(words, i)
    local pos = reaper.GetMediaItemInfo_Value(item, 'D_POSITION')
    if pos >= to - 1e-9 then reaper.SetMediaItemInfo_Value(item, 'D_POSITION', pos - gap) end
  end
  reaper.Undo_EndBlock2(0, 'Narration Utils: spike cut', -1)

  c.log('tail_returned', tail ~= nil)
  for _, t in ipairs({ { 'after words', words }, { 'after cuts', cuts }, { 'after room', room } }) do c.describe(t[1], t[2]) end
  c.log('cuts_track_muted', reaper.GetMediaTrackInfo_Value(cuts, 'B_MUTE'))
  c.undo_walk()
  for _, t in ipairs({ { 'after_undo words', words }, { 'after_undo cuts', cuts } }) do c.describe(t[1], t[2]) end
end)
```

```powershell
Invoke-Spike -Id 1b -Script spike_1b_cut.lua
```

Expected: after words: items at 0 (3 s), 3 (1 s), 4 (the 1 s tail, moved from 5) and 5 (the old third item, moved from 6); after cuts: one 1 s item at 4; after room: one item at 5.5; `UNDO_POINTS 1`; after_undo words: three items at 0, 3, 6 and an empty Cuts track.

## 1c Chain on range (SND-S3)

**Question (PRD, verbatim):** Does `TakeFX_AddByName` load a saved `.RfxChain` onto a split piece, and how is it undone?

**Needs:** REAPER 7.80 on a copy; ReaEQ (it ships with REAPER).

**Expected (hypothesis):** ADR 0234 holds that chains go on tracks and `TrackFX_AddByName` takes a chain's full path (`edit-and-proof-spike-ep0.md`, row A8); this spike tests whether the take-level call accepts the same. It may add nothing.

| Result | What it changes in the PRD |
| --- | --- |
| Yes | `apply_fx_range` (SND-6c) loads the saved chain onto the middle piece; record the exact name form that worked and whether the undo is one point. |
| No | SND-6c keeps ADR 0234's one plug-in at a time on a passage; ADR 0705's chain-on-range part is not superseded. |
| Partly | Some name form works but the count or order of FX differs from the chain's: SND-6c applies the chain by splitting it into single `TakeFX_AddByName` calls, or refuses chains with more than one FX. Record the counts. |

Save as `$root\lua\spike_1c_chain.lua`:

```lua
local c = dofile(os.getenv('NARRATION_UTILS_SPIKE_OUT') .. '/common.lua')
-- The body of an .RfxChain, taken from REAPER's own <FXCHAIN> text for a scratch track that has the plug-in.
local function chain_text_for(plugin)
  local index = reaper.CountTracks(0)
  reaper.InsertTrackAtIndex(index, false)
  local scratch = reaper.GetTrack(0, index)
  assert(reaper.TrackFX_AddByName(scratch, plugin, false, -1) >= 0, 'could not add ' .. plugin)
  local _, chunk = reaper.GetTrackStateChunk(scratch, '', false)
  local lines, inside, depth = {}, false, 0
  for line in chunk:gmatch('[^\r\n]+') do
    local t = line:match('^%s*(.-)%s*$')
    if not inside and t:match('^<FXCHAIN') then
      inside, depth = true, 1
    elseif inside then
      if t:sub(1, 1) == '<' then depth = depth + 1 elseif t == '>' then
        depth = depth - 1
        if depth == 0 then break end
      end
      if #lines > 0 or t:match('^BYPASS') then lines[#lines + 1] = t end
    end
  end
  reaper.DeleteTrack(scratch)
  assert(#lines > 0, 'no FX chain text')
  return table.concat(lines, '\n') .. '\n'
end

c.run('1c', false, function()
  local SEP = '/'
  local root = reaper.GetResourcePath() .. SEP .. 'FXChains'
  reaper.RecursiveCreateDirectory(root .. SEP .. 'Spike', 0)
  local chain_path = root .. SEP .. 'Spike' .. SEP .. 'Spike EQ.RfxChain'
  local f = assert(io.open(chain_path, 'w'))
  f:write(chain_text_for('ReaEQ'))
  f:close()
  local track = c.track('Spike chain')
  local item, take = c.item(track, 'take_a.wav', 0, 3)
  c.baseline()

  reaper.Undo_BeginBlock2(0)
  local middle = reaper.SplitMediaItem(item, 1)
  reaper.SplitMediaItem(middle, 2)
  local middle_take = reaper.GetActiveTake(middle)
  local forms = {
    { 'full path', chain_path },
    { 'FXChains-relative', 'Spike/Spike EQ.RfxChain' },
    { 'FXChain: prefix', 'FXChain: Spike/Spike EQ.RfxChain' },
  }
  for _, form in ipairs(forms) do
    local before = reaper.TakeFX_GetCount(middle_take)
    local index = reaper.TakeFX_AddByName(middle_take, form[2], -1)
    c.log('form', form[1], 'returned', index, 'fx_count_delta', reaper.TakeFX_GetCount(middle_take) - before)
  end
  reaper.Undo_EndBlock2(0, 'Narration Utils: spike chain on range', -1)

  c.log('fx_on_middle', reaper.TakeFX_GetCount(middle_take), 'fx_on_original_piece', reaper.TakeFX_GetCount(take))
  c.describe('after', track)
  c.undo_walk()
  c.describe('after_undo', track)
end)
```

```powershell
Invoke-Spike -Id 1c -Script spike_1c_chain.lua
```

Expected: `UNDO_POINTS 1 Narration Utils: spike chain on range`; after_undo: one 3 s item. The three `form` lines say which name form (if any) added FX; `-1` means "add only if not present", so the second and third forms add nothing if the first already added ReaEQ. Rerun with only one form uncommented per run if the first form hides the others, and put each run's report in the output files.

## 1d Stack (SND-S4)

**Question (PRD, verbatim):** Can later reads become takes of the first item in one undo block?

**Needs:** REAPER 7.80 on a copy.

**Expected (hypothesis):** `AddTakeToMediaItem` plus `SetMediaItemTake_Source` (the call pattern `narration_take_review.lua` already uses) moves later reads onto the first item as takes inside one block; the first read stays active.

| Result | What it changes in the PRD |
| --- | --- |
| Yes | `stack_takes` (SND-7) is one block and one undo step natively, as the mock shows (DQ-7). |
| No | SND-7 lists steps like Audacity does, or stacking is dropped from REAPER. |
| Partly | Stacking works but alignment or length differs (a stacked take shorter than the first item, offset errors): record it; SND-7 refuses reads that do not fit the first item's length. |

Save as `$root\lua\spike_1d_stack.lua`:

```lua
local c = dofile(os.getenv('NARRATION_UTILS_SPIKE_OUT') .. '/common.lua')
c.run('1d', false, function()
  local track = c.track('Spike reads')
  local first_item, first_take = c.item(track, 'take_a.wav', 0, 3)
  local later = {
    { c.item(track, 'take_b.wav', 4, 3) },
    { c.item(track, 'take_c.wav', 8, 3) },
  }
  c.baseline()
  c.describe('before', track)

  reaper.Undo_BeginBlock2(0)
  for _, pair in ipairs(later) do
    local item, take = pair[1], pair[2]
    local source = reaper.GetMediaItemTake_Source(take)
    local file = reaper.GetMediaSourceFileName(source, '')
    local new_take = reaper.AddTakeToMediaItem(first_item)
    reaper.SetMediaItemTake_Source(new_take, reaper.PCM_Source_CreateFromFile(file))
    reaper.SetMediaItemTakeInfo_Value(new_take, 'D_STARTOFFS', 0)
    reaper.DeleteTrackMediaItem(track, item)
  end
  reaper.SetActiveTake(first_take)
  reaper.Undo_EndBlock2(0, 'Narration Utils: spike stack', -1)

  c.describe('after', track)
  c.log('first_item_length', reaper.GetMediaItemInfo_Value(first_item, 'D_LENGTH'))
  c.log('first_take_still_active', reaper.GetActiveTake(first_item) == first_take)
  c.undo_walk()
  c.describe('after_undo', track)
end)
```

```powershell
Invoke-Spike -Id 1d -Script spike_1d_stack.lua
```

Expected: after: 1 item with 3 takes, active take 1, length 3; `UNDO_POINTS 1`; after_undo: 3 items with 1 take each at 0, 4 and 8.

## 1e Undo reach (SND-S5)

**Question (PRD, verbatim):** Can the app trigger the DAW's undo only for its own last block safely?

**Needs:** REAPER 7.80 on a copy. The `1e-live` part needs you at the keyboard for 40 seconds.

**Expected (hypothesis):** `Undo_CanUndo2(0)` returns the label of the top undo point, so a host can press Undo only when the label is its own, and refuse when a narrator edit sits on top.

| Result | What it changes in the PRD |
| --- | --- |
| Yes | App undo can drive REAPER's own history for the app's last block only (a label check, then one Undo); the toast "Use Edit > Undo in REAPER" stays for anything older. |
| No | App undo stays the toast for every entry, as the PRD's process defaults say. |
| Partly | Safe only in some cases (for example the label check works for API edits but a hand edit leaves a stale label): record which, and the host refuses unless the cases it can detect are met. |

### 1e-script: scripted

Save as `$root\lua\spike_1e_undo.lua`:

```lua
local c = dofile(os.getenv('NARRATION_UTILS_SPIKE_OUT') .. '/common.lua')
c.run('1e', false, function()
  local track = c.track('Spike undo')
  local item = c.item(track, 'take_a.wav', 0, 3)
  c.baseline()
  local function pos() return reaper.GetMediaItemInfo_Value(item, 'D_POSITION') end

  -- A: our block is on top, so the label check passes and one Undo reverts exactly that block.
  reaper.Undo_BeginBlock2(0)
  reaper.SetMediaItemInfo_Value(item, 'D_POSITION', 1)
  reaper.Undo_EndBlock2(0, 'Narration Utils: spike block', -1)
  c.log('A top_label', reaper.Undo_CanUndo2(0), 'pos', pos())
  if reaper.Undo_CanUndo2(0) == 'Narration Utils: spike block' then reaper.Undo_DoUndo2(0) end
  c.log('A after undo pos', pos(), 'top_label', reaper.Undo_CanUndo2(0), 'redo_label', reaper.Undo_CanRedo2(0))

  -- B: a user edit lands on top of our block: the label check must refuse.
  reaper.Undo_BeginBlock2(0)
  reaper.SetMediaItemInfo_Value(item, 'D_POSITION', 1)
  reaper.Undo_EndBlock2(0, 'Narration Utils: spike block', -1)
  reaper.SetMediaItemInfo_Value(item, 'D_POSITION', 2)
  reaper.Undo_OnStateChange2(0, 'User: move item')
  local top = reaper.Undo_CanUndo2(0)
  c.log('B top_label', top, 'would_undo', top == 'Narration Utils: spike block')

  -- C: Edit > Undo (action 40029) is the same as the API call.
  reaper.Main_OnCommand(40029, 0)
  c.log('C after action 40029 pos', pos(), 'top_label', reaper.Undo_CanUndo2(0))
  c.undo_walk()
  c.log('final pos', pos())
end)
```

```powershell
Invoke-Spike -Id 1e -Script spike_1e_undo.lua
```

Expected: A: top label `Narration Utils: spike block`, position 1 then back to 0, redo label equals the block's; B: top label `User: move item`, `would_undo=false`; C: position 1 (the user edit undone, ours still applied), top label `Narration Utils: spike block`.

### 1e-live: a hand edit

API edits and hand edits may label differently. This run logs the top undo label every half second for 40 seconds while REAPER's window is open; during that time **move the item with the mouse once, then press Ctrl+Z once**. The window is REAPER's isolated one; close nothing yourself.

Save as `$root\lua\spike_1e_live.lua`:

```lua
local c = dofile(os.getenv('NARRATION_UTILS_SPIKE_OUT') .. '/common.lua')
c.run('1e-live', false, function()
  local track = c.track('Spike undo')
  c.item(track, 'take_a.wav', 0, 3)
  c.baseline()
  reaper.UpdateArrange()
  local started, last = reaper.time_precise(), nil
  local function poll()
    local label = reaper.Undo_CanUndo2(0)
    if label ~= last then
      c.log(string.format('t=%.1f', reaper.time_precise() - started), 'top_label', tostring(label), 'redo_label', tostring(reaper.Undo_CanRedo2(0)))
      last = label
      c.flush('1e-live')
    end
    if reaper.time_precise() - started < 40 then reaper.defer(poll) end
  end
  poll()
end)
```

Run it with a longer timeout, then do the mouse move and Ctrl+Z inside the 40 seconds:

```powershell
Invoke-Spike -Id 1e-live -Script spike_1e_live.lua -TimeoutSec 80
```

Expected: a label line for the mouse move (REAPER's own wording, for example a move label), then a line after Ctrl+Z. Write the exact labels in the notes: a host can only match labels it knows how to spell.

## 1f Play position (SND-S6)

**Question (PRD, verbatim):** Is `GetPlayPosition` or `GetPlayPosition2` accurate over the file bridge for the Booth's resume anchor (REAPER spike S4)?

**Needs the audio interface** (this plays audio). Pending on #510, read as #992.

**Expected (hypothesis):** `GetPlayPosition` tracks what is heard (output latency included) and `GetPlayPosition2` tracks what is being processed, so they differ by about the output latency, and polling at the bridge's 50-100 ms round trip (`narration_punch.lua`) stays within one poll interval of the truth.

| Result | What it changes in the PRD |
| --- | --- |
| Yes | The Booth anchors words with the position that stayed within one poll interval of the wall clock, at the bounded poll rate; ADR 0246's polled anchor stands. |
| No | Neither position is steady over the polled bridge: the Booth's resume anchor falls back to the cursor, and ADR 0246's polled anchor is reopened. |
| Partly | One of the two is usable: name which, and the Booth uses it with the stated error bound; or the error is bounded only above some buffer size, which goes in the notes. |

Use the kept `cfg-device` folder from 1a-real (set the interface there once). Save as `$root\lua\spike_1f_playpos.lua`:

```lua
local c = dofile(os.getenv('NARRATION_UTILS_SPIKE_OUT') .. '/common.lua')
c.run('1f', true, function()
  assert(reaper.APIExists('GetPlayPosition2'), 'this REAPER cannot report GetPlayPosition2')
  local track = c.track('Spike play')
  c.item(track, 'take_a.wav', 0, 3)
  c.item(track, 'take_b.wav', 3, 3)
  c.item(track, 'take_c.wav', 6, 3)
  c.log('inputs', reaper.GetNumAudioInputs(), 'outputs', reaper.GetNumAudioOutputs())
  c.log('latency_in_out', reaper.GetInputOutputLatency())
  reaper.SetEditCurPos(0, true, false)
  local csv = { 'wall_s,play_pos,play_pos2,state' }
  local started = reaper.time_precise()
  reaper.OnPlayButton()
  local function poll()
    local now = reaper.time_precise() - started
    csv[#csv + 1] = string.format('%.3f,%.6f,%.6f,%d', now, reaper.GetPlayPosition(), reaper.GetPlayPosition2(), reaper.GetPlayState())
    if now < 8 then
      -- the host polls over the file bridge at about 100 ms: sample at that rate
      local next_at = reaper.time_precise() + 0.1
      local function wait() if reaper.time_precise() < next_at then reaper.defer(wait) else poll() end end
      wait()
    else
      reaper.OnStopButton()
      local f = io.open(c.out() .. '/spike-1f-samples.csv', 'w')
      f:write(table.concat(csv, '\n'), '\n')
      f:close()
      local worst, sum, n = 0, 0, 0
      for i = 2, #csv do
        local _, p1, p2 = csv[i]:match('^([%d.]+),([%d.-]+),([%d.-]+)')
        p1, p2 = tonumber(p1), tonumber(p2)
        worst = math.max(worst, math.abs(p2 - p1))
        sum, n = sum + (p1 - p2), n + 1
      end
      c.log('samples', n, 'max_abs_pos2_minus_pos', worst, 'mean_pos_minus_pos2', sum / math.max(1, n))
      c.flush('1f')
    end
  end
  poll()
end)
```

```powershell
Invoke-Spike -Id 1f -Script spike_1f_playpos.lua -CfgName cfg-device -TimeoutSec 60
```

Playback is audible for 8 seconds (three tones). Expected: the CSV shows both positions rising by about 1 s per wall second; note whether `play_pos` leads or trails `play_pos2` and by how much, and write the buffer size and sample rate you use in the notes. `max_abs_pos2_minus_pos` in the report is the gap between the two readings, not the error against the speakers. The CSV's `wall_s` column is the reference for drift: a position that rises by 1 s per wall second is steady. For the audible check, listen for the tone change at 3 s and 6 s and note how late the CSV's `play_pos` crosses 3.000 and 6.000 against your ear.

**If it cannot run:** send the table row with notes "no interface" and `spike-1f-report.txt` if one was written.

## 1g Audacity backups (SND-S7)

**Question (PRD, verbatim):** Can the scripting pipe clone a time range to a backups track and restore it, and what does two minutes cost?

**Needs:** Audacity 3 with `mod-script-pipe` enabled (Edit > Preferences > Modules > mod-script-pipe > Enabled, then restart Audacity). Audacity 4.0 has no scripting pipe ([ADR 0355](../adr/0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md)); there the spike reports "not reachable", which is the answer for 4.0 and goes in the table. Write the version from Help > About Audacity in the table.

**Expected (hypothesis):** copy a time range from the audio track, paste it on a second "Backups" track, damage the original, copy back, and the restored audio hashes equal to the original. The command names below come from the Audacity manual and are not verified here; a `Failed!` reply is a result, so keep the report.

| Result | What it changes in the PRD |
| --- | --- |
| Yes | SND-8 builds backups on the pipe; the timing (seconds for the clone and the restore) sets the default window. |
| No | Backups are not offered for Audacity; stacking and roll stay refused there (the mock's "refused without backups"). |
| Partly | Clone works but restore does not match, or the cost is high (state seconds for the 240 s range): SND-8 lowers the default window or restores by a different command; record which. |

Open Audacity with a new empty project (File > New) and no other project window. Save as `$root\audacity_backups.py`:

```python
"""Spike 1g: clone a range to a Backups track over mod-script-pipe, damage the original, restore, compare. Usage: python audacity_backups.py <out folder>"""
import hashlib, json, math, struct, sys, time, wave
from pathlib import Path

TO, FROM = r'\\.\pipe\ToSrvPipe', r'\\.\pipe\FromSrvPipe'
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
tone = out / 'tone-300s.wav'
RATE, SECONDS = 8000, 300
with wave.open(str(tone), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
    w.writeframes(b''.join(struct.pack('<h', int(9000 * math.sin(2 * math.pi * 220 * i / RATE))) for i in range(RATE * SECONDS)))

report = {'steps': [], 'result': None}
def note(**kw): report['steps'].append(kw)
def save():
    (out / 'spike-1g-report.json').write_text(json.dumps(report, indent=2))

try:
    to = open(TO, 'w'); frm = open(FROM, 'r')   # ToSrvPipe first, then FromSrvPipe
except OSError as e:
    report['result'] = f'not reachable: {e}'; save(); print(report['result']); sys.exit(1)

def send(cmd):
    t0 = time.perf_counter()
    to.write(cmd + '\r\n\0'); to.flush()
    body = []
    while True:
        line = frm.readline()
        if line == '': raise RuntimeError('pipe closed during: ' + cmd)
        line = line.rstrip('\r\n')
        if line.startswith('BatchCommand finished:'):
            frm.readline()                      # the empty line after the terminator
            ok = line.endswith('OK')
            seconds = time.perf_counter() - t0
            note(cmd=cmd, ok=ok, seconds=round(seconds, 3), reply=' '.join(body)[:300])
            return ok, '\n'.join(body), seconds
        body.append(line)

def pcm_hash(path):
    with wave.open(str(path), 'rb') as w:
        return hashlib.sha256(w.readframes(w.getnframes())).hexdigest()

def export_mix(name):
    path = (out / name).as_posix()
    ok, _, _ = send(f'Export2: Filename="{path}" NumChannels=1')
    return out / name if ok else None

try:
    send('GetInfo: Type=Tracks Format=JSON')
    send(f'Import2: Filename="{tone.as_posix()}"')
    before = export_mix('mix-before.wav')

    # Clone 30 s to 270 s (two minutes either side of 150 s) to a Backups track.
    ok, _, clone_s = send('Select: Start=30 End=270 RelativeTo=ProjectStart Track=0 TrackCount=1 Mode=Set')
    send('Copy:')
    send('NewMonoTrack:')
    send('SetTrack: Track=1 Name=Backups')
    send('Select: Start=30 End=30 RelativeTo=ProjectStart Track=1 TrackCount=1 Mode=Set')
    ok_paste, _, paste_s = send('Paste:')
    send('SetTrackAudio: Track=1 Mute=1')       # keep the backup out of the mix
    send('GetInfo: Type=Tracks Format=JSON')

    # Damage 100 s to 140 s of the original, then restore the whole cloned range.
    send('Select: Start=100 End=140 RelativeTo=ProjectStart Track=0 TrackCount=1 Mode=Set')
    send('SilenceAudio:')
    damaged = export_mix('mix-damaged.wav')
    send('Select: Start=30 End=270 RelativeTo=ProjectStart Track=1 TrackCount=1 Mode=Set')
    send('Copy:')
    send('Select: Start=30 End=270 RelativeTo=ProjectStart Track=0 TrackCount=1 Mode=Set')
    ok_restore, _, restore_s = send('Paste:')
    restored = export_mix('mix-restored.wav')

    h = {k: (pcm_hash(v) if v else None) for k, v in (('before', before), ('damaged', damaged), ('restored', restored))}
    report['hashes'] = h
    report['seconds'] = {'clone_select_to_paste': round(clone_s + paste_s, 3), 'restore_paste': round(restore_s, 3)}
    report['damage_detected'] = bool(h['before'] and h['damaged'] and h['before'] != h['damaged'])
    report['restore_equals_original'] = bool(h['before'] and h['before'] == h['restored'])
    report['result'] = 'finished'
except Exception as e:
    report['result'] = f'error: {e}'
save()
print(json.dumps({k: report.get(k) for k in ('result', 'hashes', 'seconds', 'damage_detected', 'restore_equals_original')}, indent=2))
```

```powershell
$g = "$root\1g"
python "$root\audacity_backups.py" $g
```

The script leaves the Audacity project unsaved; close it with "No" to saving. If the Audacity mix export shows the wrong gain or the pasted clip is not on track 1, record the step replies from `spike-1g-report.json`: they list every command, whether it was `OK` or `Failed!` and the seconds it took.

Expected: `damage_detected=true`, `restore_equals_original=true`, and seconds for the 240 s clone and restore (the cost of "two minutes either side"). A `Failed!` on a command name is a "partly" or "no" with that name in the notes.

**If it cannot run:** send the table row with the Audacity version and "no pipe" (4.0) or "pipe module off" and the first reply from `spike-1g-report.json`.

## Step 9: prove the original did not change

```powershell
$after = (Get-FileHash -Algorithm SHA256 $orig).Hash
"AFTER  $after  $orig" | Tee-Object -Append "$root\sha256.txt"
if ($before -ne $after) { Write-Error "STOP: $orig changed. Do not run another spike. Send sha256.txt on #992 with the last report."; }
```

If the hashes differ, stop and report; do not run more spikes. Run this after each spike if you run them across several sittings (`$before` comes from step 0 of that sitting).

## Results table

Fill the empty cells only. "Undo points" is the number and the names from the report's `UNDO_POINTS` line (for 1a-real and 1e, the lines the report shows).

| Spike | Question | REAPER or Audacity version | Date | Result (yes / no / partly) | Undo points observed (number and names) | Output file | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1a roll (SND-S1), fake | Can a roll while recording be one command that keeps the earlier audio as a take in REAPER, and what undo points result? |  |  |  |  | `1a-fake\out\spike-1a-fake-report.txt` |  |
| 1a roll (SND-S1), real record | Same |  |  |  |  | `1a-real\out\spike-1a-real-report.txt` | recording mode, input, buffer size |
| 1b cut (SND-S2) | Is "split at both ends, move middle to a muted Cuts track" one undo block, and does closing up later audio stay correct for other items? |  |  |  |  | `1b\out\spike-1b-report.txt` |  |
| 1c chain on range (SND-S3) | Does `TakeFX_AddByName` load a saved `.RfxChain` onto a split piece, and how is it undone? |  |  |  |  | `1c\out\spike-1c-report.txt` |  |
| 1d stack (SND-S4) | Can later reads become takes of the first item in one undo block? |  |  |  |  | `1d\out\spike-1d-report.txt` |  |
| 1e undo reach (SND-S5) | Can the app trigger the DAW's undo only for its own last block safely? |  |  |  |  | `1e\out\spike-1e-report.txt`, `1e-live\out\spike-1e-live-report.txt` | exact hand-edit labels |
| 1f play position (SND-S6) | Is `GetPlayPosition` or `GetPlayPosition2` accurate over the file bridge for the Booth's resume anchor (REAPER spike S4)? |  |  |  | not applicable | `1f\out\spike-1f-report.txt`, `1f\out\spike-1f-samples.csv` | buffer size, sample rate, audible offset |
| 1g Audacity backups (SND-S7) | Can the scripting pipe clone a time range to a backups track and restore it, and what does two minutes cost? |  |  |  | not applicable | `1g\spike-1g-report.json` | clone and restore seconds |
