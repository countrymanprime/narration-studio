-- Recording in REAPER for the Read Aloud control bar, over the bridge: arm_only, record_start and record_stop
-- (the calls are in
-- docs/research/reaper-api-for-planned-commands.md). Loaded by narration_ui_bridge.lua, which passes the shared helpers
-- as the chunk argument. The read side (which tracks are armed, whether REAPER records) is chapter_track_state in
-- narration_track_state.lua; this file holds only the commands that change the transport or the arms.
--
-- The same file holds the four commands of the Editing page's transport sync (docs/design/editing-daw-transport-sync.md):
-- set_cursor, play_from, stop_play and watch_transport. None adds an undo point or selects a track, and none touches a
-- recording (each answers 'REAPER is recording. Stop recording first.'). set_cursor moves the edit cursor and never seeks
-- playback. play_from puts the cursor at a time and starts the transport from it (a playing REAPER is seeked, a paused one
-- is stopped first so Play starts at the time). stop_play stops a playing or paused transport. watch_transport takes a
-- lease of 1 to 10 seconds and, while it holds, makes the tick loop send TRANSPORT|<empty run>|playState|playPosition|
-- editCursor: at once when the play state changes or the cursor moves by more than a millisecond, and about four times a
-- second while REAPER plays. A lease that is not renewed runs out, so a host that closed leaves no stream behind.
--
-- arm_only arms one track and disarms every other, remembering the arms the narrator had before the first arm_only.
-- They are put back when a recording this bridge started stops, whether record_stop stops it or the narrator stops it
-- in REAPER (a short defer watch notices), and only where an arm is still what arm_only left it: an arm the narrator
-- changed meanwhile is theirs and is kept. A track arm is not in REAPER's undo history, so arm_only opens no undo block.
--
-- record_start records only when REAPER is stopped and exactly one track is armed, the named one. record_stop stops
-- only the recording this bridge started (RECORD_NOT_OURS otherwise). Neither calls Main_OnCommand: recording starts
-- with CSurf_OnRecord, pressed once after REAPER was seen stopped, since it is a toggle; RECORD_STARTED follows once
-- GetPlayState reports recording, which may be a few defer cycles later. An optional third argument `end` first moves
-- the edit cursor to the end of the last item on the named track (0 when empty), once every check has passed.
--
-- RECORD_STOPPED and RECORD_ENDED end with undoPoints: how many points REAPER's undo history gained while the recording ran,
-- read as the rise of GetProjectStateChangeCount from the start to the stop (REAPER 7.82 added one, "Recorded media", per
-- stop, and two for a take with one roll, docs/research/reaper-recording-undo-2026-10-23.md). The bridge also keeps, for
-- narration_undo.lua's record_take, the change count and the top label right after the stop: the take is REAPER's last
-- action while both are unchanged. The label is REAPER's own text and is never written to events.log (threat model row 5f).

local core = ...
local event = core.event

local function normalize_guid(guid)
  local bare = tostring(guid or ''):gsub('[{}%s]', ''):upper()
  if bare == '' then
    return ''
  end
  return '{' .. bare .. '}'
end
local function track_guid(track)
  return normalize_guid(reaper.GetTrackGUID(track))
