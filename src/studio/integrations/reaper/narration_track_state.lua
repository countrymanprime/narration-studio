-- The live state of REAPER and one track, over the bridge: chapter_track_state (the
-- calls are in docs/research/reaper-api-for-planned-commands.md). Loaded by narration_ui_bridge.lua, which passes the
-- shared helpers as the chunk argument.
--
-- Read-only: it reads the transport, the edit counter, which tracks are armed, the named track's record input, REAPER's
-- input and output devices and the names of the track's input channels, and lists the named track's items with their
-- active takes. It opens no undo block and sets nothing. A track is named by its GUID; a GUID that does not resolve is reported as TRACK_STALE and no other track is
-- ever answered in its place. With no GUID it answers the transport and the arms only.
--
-- Events: TRACK_STATE|run|guid|playState|editCursor|playPosition|rpp|unsaved|changeCount|thisArmed|armedCount|recInput|
-- inputDevice|outputDevice|recInputName, then TRACK_ITEM|run|itemGuid|takeGuid|position|length|sourceOffset|playrate|
-- sourceFile|muted per item (at most ITEM_LIMIT; muted is the last field), then TRACK_STATE_END|run|listed|total.

local core = ...
local event = core.event

-- A chapter track holds tens of items; the limit keeps one answer from flooding events.log if a track holds thousands.
local ITEM_LIMIT = 1000

local function normalize_guid(guid)
  local bare = tostring(guid or ''):gsub('[{}%s]', ''):upper()
  if bare == '' then
    return ''
  end
  return '{' .. bare .. '}'
end
local function seconds(value)
  return string.format('%.6f', value or 0)
end
local function guid_of(getter, object)
  local _, guid = getter(object, 'GUID', '', false)
  return normalize_guid(guid)
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
local function armed(track)
  return reaper.GetMediaTrackInfo_Value(track, 'I_RECARM') ~= 0
end
local function armed_count()
  local count = 0
  for index = 0, reaper.CountTracks(0) - 1 do
    if armed(reaper.GetTrack(0, index)) then
      count = count + 1
    end
  end
  return count
end
-- The input (IDENT_IN) or output (IDENT_OUT) device REAPER has open, or empty when it has none open or cannot say.
local function audio_device(attribute)
  if not reaper.APIExists('GetAudioDeviceInfo') then
    return ''
  end
  local ok, name = reaper.GetAudioDeviceInfo(attribute)
  return ok and name or ''
end
local function channel_name(index)
  local name = reaper.GetInputChannelName(index)
  return type(name) == 'string' and name or ''
end
-- The hardware channel(s) a track records from, by REAPER's names for them: I_RECINPUT's low ten bits are the first
-- channel, 1024 makes it a pair and 4096 a MIDI input. Empty for no input, MIDI, a channel REAPER cannot name, or no
-- GetInputChannelName.
local function input_channel_name(rec_input)
  if rec_input < 0 or math.floor(rec_input / 4096) % 2 == 1 or not reaper.APIExists('GetInputChannelName') then
    return ''
  end
  local first = rec_input % 1024
  local name = channel_name(first)
  if name == '' or math.floor(rec_input / 1024) % 2 == 0 then
    return name
  end
  local second = channel_name(first + 1)
  return second ~= '' and (name .. ' / ' .. second) or ''
end

local function item_row(item)
  local take = reaper.GetActiveTake(item)
  local take_guid, offset, rate, file = '', 0, 1, ''
  if take then
    take_guid = guid_of(reaper.GetSetMediaItemTakeInfo_String, take)
    offset = reaper.GetMediaItemTakeInfo_Value(take, 'D_STARTOFFS')
    rate = reaper.GetMediaItemTakeInfo_Value(take, 'D_PLAYRATE')
    local source = reaper.GetMediaItemTake_Source(take)
    file = source and reaper.GetMediaSourceFileName(source, '') or ''
  end
  return guid_of(reaper.GetSetMediaItemInfo_String, item),
    take_guid,
    seconds(reaper.GetMediaItemInfo_Value(item, 'D_POSITION')),
    seconds(reaper.GetMediaItemInfo_Value(item, 'D_LENGTH')),
    seconds(offset),
    seconds(rate),
    file or '',
    reaper.GetMediaItemInfo_Value(item, 'B_MUTE') ~= 0 and 1 or 0
end

local function chapter_track_state(session_dir, run_id, guid_text)
  for _, name in ipairs({ 'GetPlayPosition', 'CountTracks', 'GetProjectStateChangeCount' }) do
    if not reaper.APIExists(name) then
      event(session_dir, 'ERROR', run_id, 'This REAPER version cannot report its transport and tracks.')
      return
    end
  end
  local wanted = normalize_guid(guid_text)
  local track = nil
  if wanted ~= '' then
    track = find_track(wanted)
    if not track then
      event(session_dir, 'TRACK_STALE', run_id, guid_text)
      return
    end
  end
  local _, rpp = reaper.EnumProjects(-1, '')
  rpp = rpp or ''
  local rec_input = track and math.floor(reaper.GetMediaTrackInfo_Value(track, 'I_RECINPUT')) or nil
  event(
    session_dir,
    'TRACK_STATE',
    run_id,
    track and wanted or '',
    reaper.GetPlayState(),
    seconds(reaper.GetCursorPosition()),
    seconds(reaper.GetPlayPosition()),
    rpp,
    rpp == '' and 1 or 0,
    reaper.GetProjectStateChangeCount(0),
    (track and armed(track)) and 1 or 0,
    armed_count(),
    rec_input or '',
    audio_device('IDENT_IN'),
    audio_device('IDENT_OUT'),
    rec_input and input_channel_name(rec_input) or ''
  )
  local total = track and reaper.CountTrackMediaItems(track) or 0
  local listed = math.min(total, ITEM_LIMIT)
  for index = 0, listed - 1 do
    event(session_dir, 'TRACK_ITEM', run_id, item_row(reaper.GetTrackMediaItem(track, index)))
  end
  event(session_dir, 'TRACK_STATE_END', run_id, listed, total)
end

return function(registry)
  registry.register('chapter_track_state', function(ctx, args)
    chapter_track_state(ctx.session_dir, args[1] or '', args[2] or '')
  end)
end
