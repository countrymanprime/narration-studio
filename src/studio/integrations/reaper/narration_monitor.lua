-- Input monitoring for the Booth's lane (REAPER's I_RECMON), loaded by narration_ui_bridge.lua, which passes the shared helpers as the chunk
-- argument. The Booth records the narrator's voice, who needs to hear it, so arm_lane (narration_transport.lua) with its `monitor` argument
-- turns monitoring on for the lane it arms when the track has it off, through monitor_lane below. Nothing here asks REAPER anything else.
--
-- I_RECMON reads 0 (off), 1 (on) or 2 (on, but silent while recording: REAPER's "auto" tape mode). Only 0 is changed: a track the narrator
-- already monitors, in either way, is left exactly as it is, and is not ours to put back. Setting it adds no undo point, does not mark
-- the project unsaved and does not move the project's change count (REAPER 7.82 on Linux, docs/research/2026-11-16-booth-arms-and-monitors.md).
--
-- What was turned on is remembered (a row per track: its GUID, the value it had and the project file it was written in), and monitor_restore puts
-- it back where the value is still the one this file set: a track the narrator switched off or to auto meanwhile is theirs and is kept. The lane the
-- Booth moved to makes the earlier lane's row go back at once, so one voice at a time is monitored.
--
-- The rows are also written to a file in REAPER's resource folder, so a REAPER closed while a lane was monitored is put right the first time this
-- bridge can: its first tick, or its first arm_lane with monitor or monitor_restore if one comes before it, as narration_transport.lua does for a
-- play, and never while REAPER records. A row is applied only while the project file it was written in is in front; a row of another project stays
-- on the ledger until then, and a row of the project in front whose track is gone is dropped. Only a row of value 0 is accepted from the file, so a
-- damaged file cannot write another value into a track. A real REAPER crash with a lane monitored is pending (the harness reads a leftover file,
-- not a killed process); see docs/architecture/reaper-bridge.md.
--
-- monitor_restore answers MONITOR_RESTORED|run|restored|kept|waiting. While REAPER records, or a record_start is waiting for REAPER to report
-- recording, it touches nothing and answers waiting 1: the rows are put back on the first tick after the recording has stopped, so leaving the
-- Booth during a take neither cuts the narrator's monitoring nor leaves it on for good. What a waited restore did is never reported: no event
-- follows the stop. A second argument `cancel` only drops a restore that is waiting (the Booth was entered again during the take); any other second
-- argument is an ERROR and changes nothing.

local core = ...
local event = core.event

local LEDGER_FILE = 'narration_monitor_ledger.txt'
local ON = 1

local function normalize_guid(guid)
  local bare = tostring(guid or ''):gsub('[{}%s]', ''):upper()
  if bare == '' then
    return ''
  end
  return '{' .. bare .. '}'
end
local function find_track(guid_text)
  local wanted = normalize_guid(guid_text)
  for index = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, index)
    if normalize_guid(reaper.GetTrackGUID(track)) == wanted then
      return track
    end
  end
  return nil
end
local function recording()
  return math.floor(reaper.GetPlayState() / 4) % 2 == 1
end
-- The file of the project in front (the active tab), '' for one never saved: a row belongs to the project it was written in.
local function project_path()
  local _, path = reaper.EnumProjects(-1, '')
  return path or ''
end
local function ledger_path()
  return core.join(reaper.GetResourcePath(), LEDGER_FILE)
end

-- Writes the rows (or removes the file when there are none). Answers false when the file could not be written.
local function save(rows)
  if #rows == 0 then
    os.remove(ledger_path())
    return true
  end
  local out = io.open(ledger_path(), 'w')
  if not out then
    return false
  end
  local written = true
  for _, row in ipairs(rows) do
    written = out:write(row.guid, '\t', row.was, '\t', row.project, '\n') and written
  end
  return out:close() and written and true or false
end

