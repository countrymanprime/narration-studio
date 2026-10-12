-- Roll again while recording, over the bridge (ADR 0860 point 1). Loaded by narration_ui_bridge.lua, which passes the
-- shared helpers as the chunk argument.
--
-- roll(run, track_guid, at) runs only while a recording this bridge started (record_start in narration_transport.lua,
-- ADR 0232) runs on the named track; anything else is RECORD_NOT_OURS, as record_stop answers. A recording is not an
-- item until it stops (docs/reference/daw/reaper.md, "Media sources and recording"), so the command stops it, moves
-- the edit cursor to `at` and records again there with CSurf_OnRecord: the new pass overlaps the earlier one, and
-- REAPER keeps the earlier audio as a take when its "New recording that overlaps existing media items" option is
-- "Splits existing items and creates new takes". The command reads that option first (bits 4 and 8 of the autoxfade
-- config variable, per the Ultraschall copy of REAPER's config-variable list, 6.56) and refuses, naming it, when it
-- is another; it never changes a preference, a project setting or a track. A fixed-lane track is refused too: a new
-- pass there is a lane, not a take, and the app never changes lanes (ADR 0147).
--
-- It opens no undo block: the points REAPER adds for the recorded media are REAPER's, so ROLLED reports 0. Not run in
-- REAPER (pending the QA pass, #1495): how get_config_var_string formats autoxfade, whether REAPER 7's per-track
-- overlap override changes the answer, whether GetPlayState reads stopped right after OnStopButton, how many undo
-- points the stop and the restart leave, and that the earlier pass becomes a take of the same item.
--
-- Answers ROLLED|run|trackGuid|at|undoPoints once REAPER reports recording again.

local core = ...
local event = core.event

-- How many defer cycles roll waits for REAPER to report recording again, as record_start waits (about a second).
local START_WAIT_CYCLES = 30

-- The answers after the roll stopped the recording: the earlier audio is kept, and the recording has ended.
local NOT_STOPPED = 'REAPER did not stop recording at once, so the roll did not record again. The earlier audio is kept.'
local NOT_RESTARTED = 'REAPER did not start recording again after the roll. The earlier audio is kept.'
local STOPPED_DURING_ROLL = 'The recording was stopped before REAPER recorded again after the roll. The earlier audio is kept.'

-- The overlapping-recording settings by their autoxfade bits (4, 8), in REAPER's menu wording.
local TAKES_SETTING = 'Splits existing items and creates new takes'
local OTHER_SETTINGS = {
  [1] = 'Trims existing items behind new recording (tape mode)',
  [2] = 'Creates new media items in separate lanes',
  [3] = 'an unknown value',
}

local function normalize_guid(guid)
  local bare = tostring(guid or ''):gsub('[{}%s]', ''):upper()
  if bare == '' then
    return ''
  end
  return '{' .. bare .. '}'
end
local function find_track(guid_text)
  local wanted = normalize_guid(guid_text)
  if wanted == '' then
    return nil
  end
  for index = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, index)
    if normalize_guid(reaper.GetTrackGUID(track)) == wanted then
      return track, wanted
    end
  end
  return nil
end
-- GetPlayState is a bit field (1 playing, 2 paused, 4 recording), read with arithmetic as narration_transport.lua does.
local function recording()
  return math.floor(reaper.GetPlayState() / 4) % 2 == 1
end

-- A finite, non-negative number of seconds, or nil.
local function seconds_from(text)
  local value = tonumber(text or '')
  if not value or value ~= value or value == math.huge or value < 0 then
    return nil
  end
  return value
end
local function seconds(value)
  return string.format('%.6f', value)
end

-- The overlapping-recording setting: nil when it keeps the earlier audio as a take, its name when it does not, and
-- false when REAPER did not report it.
local function overlap_refusal()
  local ok, text = reaper.get_config_var_string('autoxfade')
  local value = ok and tonumber(text) or nil
  if not value then
    return false
  end
  local mode = math.floor(value / 4) % 4
  if mode == 0 then
    return nil
  end
  return OTHER_SETTINGS[mode]
end

-- Waits for REAPER to report the new recording, then answers. The transport's recording stays the app's only while
-- narration_transport.lua still holds this record: record_stop, or its own watch giving up, ends it, and then so does
-- this wait.
local function watch(session_dir, ours, record, run_id, guid, at)
  local waited = 0
  local function tick()
    if record.cancelled then
      event(session_dir, 'ERROR', run_id, STOPPED_DURING_ROLL)
      return
    end
    if ours() ~= record then
      event(session_dir, 'ERROR', run_id, NOT_RESTARTED)
      return
    end
    if recording() then
      event(session_dir, 'ROLLED', run_id, guid, seconds(at), 0)
      return
    end
    waited = waited + 1
    if waited >= START_WAIT_CYCLES then
      event(session_dir, 'ERROR', run_id, NOT_RESTARTED)
      return
    end
    reaper.defer(tick)
  end
  reaper.defer(tick)
end

local function roll(session_dir, ours, run_id, guid_text, at_text)
  local at = seconds_from(at_text)
  if not at then
    event(session_dir, 'ERROR', run_id, 'The roll time is not a usable number of seconds.')
    return
  end
  local needed = { 'CSurf_OnRecord', 'OnStopButton', 'get_config_var_string', 'GetProjectLength', 'GetPlayPosition2' }
  for _, name in ipairs(needed) do
    if not reaper.APIExists(name) then
      event(session_dir, 'ERROR', run_id, 'This REAPER version cannot roll a recording.')
      return
    end
  end
  local target, guid = find_track(guid_text)
  if not target then
    event(session_dir, 'TRACK_STALE', run_id, guid_text)
    return
  end
  local record = ours()
  if record and record.track == guid and not record.started then
    -- record_start, or an earlier roll, pressed record and REAPER has not reported it yet.
    event(session_dir, 'ERROR', run_id, 'REAPER has not reported the recording yet. Roll again in a moment.')
    return
  end
  if not record or record.track ~= guid or not recording() then
    event(session_dir, 'RECORD_NOT_OURS', run_id)
    return
  end
  -- The recording in progress is not an item yet, so it ends where REAPER records now, past GetProjectLength. Which play
  -- position is "now" is spike S4's question (narration_punch.lua), so the later of the two bounds it.
  local now = math.max(reaper.GetPlayPosition(), reaper.GetPlayPosition2())
  if at > math.max(reaper.GetProjectLength(0), now) then
    event(session_dir, 'ERROR', run_id, 'The roll time is past the end of the recording.')
    return
  end
  if reaper.GetMediaTrackInfo_Value(target, 'I_FREEMODE') == 2 then
    event(session_dir, 'ERROR', run_id, 'This track uses fixed item lanes, so a roll would record a new lane rather than a take. Roll is not available on it.')
    return
  end
  local refusal = overlap_refusal()
  if refusal == false then
    event(
      session_dir,
      'ERROR',
      run_id,
      'REAPER did not report its "New recording that overlaps existing media items" setting, so the roll did not stop recording.'
    )
    return
  elseif refusal then
    event(
      session_dir,
      'ERROR',
      run_id,
      'Roll keeps the earlier audio as a take only when REAPER\'s option "New recording that overlaps existing media items" is set to "'
        .. TAKES_SETTING
        .. '". It is set to "'
        .. refusal
        .. '". Change it in REAPER\'s Options menu; this app never changes it.'
    )
    return
  end
  reaper.OnStopButton()
  if recording() then
    -- CSurf_OnRecord is a toggle: pressed while REAPER still records, it would stop rather than restart.
    event(session_dir, 'ERROR', run_id, NOT_STOPPED)
    return
  end
  -- Like punch_to: scroll the view, do not seek playback, open no undo block.
  reaper.SetEditCurPos(at, true, false)
  reaper.CSurf_OnRecord()
  record.position = at
  if recording() then
    event(session_dir, 'ROLLED', run_id, guid, seconds(at), 0)
    return
  end
  -- REAPER reports the new recording later: narration_transport.lua's watch waits for it as it waits after
  -- record_start, rather than taking the stop for the narrator's (it answers RECORD_STARTED on the start's run once
  -- REAPER records, or its own ERROR and forgets the recording), and this command answers once it records.
  record.started, record.waited = false, 0
  watch(session_dir, ours, record, run_id, guid, at)
end

return function(registry)
  -- narration_transport.lua's recording, read when the command runs: it registers its accessor on the same registry.
  local function ours()
    return registry.transport_recording and registry.transport_recording() or nil
  end
  registry.register('roll', function(ctx, args)
    roll(ctx.session_dir, ours, args[1] or '', args[2] or '', args[3])
  end)
end
