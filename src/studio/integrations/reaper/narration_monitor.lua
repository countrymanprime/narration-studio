-- Input monitoring for the Booth's lane (REAPER's I_RECMON), loaded by narration_ui_bridge.lua, which passes the shared helpers as the chunk
-- argument. The Booth records the narrator's voice, who needs to hear it, so arm_lane (narration_transport.lua) with its `monitor` argument
-- turns monitoring on for the lane it arms when the track has it off, through monitor_lane below. Nothing here asks REAPER anything else.
--
-- I_RECMON reads 0 (off), 1 (on) or 2 (on, but silent while recording: REAPER's "auto" tape mode). Only 0 is changed: a track the narrator
-- already monitors, in either way, is left exactly as it is, and is not ours to put back. Setting it adds no undo point, does not mark
-- the project unsaved and does not move the project's change count (REAPER 7.82 on Linux, docs/research/2026-11-16-booth-arms-and-monitors.md).
--
-- What was turned on is remembered (a row per track: its GUID and the value it had), and monitor_restore puts it back where the value is still
-- the one this file set: a track the narrator switched off or to auto meanwhile is theirs and is kept. The lane the Booth moved to makes the
-- earlier lane's row go back at once, so one voice at a time is monitored. The rows are also written to a file in REAPER's resource folder,
-- so a REAPER closed or crashed while a lane was monitored is put right by the next bridge tick, as narration_transport.lua does for a play.
--
-- monitor_restore answers MONITOR_RESTORED|run|restored|kept|waiting. While REAPER records it touches nothing and answers waiting 1: the
-- rows are put back on the first tick after the recording has stopped, so leaving the Booth during a take neither cuts the narrator's
-- monitoring nor leaves it on for good.

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
local function ledger_path()
  return core.join(reaper.GetResourcePath(), LEDGER_FILE)
end

local function save(rows)
  if #rows == 0 then
    os.remove(ledger_path())
    return
  end
  local out = io.open(ledger_path(), 'w')
  if not out then
    return
  end
  for _, row in ipairs(rows) do
    out:write(row.guid, '\t', row.was, '\n')
  end
  out:close()
end

-- Puts back the rows whose track still holds the value this file set. Answers how many were put back, how many were kept, and the rows whose
-- track REAPER cannot find (another project tab is in front), which stay on the ledger.
local function put_back(rows)
  local restored, kept, left = 0, 0, {}
  for _, row in ipairs(rows) do
    local track = find_track(row.guid)
    if not track then
      left[#left + 1] = row
    elseif reaper.GetMediaTrackInfo_Value(track, 'I_RECMON') == ON then
      reaper.SetMediaTrackInfo_Value(track, 'I_RECMON', row.was)
      restored = restored + 1
    else
      kept = kept + 1
    end
  end
  return restored, kept, left
end

return function(registry)
  local state = { rows = {} }

  -- Turns monitoring on for `track` when it is off, after putting back the other lanes this file monitored. Answers 1 when it turned it on.
  registry.monitor_lane = function(track)
    local guid = normalize_guid(reaper.GetTrackGUID(track))
    local others, mine = {}, nil
    for _, row in ipairs(state.rows) do
      if row.guid == guid then
        mine = row
      else
        others[#others + 1] = row
      end
    end
    local _, _, left = put_back(others)
    state.rows = left
    if mine then
      state.rows[#state.rows + 1] = mine
    end
    local turned = 0
    if reaper.GetMediaTrackInfo_Value(track, 'I_RECMON') == 0 then
      reaper.SetMediaTrackInfo_Value(track, 'I_RECMON', ON)
      if not mine then
        state.rows[#state.rows + 1] = { guid = guid, was = 0 }
      end
      turned = 1
    end
    save(state.rows)
    return turned
  end

  -- Puts back what this file turned on, or leaves it to the first tick without a recording.
  local function release()
    local restored, kept, left = put_back(state.rows)
    state.rows = left
    save(state.rows)
    return restored, kept
  end

  registry.register('monitor_restore', function(ctx, args)
    if recording() then
      state.waiting = #state.rows > 0
      event(ctx.session_dir, 'MONITOR_RESTORED', args[1] or '', 0, 0, state.waiting and 1 or 0)
      return
    end
    state.waiting = false
    local restored, kept = release()
    event(ctx.session_dir, 'MONITOR_RESTORED', args[1] or '', restored, kept, 0)
  end)

  -- Called by the tick loop once a tick: finishes a restore that waited for a recording to stop, and, once per bridge start, puts back the
  -- rows a closed or crashed REAPER left in the file.
  registry.monitor_tick = function()
    if state.waiting and not recording() then
      state.waiting = false
      release()
    end
    if state.recovered then
      return
    end
    state.recovered = true
    local input = io.open(ledger_path(), 'r')
    -- A lane this bridge monitored has written its own file: that is not a leftover.
    if not input or #state.rows > 0 then
      if input then
        input:close()
      end
      return
    end
    local rows = {}
    for line in input:lines() do
      local guid, was = line:match('^([^\t]+)\t(%d+)$')
      if guid then
        rows[#rows + 1] = { guid = guid, was = tonumber(was) }
      end
    end
    input:close()
    -- A row whose track is not in the open project stays on the ledger, and is put back by the next restore.
    local _, _, left = put_back(rows)
    state.rows = left
    save(left)
  end
end