end
local function tracks()
  local out = {}
  for index = 0, reaper.CountTracks(0) - 1 do
    out[#out + 1] = reaper.GetTrack(0, index)
  end
  return out
end
local function find_track(guid_text)
  local wanted = normalize_guid(guid_text)
  if wanted == '' then
    return nil
  end
  for _, track in ipairs(tracks()) do
    if track_guid(track) == wanted then
      return track
    end
  end
  return nil
end
local function armed(track)
  return reaper.GetMediaTrackInfo_Value(track, 'I_RECARM') ~= 0
end
local function set_armed(track, value)
  reaper.SetMediaTrackInfo_Value(track, 'I_RECARM', value and 1 or 0)
end
-- GetPlayState is a bit field (1 playing, 2 paused, 4 recording), read with arithmetic as narration_navigation.lua does.
local function recording()
  return math.floor(reaper.GetPlayState() / 4) % 2 == 1
end

-- Puts back the arms remembered by the first arm_only. A track still armed as arm_only left it goes back to what the
-- narrator had; a track whose arm changed since is kept; a track that is gone, or was added since, is left alone.
-- Answers how many were put back and how many kept, and forgets the remembered arms.
local function restore_arms(state)
  local saved = state.saved_arms
  state.saved_arms = nil
  if not saved then
    return 0, 0
  end
  local restored, kept = 0, 0
  for _, track in ipairs(tracks()) do
    local guid = track_guid(track)
    local before = saved.arms[guid]
    if before ~= nil then
      local now, left = armed(track), guid == saved.target
      if now ~= before then
        if now == left then
          set_armed(track, before)
          restored = restored + 1
        else
          kept = kept + 1
        end
      end
    end
  end
  return restored, kept
end

-- Ends the recording this bridge started: forgets it, puts the arms back and remembers the undo points it left
-- (state.last_take, nil when it left none). Answers the arms restored and kept, and the undo points.
local function finish(state)
  local record = state.recording
  state.recording = nil
  local restored, kept = restore_arms(state)
  local count = reaper.GetProjectStateChangeCount(0)
  local points = record and record.changes_before and math.max(0, count - record.changes_before) or 0
  local label = reaper.Undo_CanUndo2(0)
  if points > 0 and type(label) == 'string' and label ~= '' then
    state.last_take = { count = count, label = label, points = points }
  else
    state.last_take = nil
  end
  return restored, kept, points
end

-- A time in seconds written as plain decimal digits (no sign, exponent, hex or comma), at most MAX_SECONDS, or nil. The host
-- writes seconds this way; anything else is refused so a mangled number never moves the cursor to 0.
local MAX_SECONDS = 10000000
local function seconds_from(text)
  if type(text) ~= 'string' or not (text:match('^%d+$') or text:match('^%d+%.%d+$')) or #text > 24 then
    return nil
  end
  local value = tonumber(text)
  if not value or value > MAX_SECONDS then
    return nil
  end
  return value
end
local RECORDING = 'REAPER is recording. Stop recording first.'

local function set_cursor(session_dir, run_id, text)
  local seconds = seconds_from(text)
  if not seconds then
    event(session_dir, 'ERROR', run_id, 'The place to put the cursor is not a usable number of seconds.')
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  -- Scroll the view, do not seek playback: like go_to and punch_to, going somewhere is not an edit.
  reaper.SetEditCurPos(seconds, true, false)
  event(session_dir, 'CURSOR_SET', run_id, string.format('%.6f', seconds))
end

local function play_from(session_dir, run_id, text)
  local seconds = seconds_from(text)
  if not seconds then
    event(session_dir, 'ERROR', run_id, 'The place to play from is not a usable number of seconds.')
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local play_state = reaper.GetPlayState()
  if play_state % 2 == 1 then
    reaper.SetEditCurPos(seconds, true, true)
  else
    if play_state ~= 0 then
      -- Paused: Play would carry on from where it paused, not from the time.
      reaper.OnStopButton()
    end
    reaper.SetEditCurPos(seconds, true, false)
    reaper.OnPlayButton()
  end
  event(session_dir, 'TRANSPORT_PLAYING', run_id, string.format('%.6f', seconds))
end

local function stop_play(session_dir, run_id)
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  if reaper.GetPlayState() > 0 then
    reaper.OnStopButton()
  end
  event(session_dir, 'TRANSPORT_STOPPED', run_id, string.format('%.6f', reaper.GetCursorPosition()))
end

-- The watch: the longest lease a host can take, how often a playing position is sent, and how far the cursor must move to count as moved.
local MAX_LEASE_SECONDS = 10
local POSITION_INTERVAL_SECONDS = 0.25
local CURSOR_EPSILON = 0.001

local function watch_transport(session_dir, state, run_id, text)
  local lease = seconds_from(text)
  if not lease or lease <= 0 then
    event(session_dir, 'ERROR', run_id, 'The watch lease is not a usable number of seconds.')
    return
  end
  lease = math.min(lease, MAX_LEASE_SECONDS)
  local expires = reaper.time_precise() + lease
  if state.watch then
    state.watch.expires = expires
  else
    state.watch = { expires = expires }
  end
  event(session_dir, 'TRANSPORT_WATCHING', run_id, string.format('%d', math.floor(lease + 0.5)))
end

-- One tick of the watch, called by the bridge's tick loop after the commands: sends TRANSPORT when the play state changed, the
-- cursor moved, or REAPER has been playing for POSITION_INTERVAL_SECONDS since the last one, and drops the watch once its lease is up.
local function watch_tick(session_dir, state)
  local watch = state.watch
  if not watch then
    return
  end
  local now = reaper.time_precise()
  if now >= watch.expires then
    state.watch = nil
    return
  end
  local play_state, cursor = reaper.GetPlayState(), reaper.GetCursorPosition()
  local changed = watch.sent_at == nil or play_state ~= watch.play_state or math.abs(cursor - watch.cursor) > CURSOR_EPSILON
  local due = play_state % 2 == 1 and watch.sent_at ~= nil and (now - watch.sent_at) >= POSITION_INTERVAL_SECONDS
  if not (changed or due) then
    return
  end
  watch.play_state, watch.cursor, watch.sent_at = play_state, cursor, now
  event(session_dir, 'TRANSPORT', '', play_state, string.format('%.6f', reaper.GetPlayPosition() or 0), string.format('%.6f', cursor))
end

local function arm_only(session_dir, state, run_id, guid_text)
  if not reaper.APIExists('CountTracks') or not reaper.APIExists('SetMediaTrackInfo_Value') then
    event(session_dir, 'ERROR', run_id, 'This REAPER version cannot arm tracks.')
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, 'REAPER is recording. Stop recording first.')
    return
  end
  local target = find_track(guid_text)
  if not target then
    event(session_dir, 'TRACK_STALE', run_id, guid_text)
    return
  end
  if not state.saved_arms then
    local arms = {}
    for _, track in ipairs(tracks()) do
      arms[track_guid(track)] = armed(track)
    end
    state.saved_arms = { arms = arms }
  end
  state.saved_arms.target = track_guid(target)
  local disarmed, changed = 0, false
  for _, track in ipairs(tracks()) do
    if track == target then
      if not armed(track) then
        set_armed(track, true)
        changed = true
      end
    elseif armed(track) then
      set_armed(track, false)
      disarmed, changed = disarmed + 1, true
    end
  end
  event(session_dir, 'ARMED', run_id, state.saved_arms.target, disarmed, changed and 1 or 0)
