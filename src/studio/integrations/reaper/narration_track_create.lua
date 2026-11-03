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
-- track_create|run|name|parentGuid adds a voice inside a chapter's folder (docs/prds/booth-voice-tracks.prd.md, phase 3): the new track goes after
-- the parent's last descendant as a direct child of the parent, and the folder depth changes (I_FOLDERDEPTH) of that last descendant and of
-- the new track are set so every folder still closes where it did (REAPER 7.82: InsertTrackAtIndex moves no depth itself,
-- docs/research/2026-10-30-booth-sub-track-recording.md, section 6a, row 2). A parent that is not a folder becomes one with the new track as
-- its child. The new track records from the same input and mode as the folder's first child (the parent's own when it has none). A parent
-- that is gone answers TRACK_STALE and adds nothing.
--
-- Events: TRACK_CREATED|run|guid|index|name, TRACK_STALE|run|parentGuid, or ERROR|run|message.

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

local function normalize_guid(guid)
  local bare = tostring(guid or ''):gsub('[{}%s]', ''):upper()
  if bare == '' then
    return ''
  end
  return '{' .. bare .. '}'
end

-- The track the GUID names and its 0-based index, with the folder depth each track sits at, or nil.
local function locate(guid)
  local depth = 0
  local depths = {}
  local found_index
  for index = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, index)
    depths[index] = depth
    if normalize_guid(reaper.GetTrackGUID(track)) == guid then
      found_index = index
    end
    depth = depth + reaper.GetMediaTrackInfo_Value(track, 'I_FOLDERDEPTH')
  end
  if found_index == nil then
    return nil
  end
  return found_index, depths
end

-- Inserts the new track inside `parent_index`'s folder, after its last descendant, and answers the new track's index.
local function insert_child(parent_index, depths)
  local parent = reaper.GetTrack(0, parent_index)
  local members = core.with_descendants(parent)
  local last_index = parent_index + #members - 1
  local last = reaper.GetTrack(0, last_index)
  local source = members[2] or parent
  local last_delta = reaper.GetMediaTrackInfo_Value(last, 'I_FOLDERDEPTH')
  local parent_depth, last_depth = depths[parent_index], depths[last_index]
  local index = last_index + 1
  reaper.InsertTrackAtIndex(index, false)
  local track = reaper.GetTrack(0, index)
  reaper.SetMediaTrackInfo_Value(last, 'I_FOLDERDEPTH', parent_depth + 1 - last_depth)
  reaper.SetMediaTrackInfo_Value(track, 'I_FOLDERDEPTH', last_delta + last_depth - parent_depth - 1)
  reaper.SetMediaTrackInfo_Value(track, 'I_RECINPUT', reaper.GetMediaTrackInfo_Value(source, 'I_RECINPUT'))
  reaper.SetMediaTrackInfo_Value(track, 'I_RECMODE', reaper.GetMediaTrackInfo_Value(source, 'I_RECMODE'))
  return index
end

local function track_create(session_dir, run_id, name_text, parent_text)
  local name = clean_name(name_text)
  if name == '' then
    event(session_dir, 'ERROR', run_id, NO_NAME)
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local parent_guid = normalize_guid(parent_text)
  local parent_index, depths
  if parent_guid ~= '' then
    parent_index, depths = locate(parent_guid)
    if parent_index == nil then
      event(session_dir, 'TRACK_STALE', run_id, parent_text)
      return
    end
  end
  reaper.Undo_BeginBlock2(0)
  local index
  if parent_index ~= nil then
    index = insert_child(parent_index, depths)
  else
    index = reaper.CountTracks(0)
    reaper.InsertTrackAtIndex(index, false)
  end
  local track = reaper.GetTrack(0, index)
  reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', name, true)
  reaper.Undo_EndBlock2(0, UNDO_ADD_TRACK, -1)
  reaper.UpdateArrange()
  local _, stored = reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', '', false)
  event(session_dir, 'TRACK_CREATED', run_id, reaper.GetTrackGUID(track), index, stored)
end

return function(registry)
  registry.register('track_create', function(ctx, args)
    track_create(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '')
  end)
end