-- Puts back the rows of the project in front whose track still holds the value this file set. Answers how many were put back, how many were kept,
-- and the rows of another project, which stay on the ledger until that project is in front. A row of this project whose track is gone is dropped.
local function put_back(rows)
  local restored, kept, left = 0, 0, {}
  local here = project_path()
  for _, row in ipairs(rows) do
    if row.project ~= here then
      left[#left + 1] = row
    else
      local track = find_track(row.guid)
      if track and reaper.GetMediaTrackInfo_Value(track, 'I_RECMON') == ON then
        reaper.SetMediaTrackInfo_Value(track, 'I_RECMON', row.was)
        restored = restored + 1
      elseif track then
        kept = kept + 1
      end
    end
  end
  return restored, kept, left
end

return function(registry)
  local state = { rows = {} }

  -- REAPER records, or a record_start has pressed record and waits for REAPER to say so: the take is not to be touched.
  local function busy()
    if recording() then
      return true
    end
    local take = registry.transport_recording and registry.transport_recording()
    return take ~= nil and not take.started
  end

  -- Once per bridge start: puts back the rows a closed or crashed REAPER left in the file. Every path that writes the file runs it first, since a
  -- write would replace the file; this bridge has written nothing yet when it runs, so every row in the file is a leftover. Rows of another project
  -- are kept.
  local function recover()
    if state.recovered then
      return
    end
    state.recovered = true
    local input = io.open(ledger_path(), 'r')
    if not input then
      return
    end
    local rows = {}
    -- A file that cannot be read (a folder of that name) has no rows.
    pcall(function()
      for line in input:lines() do
        -- Only a 0 is something this file turns on from, so no other value is ever written back.
        local guid, project = line:match('^([^\t]+)\t0\t([^\t]*)$')
        if guid then
          rows[#rows + 1] = { guid = normalize_guid(guid), was = 0, project = project }
        end
      end
    end)
    input:close()
    -- A row whose track is not in the open project stays on the ledger, and is put back by the next restore.
    local _, _, left = put_back(rows)
    for _, row in ipairs(left) do
      state.rows[#state.rows + 1] = row
    end
    if #rows > 0 then
      save(state.rows)
    end
  end

  -- Turns monitoring on for `track` when it is off, after putting back the other lanes this file monitored. Answers 1 when it turned it on. The ledger
  -- is written first: nothing is switched when it cannot be (a REAPER that crashed with a lane on and no row would leave it on for good), except that a
  -- lane already on the ledger is turned on again.
  registry.monitor_lane = function(track)
    -- The Booth is entered again: a restore that waited for a recording to stop is not to take this lane's monitoring back.
    state.waiting = false
    recover()
    local guid = normalize_guid(reaper.GetTrackGUID(track))
    local here = project_path()
    local mine, others, away = nil, {}, {}
    for _, row in ipairs(state.rows) do
      if row.project ~= here then
        away[#away + 1] = row
      elseif row.guid == guid then
        mine = row
      else
        others[#others + 1] = row
      end
    end
    local needs = reaper.GetMediaTrackInfo_Value(track, 'I_RECMON') == 0
    local after = away
    if mine then
      after[#after + 1] = mine
    elseif needs then
      after[#after + 1] = { guid = guid, was = 0, project = here }
    end
    local written = save(after)
    if needs and not mine and not written then
      return 0
    end
    put_back(others)
    state.rows = after
    if needs then
      reaper.SetMediaTrackInfo_Value(track, 'I_RECMON', ON)
      return 1
    end
    return 0
  end

  -- Puts back what this file turned on, after reading a leftover the file may hold.
  local function release()
    recover()
    local restored, kept, left = put_back(state.rows)
    state.rows = left
    save(state.rows)
    return restored, kept
  end

  registry.register('monitor_restore', function(ctx, args)
    local run = args[1] or ''
    local mode = args[2] or ''
    if mode ~= '' and mode ~= 'cancel' then
      event(ctx.session_dir, 'ERROR', run, 'Unsupported monitor_restore argument.')
      return
    end
    if mode == 'cancel' then
      -- The Booth was entered again while a restore waited for a take: it is not to take the lane back when the take stops. Touches nothing else.
      state.waiting = false
      event(ctx.session_dir, 'MONITOR_RESTORED', run, 0, 0, 0)
      return
    end
    if busy() then
      state.waiting = #state.rows > 0
      event(ctx.session_dir, 'MONITOR_RESTORED', run, 0, 0, state.waiting and 1 or 0)
      return
    end
    state.waiting = false
    local restored, kept = release()
    event(ctx.session_dir, 'MONITOR_RESTORED', run, restored, kept, 0)
  end)

  -- Called by the tick loop once a tick: recovers the file, then finishes a restore that waited for a recording to stop.
  registry.monitor_tick = function()
    if busy() then
      return
    end
    recover()
    if state.waiting then
      state.waiting = false
      release()
    end
  end
end
