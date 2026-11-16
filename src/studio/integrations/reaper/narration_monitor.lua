-- Input monitoring for the Booth's lane (REAPER's I_RECMON), loaded by narration_ui_bridge.lua, which passes the shared helpers as the chunk
-- argument. The Booth records the narrator's voice, who needs to hear it, so arm_lane (narration_transport.lua) with its `monitor` argument
-- turns monitoring on for the lane it arms when the track has it off, through monitor_lane below. It reads the track list, the play state and the
-- open project, and writes only I_RECMON and its ledger file.
--
-- I_RECMON reads 0 (off), 1 (on) or 2 (on, but silent while recording: REAPER's "auto" tape mode). Only 0 is changed: a track the narrator
-- already monitors, in either way, is left exactly as it is, and is not ours to put back. Setting it adds no undo point, does not mark
-- the project unsaved and does not move the project's change count (REAPER 7.82 on Linux, docs/research/2026-11-16-booth-arms-and-monitors.md).
--
-- What was turned on is remembered (a row per track: its GUID and the value it had, always 0), and monitor_restore puts it back where the value
-- is still the one this file set (1): a track the narrator switched off or to auto meanwhile is theirs and is kept. The lane the Booth moved to
-- makes the earlier lane's row go back at once, so one voice at a time is monitored. A row is keyed by the track's GUID alone, which Save as
-- keeps and a new project never reuses; the one risk is a copy of a project with the same GUIDs open in another tab.
--
-- A row whose track is not in the project in front (another tab is in front, or the project is not open yet) becomes a ghost: it stays on the
-- ledger and is tried again whenever the project in front or its track count changes, on the bridge's tick, and is dropped once its track
-- resolves, whatever the track reads. At most MAX_ROWS rows are kept, the oldest dropped first, so a row for a deleted track cannot live forever.
--
-- The rows are also written to a file in REAPER's resource folder, so a REAPER closed while a lane was monitored is put right the first time this
-- bridge can: its first tick, or its first arm_lane with monitor or monitor_restore if one comes before it, as narration_transport.lua does for a
-- play, and never while REAPER records. Only a row of value 0 is accepted from the file, so a damaged file cannot write another value into a
-- track. A real REAPER crash with a lane monitored is pending (the harness reads a leftover file, not a killed process); see
-- docs/architecture/reaper-bridge.md.
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
local MAX_ROWS = 64
local MAX_RETRY_WAIT = 256

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
    written = out:write(row.guid, '\t', row.was, '\n') and written
  end
  return out:close() and written and true or false
end

-- Puts back the rows whose track is in the project in front and still holds the value this file set. Answers how many were put back, how many were
-- kept (the track reads something else now), and the rows whose track is not there. A row whose track resolves is done either way.
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
  -- rows are the lanes this bridge monitored, ghosts the rows whose track was not in the project in front when they were tried.
  local state = { rows = {}, ghosts = {} }

  -- REAPER records, or a record_start has pressed record and waits for REAPER to say so: the take is not to be touched.
  local function busy()
    if recording() then
      return true
    end
    local take = registry.transport_recording and registry.transport_recording()
    return take ~= nil and not take.started
  end

  -- Adds rows to the ghosts, the oldest dropped past MAX_ROWS (together with the lanes this bridge holds).
  local function add_ghosts(rows)
    for _, row in ipairs(rows) do
      state.ghosts[#state.ghosts + 1] = row
    end
    while #state.ghosts > 0 and #state.rows + #state.ghosts > MAX_ROWS do
      table.remove(state.ghosts, 1)
    end
  end

  -- A write that failed is tried again on the ticks that follow, spaced out by a count of ticks that doubles up to MAX_RETRY_WAIT (256), so a ledger
  -- that stays unwritable (a full disk, a folder of that name) is not opened thirty times a second. A command that changes the rows tries at once; a
  -- write inside a tick (the recovery, a waited restore, a ghost retry) counts as a tick's, so it does not reset the spacing.
  local function persist(from_tick)
    local all = {}
    for _, row in ipairs(state.ghosts) do
      all[#all + 1] = row
    end
    for _, row in ipairs(state.rows) do
      all[#all + 1] = row
    end
    state.unsaved = not save(all)
    if not state.unsaved then
      state.misses, state.wait = nil, nil
    elseif from_tick or state.in_tick then
      -- The first miss on a tick is tried again on the next tick, then 1, 2, 4 ... ticks are skipped between tries (gaps of 2, 3, 5, 9 ... ticks).
      state.misses = (state.misses or 0) + 1
      state.wait = state.misses <= 1 and 0 or math.min(2 ^ (state.misses - 2), MAX_RETRY_WAIT)
    else
      state.misses, state.wait = 0, 0
    end
    return not state.unsaved
  end

  -- Once per bridge start: puts back the rows a closed or crashed REAPER left in the file. Every path that writes the file runs it first, since a
  -- write would replace the file; this bridge has written nothing yet when it runs, so every row in the file is a leftover.
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
    -- A file that cannot be read (a folder of that name) has no rows, and only its first 64 KB is read.
    pcall(function()
      for line in (input:read(65536) or ''):gmatch('[^\n]+') do
        -- Only a 0 is something this file turns on from, so no other value is ever written back.
        local guid = line:match('^([^\t]+)\t0$')
        if guid then
          rows[#rows + 1] = { guid = guid, was = 0 }
        end
      end
    end)
    input:close()
    if #rows > 0 then
      local _, _, left = put_back(rows)
      add_ghosts(left)
      persist()
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
    local mine, others = nil, {}
    -- The same lane can be a ghost (its track was not in front when it was tried): it is the live row again, not a second one the tick would put back.
    -- Every ghost of the lane goes, not the first: a ledger with two rows for one GUID must not leave a second one to switch the lane off.
    local kept_ghosts = {}
    for _, row in ipairs(state.ghosts) do
      if row.guid == guid then
        mine = row
      else
        kept_ghosts[#kept_ghosts + 1] = row
      end
    end
    state.ghosts = kept_ghosts
    for _, row in ipairs(state.rows) do
      if row.guid == guid then
        mine = row
      else
        others[#others + 1] = row
      end
    end
    local needs = reaper.GetMediaTrackInfo_Value(track, 'I_RECMON') == 0
    local before = state.rows
    state.rows = { mine or (needs and { guid = guid, was = 0 }) or nil }
    local written = persist()
    if needs and not mine and not written then
      state.rows = before
      return 0
    end
    local _, _, left = put_back(others)
    if #left > 0 then
      add_ghosts(left)
      persist()
    end
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
    state.rows = {}
    add_ghosts(left)
    persist()
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

  -- Called by the tick loop once a tick: recovers the file, rewrites a ledger that could not be written, finishes a restore that waited for a
  -- recording to stop, and tries the ghosts again when the project in front or its track count has changed since they were last tried.
  registry.monitor_tick = function()
    if busy() then
      return
    end
    state.in_tick = true
    recover()
    -- A ledger that could not be written after lanes were put back would still list them: it is written again.
    if state.unsaved then
      if (state.wait or 0) <= 0 then
        persist(true)
      else
        state.wait = state.wait - 1
      end
    end
    if state.waiting then
      state.waiting = false
      release()
    end
    if #state.ghosts > 0 then
      -- The project pointer tells apart two tabs that were never saved and hold as many tracks. That tostring(ReaProject) is the same on every call
      -- is not verified in a real REAPER (reaper-verification-pass.md); if it is not, the ghosts are tried on every tick, never a wrong track.
      local front, path = reaper.EnumProjects(-1, '')
      local place = tostring(front) .. '|' .. (path or '') .. '|' .. reaper.CountTracks(0)
      if place ~= state.tried then
        state.tried = place
        local _, _, left = put_back(state.ghosts)
        if #left ~= #state.ghosts then
          state.ghosts = {}
          add_ghosts(left)
          persist()
        end
      end
    end
    state.in_tick = false
  end
end
