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
-- one selected track (empty when none or several are selected, except a folder with everything inside it, below, so a caller
-- never guesses) and the edit cursor in project seconds. It changes nothing. go_to selects a track and puts the edit cursor at
-- its end ('end'; for a folder, the latest end of its own items and of every track inside it) or at a time ('at'),
-- answering PLACE_SET|run|guid|cursor, or TRACK_STALE for a track that is gone. Like select_track it opens no undo block and
-- never seeks or starts playback. A folder track is selected together with every track inside it (a chapter and its voices, #3427),
-- and read_place names that folder when exactly it and all of its descendants are selected, so what go_to selected reads back as
-- the one place it moved to. Any other selection of several tracks is named by none.

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

-- The position (1-based) of `track` in the project, or nil.
local function position_of(track)
  for index = 0, reaper.CountTracks(0) - 1 do
    if reaper.GetTrack(0, index) == track then
      return index + 1
    end
  end
  return nil
end

-- The tracks inside the folder `track` opens, in project order (empty for a track that is not a folder): the ones after it until the
-- folder depth falls back to where it began.
local function folder_members(track)
  local members = {}
  local level = reaper.GetMediaTrackInfo_Value(track, 'I_FOLDERDEPTH')
  local index = position_of(track)
  if level <= 0 or not index then
    return members
  end
  -- `index` is the 1-based position of the folder, so it is also the 0-based index of the track after it.
  while level > 0 and index < reaper.CountTracks(0) do
    local member = reaper.GetTrack(0, index)
    members[#members + 1] = member
    level = level + reaper.GetMediaTrackInfo_Value(member, 'I_FOLDERDEPTH')
    index = index + 1
  end
  return members
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
  elseif selected > 1 then
    -- Several are selected: the first in project order names the place only when it is a folder and the selection is exactly it
    -- and everything inside it (what go_to leaves), never a guess among unrelated tracks.
    local chosen = {}
    for position = 0, selected - 1 do
      chosen[reaper.GetSelectedTrack(0, position)] = true
    end
    local first
    for index = 0, reaper.CountTracks(0) - 1 do
      local track = reaper.GetTrack(0, index)
      if chosen[track] then
        first = track
        break
      end
    end
    local members = first and folder_members(first) or {}
    local whole = #members > 0 and selected == #members + 1
    for _, member in ipairs(members) do
      whole = whole and chosen[member] == true
    end
    if whole then
      guid = normalize_guid(reaper.GetTrackGUID(first))
    end
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
  local members = folder_members(track)
  local target = seconds
  if where == 'end' then
    -- A chapter's recordings sit on its voices, so a folder's end is the latest end among it and the tracks inside it.
    target = track_end(track)
    for _, member in ipairs(members) do
      target = math.max(target, track_end(member))
    end
  end
  reaper.SetOnlyTrackSelected(track)
  for _, member in ipairs(members) do
    reaper.SetTrackSelected(member, true)
  end
  reaper.SetEditCurPos(target, true, false)
  core.cursor_moved()
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
