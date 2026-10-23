-- Adding a chapter's track in REAPER: "Create a track for this chapter and link it", offered when a chapter has no track
-- to record on. Loaded by narration_ui_bridge.lua, which passes the shared helpers as the chunk argument.
--
-- track_create|run|name adds one track at the end of the track list (after every track the narrator has, never between
-- them), names it, and answers TRACK_CREATED|run|guid|index|name: the new track's GUID, its 0-based index and the name
-- it was given, so the host can link the chapter to it. The name is trimmed and a line break or tab inside it becomes a
-- space (a track name is one line); a name that is empty after that is refused. It refuses while REAPER records, so no
-- track appears in the middle of a take, and changes nothing else: no other track's selection, arm, mute or name. It is one
-- undo point ("<app name>: add track") and never saves the project. It is not idempotent: each call adds a track.
--
-- Events: TRACK_CREATED|run|guid|index|name, or ERROR|run|message.

local core = ...
local event = core.event

local UNDO_ADD_TRACK = core.brand.name .. ': add track'
local RECORDING = 'REAPER is recording. Stop recording first.'
local NO_NAME = 'The new track needs a name.'

local function recording()
  return math.floor(reaper.GetPlayState() / 4) % 2 == 1
end

local function clean_name(text)
  local name = tostring(text or ''):gsub('[\r\n\t]+', ' ')
  return (name:gsub('^%s+', ''):gsub('%s+$', ''))
end

local function track_create(session_dir, run_id, name_text)
  local name = clean_name(name_text)
  if name == '' then
    event(session_dir, 'ERROR', run_id, NO_NAME)
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  reaper.Undo_BeginBlock2(0)
  local index = reaper.CountTracks(0)
  reaper.InsertTrackAtIndex(index, false)
  local track = reaper.GetTrack(0, index)
  reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', name, true)
  reaper.Undo_EndBlock2(0, UNDO_ADD_TRACK, -1)
  reaper.UpdateArrange()
  local _, stored = reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', '', false)
  event(session_dir, 'TRACK_CREATED', run_id, reaper.GetTrackGUID(track), index, stored)
end

return function(registry)
  registry.register('track_create', function(ctx, args)
    track_create(ctx.session_dir, args[1] or '', args[2] or '')
  end)
end
