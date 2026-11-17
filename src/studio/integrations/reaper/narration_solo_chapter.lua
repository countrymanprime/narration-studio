-- Solo in place on the chapter the narrator records (REAPER's I_SOLO), loaded by narration_ui_bridge.lua, which passes the shared helpers as the
-- chunk argument. The Booth sends solo_chapter with the chapter's folder track while the narrator works on that chapter, and solo_restore when they
-- leave. A solo on a folder keeps its voices audible (docs/reference/daw/reaper.md, "Recording on folder children") and silences every other chapter,
-- with one write on one track: no track of the chapter and no other chapter is touched, so a mute the narrator set is never read or changed here.
-- Muting every other track instead measured 42.8 s at 2000 tracks (docs/research/2026-11-16-daw-follows-chapter-real-reaper.md); this is 19 ms.
-- It reads the track list, the play state and the open project, and writes only I_SOLO and its ledger file. An I_SOLO write adds no undo point, does
-- not mark the project unsaved and does not move the change count (same note).
--
-- Only a folder that is not soloed (I_SOLO 0) is changed, to 2 (solo in place, what narration_transport.lua's isolation uses). One the narrator
-- soloed already, in any way, is left exactly as it is and is not ours to put back.
--
-- What was soloed is remembered (a row: the track's GUID and the value it had, always 0), and solo_restore puts it back where the track still reads 2:
-- a solo the narrator changed meanwhile is theirs and is kept. Moving to another chapter puts the earlier chapter back first, so one chapter is soloed at
-- a time. A row is keyed by the track's GUID alone, never by the project's path. A row whose track is not in the project in front (another tab is in
-- front, or the project is not open yet) becomes a ghost: it stays on the ledger and is tried again whenever the project in front or its track count
-- changes, on the tick, and is dropped once its track resolves. At most MAX_ROWS rows are kept, the oldest dropped first.
--
-- The rows are also written to narration_solo_ledger.txt in REAPER's resource folder, so a REAPER closed or crashed while a chapter was soloed puts it
-- back the first time this bridge can: its first tick, or its first solo_chapter or solo_restore if one comes before it. Only a row of value 0 is
-- accepted from the file, so a damaged file cannot write another value into a track. The ledger is written before the solo is, and nothing is
-- soloed when it cannot be written. A real REAPER crash is pending (the harness reads a leftover file, not a killed process).
--
-- Layering with play_from (narration_transport.lua), which writes I_SOLO on every track for one play and puts back only what it set: this file never
-- reads or writes while that isolation is in place (it waits for the tick after the play), and its recovery runs the transport's first, so the two
-- never restore each other's state. While REAPER records, or a record_start waits for REAPER to report recording, it touches nothing either: a
-- request waits and is applied on the first tick after the take. Both wait answers say waiting 1.
--
-- solo_chapter answers CHAPTER_SOLOED|run|guid|changed|waiting, or TRACK_STALE|run|guid for a track that is gone (nothing changed).
-- solo_restore answers SOLO_RESTORED|run|restored|kept|waiting.

local core = ...
local event = core.event

local LEDGER_FILE = 'narration_solo_ledger.txt'
local SOLO_IN_PLACE = 2
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

-- Puts back the rows whose track is in the project in front and still reads the solo this file set. Answers how many were put back, how many were
-- kept (the track reads something else now), and the rows whose track is not there. A row whose track resolves is done either way.
local function put_back(rows)
  local restored, kept, left = 0, 0, {}
  for _, row in ipairs(rows) do
    local track = find_track(row.guid)
    if not track then
      left[#left + 1] = row
    elseif reaper.GetMediaTrackInfo_Value(track, 'I_SOLO') == SOLO_IN_PLACE then
      reaper.SetMediaTrackInfo_Value(track, 'I_SOLO', row.was)
      restored = restored + 1
    else
      kept = kept + 1
    end
  end
  return restored, kept, left
end

return function(registry)
  -- rows are the chapters this bridge soloed, ghosts the rows whose track was not in the project in front when they were tried.
  local state = { rows = {}, ghosts = {} }

  -- REAPER records, a record_start waits for REAPER to say so, or a play has isolated a track: the solos are not read or written.
  local function busy()
    if recording() then
      return true
    end
    local take = registry.transport_recording and registry.transport_recording()
    if take ~= nil and not take.started then
      return true
    end
    return registry.transport_isolated ~= nil and registry.transport_isolated()
  end

  -- Adds rows to the ghosts, the oldest dropped past MAX_ROWS (together with the chapters this bridge holds).
  local function add_ghosts(rows)
    for _, row in ipairs(rows) do
      state.ghosts[#state.ghosts + 1] = row
    end
    while #state.ghosts > 0 and #state.rows + #state.ghosts > MAX_ROWS do
      table.remove(state.ghosts, 1)
    end
  end

  -- A write that failed is tried again on the ticks that follow, spaced out by a count of ticks that doubles up to MAX_RETRY_WAIT, so a ledger that
  -- stays unwritable (a full disk, a folder of that name) is not opened thirty times a second. A command that changes the rows tries at once.
  local function persist(from_tick)
    if state.in_tick and state.tick_wrote and state.unsaved then
      return false
    end
    local all = {}
    for _, row in ipairs(state.ghosts) do
      all[#all + 1] = row
    end
    for _, row in ipairs(state.rows) do
      all[#all + 1] = row
    end
    state.unsaved = not save(all)
    if state.in_tick then
      state.tick_wrote = true
    end
    if not state.unsaved then
      state.misses, state.wait = nil, nil
    elseif from_tick or state.in_tick then
      state.misses = (state.misses or 0) + 1
      state.wait = state.misses <= 1 and 0 or math.min(2 ^ (state.misses - 2), MAX_RETRY_WAIT)
    else
      state.misses, state.wait = 0, 0
    end
    return not state.unsaved
  end

  -- Once per bridge start: puts back the rows a closed or crashed REAPER left in the file, after the transport has put back a play's isolation it left.
  -- Every path that writes the file runs it first, since a write would replace the file; this bridge has written nothing yet when it runs, so every
  -- row in the file is a leftover.
  local function recover()
    if state.recovered then
      return
    end
    state.recovered = true
    if registry.transport_recover then
      registry.transport_recover()
    end
    local input = io.open(ledger_path(), 'r')
    if not input then
      return
    end
    local rows = {}
    -- A file that cannot be read (a folder of that name) has no rows, and only its first 64 KB is read.
    pcall(function()
      for line in (input:read(65536) or ''):gmatch('[^\n]+') do
        -- Only a 0 is something this file soloes from, so no other value is ever written back.
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

  -- Soloes `track` when it is not soloed, after putting back the chapters this file soloed before. Answers 1 when it changed the track. The ledger is
  -- written first: nothing is soloed when it cannot be (a REAPER that crashed with a chapter soloed and no row would leave it so for good), except
  -- that a chapter already on the ledger is soloed again.
  local function apply(track)
    recover()
    local guid = normalize_guid(reaper.GetTrackGUID(track))
    local mine, others = nil, {}
    -- The same chapter can be a ghost (its track was not in front when it was tried): it is the live row again, not a second one the tick would put back.
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
    local needs = reaper.GetMediaTrackInfo_Value(track, 'I_SOLO') == 0
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
      reaper.SetMediaTrackInfo_Value(track, 'I_SOLO', SOLO_IN_PLACE)
      return 1
    end
    return 0
  end

  -- Puts back what this file soloed, after reading a leftover the file may hold.
  local function release()
    recover()
    local restored, kept, left = put_back(state.rows)
    state.rows = {}
    add_ghosts(left)
    persist()
    return restored, kept
  end

  registry.register('solo_chapter', function(ctx, args)
    local run, guid_text = args[1] or '', args[2] or ''
    local track = find_track(guid_text)
    if not track then
      event(ctx.session_dir, 'TRACK_STALE', run, guid_text)
      return
    end
    local guid = normalize_guid(guid_text)
    -- The newest request wins: one that waits replaces an earlier one that waits, and cancels a restore that waits.
    state.waiting = false
    if busy() then
      state.pending = guid
      event(ctx.session_dir, 'CHAPTER_SOLOED', run, guid, 0, 1)
      return
    end
    state.pending = nil
    event(ctx.session_dir, 'CHAPTER_SOLOED', run, guid, apply(track), 0)
  end)

  registry.register('solo_restore', function(ctx, args)
    local run = args[1] or ''
    state.pending = nil
    if busy() then
      state.waiting = #state.rows > 0
      event(ctx.session_dir, 'SOLO_RESTORED', run, 0, 0, state.waiting and 1 or 0)
      return
    end
    state.waiting = false
    local restored, kept = release()
    event(ctx.session_dir, 'SOLO_RESTORED', run, restored, kept, 0)
  end)

  -- Called by the tick loop once a tick, after the transport's: recovers the file, rewrites a ledger that could not be written, applies a solo or a
  -- restore that waited, and tries the ghosts again when the project in front or its track count has changed since they were last tried.
  registry.solo_chapter_tick = function()
    if busy() then
      return
    end
    state.in_tick = true
    state.tick_wrote = false
    recover()
    -- A ledger that could not be written after chapters were put back would still list them: it is written again.
    if state.unsaved then
      if (state.wait or 0) <= 0 then
        persist(true)
      else
        state.wait = state.wait - 1
      end
    end
    if state.pending then
      local track = find_track(state.pending)
      state.pending = nil
      if track then
        apply(track)
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