end

-- How many defer cycles record_start waits for GetPlayState to report recording after pressing record (about a second
-- at REAPER's usual defer rate). The reference does not say the state changes within the same cycle; the verification
-- pass (row B2) records whether it does.
local START_WAIT_CYCLES = 30

local function started(session_dir, record)
  record.started = true
  event(session_dir, 'RECORD_STARTED', record.run_id, record.track, string.format('%.6f', record.position))
end

-- Watches a recording this bridge started, one defer cycle at a time: first until REAPER reports it (or the wait runs
-- out), then until it stops or record_stop ends it first. A start record_stop cancelled while REAPER was still starting
-- is stopped if it begins after all, so a late start is never left running.
local function watch(session_dir, state, record)
  local function tick()
    if record.cancelled then
      if recording() then
        reaper.OnStopButton()
      elseif record.waited < START_WAIT_CYCLES then
        record.waited = record.waited + 1
        reaper.defer(tick)
      end
      return
    end
    if state.recording ~= record then
      return
    end
    if not record.started then
      if recording() then
        started(session_dir, record)
      else
        record.waited = record.waited + 1
        if record.waited >= START_WAIT_CYCLES then
          state.recording = nil
          event(session_dir, 'ERROR', record.run_id, 'REAPER did not start recording.')
          return
        end
      end
      reaper.defer(tick)
      return
    end
    if recording() then
      reaper.defer(tick)
      return
    end
    local restored, kept, points = finish(state)
    event(session_dir, 'RECORD_ENDED', record.run_id, restored, kept, points)
  end
  reaper.defer(tick)
end

-- The end of the latest item on the track, or 0 when it has none: D_POSITION + D_LENGTH, so nothing on it is overwritten.
local function track_end(track)
  local last = 0
  for index = 0, reaper.CountTrackMediaItems(track) - 1 do
    local item = reaper.GetTrackMediaItem(track, index)
    last = math.max(last, reaper.GetMediaItemInfo_Value(item, 'D_POSITION') + reaper.GetMediaItemInfo_Value(item, 'D_LENGTH'))
  end
  return last
end

local function record_start(session_dir, state, run_id, guid_text, start_rule)
  if start_rule ~= '' and start_rule ~= 'end' then
    event(session_dir, 'ERROR', run_id, 'Unknown start rule: ' .. start_rule .. '.')
    return
  end
  if not reaper.APIExists('CSurf_OnRecord') or not reaper.APIExists('CountTracks') then
    event(session_dir, 'ERROR', run_id, 'This REAPER version cannot start recording.')
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, 'REAPER is already recording.')
    return
  end
  if reaper.GetPlayState() ~= 0 then
    event(session_dir, 'ERROR', run_id, 'REAPER is playing. Stop it first.')
    return
  end
  local target = find_track(guid_text)
  if not target then
    event(session_dir, 'TRACK_STALE', run_id, guid_text)
    return
  end
  local armed_tracks = {}
  for _, track in ipairs(tracks()) do
    if armed(track) then
      armed_tracks[#armed_tracks + 1] = track
    end
  end
  if #armed_tracks == 0 then
    event(session_dir, 'ERROR', run_id, 'No track is armed.')
    return
  elseif #armed_tracks > 1 then
    event(session_dir, 'ERROR', run_id, 'More than one track is armed.')
    return
  elseif armed_tracks[1] ~= target then
    event(session_dir, 'ERROR', run_id, 'Another track is armed.')
    return
  end
  if start_rule == 'end' then
    -- Only now that every check passed. Like punch_to: scroll the view, do not seek playback, open no undo block.
    reaper.SetEditCurPos(track_end(target), true, false)
  end
  local record = {
    run_id = run_id,
    track = track_guid(target),
    position = reaper.GetCursorPosition(),
    waited = 0,
    changes_before = reaper.GetProjectStateChangeCount(0),
  }
  reaper.CSurf_OnRecord()
  state.recording = record
  if recording() then
    started(session_dir, record)
  end
  watch(session_dir, state, record)
end

local function record_stop(session_dir, state, run_id)
  if not state.recording then
    event(session_dir, 'RECORD_NOT_OURS', run_id)
    return
  end
  local record = state.recording
  if not record.started then
    record.cancelled = true
    event(session_dir, 'ERROR', record.run_id, 'Recording was stopped before REAPER started it.')
  end
  if recording() then
    reaper.OnStopButton()
  end
  local restored, kept, points = finish(state)
  event(session_dir, 'RECORD_STOPPED', run_id, restored, kept, points)
end

return function(registry)
  local state = {}
  registry.register('arm_only', function(ctx, args)
    arm_only(ctx.session_dir, state, args[1] or '', args[2] or '')
  end)
  registry.register('record_start', function(ctx, args)
    record_start(ctx.session_dir, state, args[1] or '', args[2] or '', args[3] or '')
  end)
  registry.register('record_stop', function(ctx, args)
    record_stop(ctx.session_dir, state, args[1] or '')
  end)
  registry.register('set_cursor', function(ctx, args)
    set_cursor(ctx.session_dir, args[1] or '', args[2] or '')
  end)
  registry.register('play_from', function(ctx, args)
    play_from(ctx.session_dir, args[1] or '', args[2] or '')
  end)
  registry.register('stop_play', function(ctx, args)
    stop_play(ctx.session_dir, args[1] or '')
  end)
  registry.register('watch_transport', function(ctx, args)
    watch_transport(ctx.session_dir, state, args[1] or '', args[2] or '')
  end)
  -- Called by the tick loop (narration_ui_bridge.lua) once a tick after the commands.
  registry.transport_watch_tick = function(ctx)
    watch_tick(ctx.session_dir, state)
  end
  -- The recording this bridge started, or nil: narration_roll.lua restarts only that one (docs/reference/daw/capabilities.md).
  registry.transport_recording = function()
    return state.recording
  end
  -- The undo points the last recording this bridge started left, or nil: what narration_undo.lua's record_take may undo.
  -- forget is called once they are undone, so a second undo never reaches an older recording of the narrator's.
  registry.transport_last_take = function()
    return state.last_take
  end
  registry.transport_forget_take = function()
    state.last_take = nil
  end
end
