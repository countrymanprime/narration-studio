-- Cut words and their audio, over the bridge (ADR 0860 point 2). Loaded by narration_ui_bridge.lua, which passes the
-- shared helpers as the chunk argument.
--
-- delete_range(run, item_guid, start, end, mode, fade_ms) cuts project seconds start..end out of the item named by GUID.
-- In one undo block it splits the item at end and then at start (SplitMediaItem leaves the left part as the original
-- item and returns the right) and moves the middle piece with MoveMediaItemToTrack to the project's Cuts track: muted,
-- found by a track P_EXT key this file writes, or by the name "Cuts" when no track has the key, and added after the
-- last track when there is none. Mode `close` moves every later item on the same track up by the cut's length; `gap`
-- moves nothing, so the cut is silence: the command has no room-tone source. Items on other tracks and on the Cuts track
-- never move. Nothing is deleted and no source file is touched (the PRD's DQ-8): one Undo gives the item back whole.
--
-- fade_ms (0 to 500) sets the fade at each new seam (the left piece's fade-out, the right piece's fade-in); untouched
-- edges keep theirs. A start or end within EDGE_TOLERANCE of the item's own edge cuts at that edge, with no split there.
-- An item that no longer resolves answers ITEM_STALE|run|guid|item; a range that is not inside the item, a neighbouring
-- item that overlaps it, a bad mode or fade, and recording are refused before any change.
--
-- Not run in REAPER (pending the QA pass, #1495): whether the splits, the move and the close-up are one undo step,
-- whether a track's P_EXT survives save and reload, and what fades REAPER gives the pieces at a split.
--
-- Answers RANGE_CUT|run|leftItemGuid|cutItemGuid|undoPoints: leftItemGuid is empty when the cut starts at the item's
-- start (the cut piece is then the item itself).

local core = ...
local event = core.event

local UNDO_DELETE_WORDS = 'Narration Utils: delete words'
-- The Cuts track's key and name. The key is what the bridge looks for; the name is what the narrator sees.
local CUTS_KEY = 'P_EXT:narration_utils_cuts'
local CUTS_NAME = 'Cuts'
local MAX_FADE_MS = 500
-- How far outside an item's bounds a range may fall and still count as inside it, and how close to an edge a range end
-- counts as that edge (float rounding of position maths), matching narration_cleanup_preview.lua and
-- narration_navigation.lua.
local EDGE_TOLERANCE = 0.000001

local BAD_RANGE = 'The range to cut is not a usable pair of times.'
local OUTSIDE = 'The range to cut is not inside that item.'

local function normalize_guid(guid)
  local bare = tostring(guid or ''):gsub('[{}%s]', ''):upper()
  if bare == '' then
    return ''
  end
  return '{' .. bare .. '}'
end
local function item_guid(item)
  local _, guid = reaper.GetSetMediaItemInfo_String(item, 'GUID', '', false)
  return normalize_guid(guid)
end
local function find_item(guid)
  for index = 0, reaper.CountMediaItems(0) - 1 do
    local item = reaper.GetMediaItem(0, index)
    if item_guid(item) == guid then
      return item
    end
  end
  return nil
end
local function recording()
  return math.floor(reaper.GetPlayState() / 4) % 2 == 1
end

-- A finite number, or nil.
local function finite(text)
  local value = tonumber(text or '')
  if not value or value ~= value or value == math.huge or value == -math.huge then
    return nil
  end
  return value
end

local function fade_from(text)
  local value = finite(text)
  if not value or value ~= math.floor(value) or value < 0 or value > MAX_FADE_MS then
    return nil
  end
  return value / 1000
end

-- The Cuts track, and whether it carries the key: the keyed one first, then one named Cuts, or nil.
local function find_cuts()
  local named
  for index = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, index)
    local has_key, value = reaper.GetSetMediaTrackInfo_String(track, CUTS_KEY, '', false)
    if has_key and value ~= '' then
      return track, true
    end
    if not named then
      local _, name = reaper.GetTrackName(track)
      if name == CUTS_NAME then
        named = track
      end
    end
  end
  return named, false
end

-- Inside the undo block: the Cuts track found, keyed and muted, or added.
local function ensure_cuts(track, keyed)
  if not track then
    local index = reaper.CountTracks(0)
    reaper.InsertTrackAtIndex(index, false)
    track = reaper.GetTrack(0, index)
    reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', CUTS_NAME, true)
  end
  if not keyed then
    reaper.GetSetMediaTrackInfo_String(track, CUTS_KEY, '1', true)
  end
  if reaper.GetMediaTrackInfo_Value(track, 'B_MUTE') ~= 1 then
    reaper.SetMediaTrackInfo_Value(track, 'B_MUTE', 1)
  end
  return track
end

-- Another item on the track that overlaps first..last; touching is not overlapping.
local function overlapping(track, item, first, last)
  for index = 0, reaper.CountTrackMediaItems(track) - 1 do
    local other = reaper.GetTrackMediaItem(track, index)
    if other ~= item then
      local position = reaper.GetMediaItemInfo_Value(other, 'D_POSITION')
      local ends = position + reaper.GetMediaItemInfo_Value(other, 'D_LENGTH')
      if position < last - EDGE_TOLERANCE and ends > first + EDGE_TOLERANCE then
        return true
      end
    end
  end
  return false
end

-- The items on the track, other than item, that start at or after time: read before any change, since a move reorders
-- the track.
local function items_from(track, item, time)
  local out = {}
  for index = 0, reaper.CountTrackMediaItems(track) - 1 do
    local other = reaper.GetTrackMediaItem(track, index)
    if other ~= item and reaper.GetMediaItemInfo_Value(other, 'D_POSITION') >= time - EDGE_TOLERANCE then
      out[#out + 1] = other
    end
  end
  return out
end

local function delete_range(session_dir, run_id, guid_text, start_text, end_text, mode, fade_text)
  local first_cut, last_cut = finite(start_text), finite(end_text)
  if not first_cut or not last_cut or last_cut - first_cut <= EDGE_TOLERANCE then
    event(session_dir, 'ERROR', run_id, BAD_RANGE)
    return
  end
  if mode ~= 'close' and mode ~= 'gap' then
    event(session_dir, 'ERROR', run_id, 'The cut mode must be close or gap.')
    return
  end
  local fade = fade_from(fade_text)
  if not fade then
    event(session_dir, 'ERROR', run_id, 'The fade must be a whole number of milliseconds from 0 to 500.')
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, 'REAPER is recording. Stop recording first.')
    return
  end
  local needed = { 'SplitMediaItem', 'MoveMediaItemToTrack', 'InsertTrackAtIndex', 'GetSetMediaTrackInfo_String' }
  for _, name in ipairs(needed) do
    if not reaper.APIExists(name) then
      event(session_dir, 'ERROR', run_id, 'This REAPER version cannot cut words and their audio.')
      return
    end
  end
  local wanted = normalize_guid(guid_text)
  local item = wanted ~= '' and find_item(wanted) or nil
  if not item then
    event(session_dir, 'ITEM_STALE', run_id, guid_text, 'item')
    return
  end
  local track = reaper.GetMediaItem_Track(item)
  local cuts, keyed = find_cuts()
  if cuts and track == cuts then
    event(session_dir, 'ERROR', run_id, 'That audio is already on the Cuts track.')
    return
  end
  local first = reaper.GetMediaItemInfo_Value(item, 'D_POSITION')
  local last = first + reaper.GetMediaItemInfo_Value(item, 'D_LENGTH')
  if first_cut < first - EDGE_TOLERANCE or last_cut > last + EDGE_TOLERANCE then
    event(session_dir, 'ERROR', run_id, OUTSIDE)
    return
  end
  local split_start = first_cut - first > EDGE_TOLERANCE
  local split_end = last - last_cut > EDGE_TOLERANCE
  if not split_start then
    first_cut = first
  end
  if not split_end then
    last_cut = last
  end
  if overlapping(track, item, first_cut, last_cut) then
    event(session_dir, 'ERROR', run_id, 'Another item on the track overlaps the range to cut, so nothing was cut.')
    return
  end
  local length = last_cut - first_cut
  local later = mode == 'close' and items_from(track, item, last_cut) or {}

  reaper.Undo_BeginBlock2(0)
  local right = split_end and reaper.SplitMediaItem(item, last_cut) or nil
  local middle, left = item, nil
  if split_start then
    middle, left = reaper.SplitMediaItem(item, first_cut), item
  end
  reaper.MoveMediaItemToTrack(middle, ensure_cuts(cuts, keyed))
  if left then
    reaper.SetMediaItemInfo_Value(left, 'D_FADEOUTLEN', fade)
  end
  if right then
    reaper.SetMediaItemInfo_Value(right, 'D_FADEINLEN', fade)
    if mode == 'close' then
      later[#later + 1] = right
    end
  end
  for _, moved in ipairs(later) do
    reaper.SetMediaItemInfo_Value(moved, 'D_POSITION', reaper.GetMediaItemInfo_Value(moved, 'D_POSITION') - length)
  end
  reaper.Undo_EndBlock2(0, UNDO_DELETE_WORDS, -1)
  reaper.UpdateArrange()
  event(session_dir, 'RANGE_CUT', run_id, left and item_guid(left) or '', item_guid(middle), 1)
end

return function(registry)
  registry.register('delete_range', function(ctx, args)
    delete_range(ctx.session_dir, args[1] or '', args[2] or '', args[3], args[4], args[5], args[6])
  end)
end
