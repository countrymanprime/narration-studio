-- Selecting a chapter's track in REAPER: "Select in REAPER" in the
-- chapter track slide-over, so a narrator who wants to look at the track themselves does not have to hunt for it.
-- Loaded by narration_ui_bridge.lua, which passes the shared helpers as the chunk argument.
--
-- It deselects every other track and selects the named one (SetOnlyTrackSelected), the same "one track at a time"
-- shape the track picker already assumes (one confirmed track per chapter). It opens no undo block: a selection
-- change is not project data, the same choice arm_only makes for record arms. A track is named by its GUID; a GUID
-- that does not resolve is reported as TRACK_STALE and no other track is ever selected in its place.
--
-- Events: TRACK_SELECTED|run|guid, or TRACK_STALE|run|guid.
--
-- The same file holds the pair the Booth follows the narrator with. read_place answers PLACE|run|guid|selected|cursor: the
-- one selected track (empty when none or several are selected, so a caller never guesses) and the edit cursor in project
-- seconds. It changes nothing. go_to selects a track and puts the edit cursor at its end ('end') or at a time ('at'),
-- answering PLACE_SET|run|guid|cursor, or TRACK_STALE for a track that is gone. Like select_track it opens no undo block and
-- never seeks or starts playback.

local core = ...
local event = core.event

local function normalize_guid(guid)
  local bare = tostring(guid or ''):gsub('[{}%s]', ''):upper()
  if bare == '' then
    return ''
  end
  return '{' .. bare .. '}'
end

local function find_track(guid)
  for index = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, index)
    if normalize_guid(reaper.GetTrackGUID(track)) == guid then
      return track
    end
  end
  return nil
end

local function select_track(session_dir, run_id, guid_text)
  local wanted = normalize_guid(guid_text)
  local track = find_track(wanted)
  if not track then
    event(session_dir, 'TRACK_STALE', run_id, guid_text)
    return
  end
  reaper.SetOnlyTrackSelected(track)
  event(session_dir, 'TRACK_SELECTED', run_id, wanted)
end

-- The end of the latest item on the track, or 0 when it has none.
local function track_end(track)
  local last = 0
  for index = 0, reaper.CountTrackMediaItems(track) - 1 do
    local item = reaper.GetTrackMediaItem(track, index)
    last = math.max(last, reaper.GetMediaItemInfo_Value(item, 'D_POSITION') + reaper.GetMediaItemInfo_Value(item, 'D_LENGTH'))
  end
  return last
end

local function read_place(session_dir, run_id)
  local selected = reaper.CountSelectedTracks(0)
  local guid = ''
  if selected == 1 then
    guid = normalize_guid(reaper.GetTrackGUID(reaper.GetSelectedTrack(0, 0)))
  end
  event(session_dir, 'PLACE', run_id, guid, selected, reaper.GetCursorPosition())
end

local function go_to(session_dir, run_id, guid_text, where, seconds_text)
  if where ~= 'end' and where ~= 'at' then
    event(session_dir, 'ERROR', run_id, 'Unknown place: ' .. where .. '.')
    return
  end
  local seconds = tonumber(seconds_text)
  if where == 'at' and (not seconds or seconds ~= seconds or seconds < 0 or seconds == math.huge) then
    event(session_dir, 'ERROR', run_id, 'The place to go to is not a usable number of seconds.')
    return
  end
  local wanted = normalize_guid(guid_text)
  local track = find_track(wanted)
  if not track then
    event(session_dir, 'TRACK_STALE', run_id, guid_text)
    return
  end
  local target = where == 'end' and track_end(track) or seconds
  reaper.SetOnlyTrackSelected(track)
  reaper.SetEditCurPos(target, true, false)
  event(session_dir, 'PLACE_SET', run_id, wanted, target)
end

return function(registry)
  registry.register('select_track', function(ctx, args)
    select_track(ctx.session_dir, args[1] or '', args[2] or '')
  end)
  registry.register('read_place', function(ctx, args)
    read_place(ctx.session_dir, args[1] or '')
  end)
  registry.register('go_to', function(ctx, args)
    go_to(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '', args[4] or '')
  end)
end
