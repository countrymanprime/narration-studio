-- Cut words and their audio (ADR 0860 point 2), and put a saved FX chain on a range of words and take it off again
-- (point 3), over the bridge. Loaded by narration_ui_bridge.lua, which passes the shared helpers as the chunk argument.
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
--
-- apply_fx_range(run, item_guid, start, end, chain, fade_ms) puts one of the narrator's saved chains on start..end of the
-- item. `chain` is a name as list_fx_chains (narration_workspace.lua) lists it: plain folder and file names under
-- <resource path>/FXChains joined by '/', at most four parts, ending .RfxChain. A name with a control character, a
-- backslash, a colon or an empty, '.' or '..' part is refused before any REAPER call; any other name must then be listed
-- in REAPER's own folder listing, part by part, and its file be there, and the path is built here. The command never loads
-- from a path the host sent. (list_fx_chains also stops at 500 chains; a chain past that is accepted here.) In one undo
-- block it splits the item at both ends as delete_range does, adds the chain to the middle piece's active take with
-- TakeFX_AddByName(take, path, -1), and records the chain name and the GUIDs of the FX it added in the take's P_EXT.
-- fade_ms sets the fade at each new seam (the neighbours' and the middle piece's). A chain that adds no FX answers ERROR,
-- saying one Undo rejoins the item when it was split. Answers RANGE_FX_APPLIED|run|middleItemGuid|middleTakeGuid|chain|
-- undoPoints.
--
-- apply_fx_range refuses a take that already carries a range chain, and records in P_EXT the GUIDs of the pieces it
-- split off either side.
--
-- remove_fx_range(run, item_guid, chain) takes the FX that P_EXT records for that chain off the piece, clears the record,
-- and joins the piece to each piece apply_fx_range split off that still carries on its audio: on the same track, touching
-- it, with the same takes (source, rate, volume, FX by name, and an offset that follows on), the same active take, mute and
-- volume, and no chain of its own. A neighbour it did not split is never joined. When REAPER keeps an FX it was asked to
-- delete, the record stays, nothing is joined, and the answer is ERROR. The join lengthens the first piece over the others (D_LENGTH, keeping the last piece's
-- fade-out) and deletes the pieces it folded in, whose audio the kept piece now plays, in one undo block. Answers
-- RANGE_FX_REMOVED|run|itemGuid|chain|undoPoints: the item that remains, and 0 with no block when the piece no longer
-- carries that chain or any FX of it.
--
-- Not run in REAPER (pending the QA pass, #1495): whether TakeFX_AddByName loads a .RfxChain onto a take with the full
-- path and appends its FX at the end, whether a split copies a take's P_EXT and gives the copied FX new GUIDs, and
-- whether the splits and the load, and the removal and the join, are each one undo step.

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
local BAD_FADE = 'The fade must be a whole number of milliseconds from 0 to 500.'
local RECORDING = 'REAPER is recording. Stop recording first.'

local UNDO_ADD_CHAIN = 'Narration Utils: add chain to range'
local UNDO_REMOVE_CHAIN = 'Narration Utils: remove chain from range'
-- The take P_EXT keys apply_fx_range writes: the chain's name, and the GUIDs of the FX it added, space-separated.
local CHAIN_KEY = 'P_EXT:narration_utils_fx_range_chain'
local CHAIN_FX_KEY = 'P_EXT:narration_utils_fx_range_fx'
-- The GUIDs of the pieces apply_fx_range split off either side, '-' for none: the only items remove_fx_range joins back.
local CHAIN_SEAMS_KEY = 'P_EXT:narration_utils_fx_range_seams'
-- list_fx_chains' depth: a chain at most three folders under FXChains (narration_workspace.lua's CHAIN_DEPTH_LIMIT).
local CHAIN_PARTS_LIMIT = 4
local BAD_CHAIN = 'That FX chain is not in the FXChains folder REAPER lists.'
local CHAIN_BAD_RANGE = 'The range for the chain is not a usable pair of times.'
local CHAIN_OUTSIDE = 'The range for the chain is not inside that item.'

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

-- The parts of a name list_fx_chains could list, or nil. Pure Lua: it runs before any REAPER call.
local function chain_parts(name)
  if name == '' or name:find('[%c\\:]') or not name:lower():match('%.rfxchain$') then
    return nil
  end
  local parts = {}
  for part in (name .. '/'):gmatch('(.-)/') do
    if part == '' or part == '.' or part == '..' then
      return nil
    end
    parts[#parts + 1] = part
  end
  if #parts > CHAIN_PARTS_LIMIT then
    return nil
  end
  return parts
end

-- Whether REAPER's listing of directory holds name exactly; index -1 first clears REAPER's cached listing, as
-- list_fx_chains does.
local function listed(enumerate, directory, name)
  enumerate(directory, -1)
  local index = 0
  while true do
    local found = enumerate(directory, index)
    if not found or found == '' then
      return false
    end
    if found == name then
      return true
    end
    index = index + 1
  end
end

-- The full path of the chain the parts name, built from REAPER's resource path, or nil unless each folder and the file
-- are in REAPER's own listing and the file is there.
local function chain_path(parts)
  local path = core.join(reaper.GetResourcePath(), 'FXChains')
  for index, part in ipairs(parts) do
    local enumerate = index == #parts and reaper.EnumerateFiles or reaper.EnumerateSubdirectories
    if not listed(enumerate, path, part) then
      return nil
    end
    path = core.join(path, part)
  end
  return core.file_exists(path) and path or nil
end

local function take_guid(take)
  local _, guid = reaper.GetSetMediaItemTakeInfo_String(take, 'GUID', '', false)
  return normalize_guid(guid)
end
local function take_ext(take, key)
  local _, value = reaper.GetSetMediaItemTakeInfo_String(take, key, '', false)
  return value or ''
end

local function apply_fx_range(session_dir, run_id, guid_text, start_text, end_text, name, fade_text)
  local parts = chain_parts(name)
  if not parts then
    event(session_dir, 'ERROR', run_id, BAD_CHAIN)
    return
  end
  local first_fx, last_fx = finite(start_text), finite(end_text)
  if not first_fx or not last_fx or last_fx - first_fx <= EDGE_TOLERANCE then
    event(session_dir, 'ERROR', run_id, CHAIN_BAD_RANGE)
    return
  end
  local fade = fade_from(fade_text)
  if not fade then
    event(session_dir, 'ERROR', run_id, BAD_FADE)
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local needed = { 'SplitMediaItem', 'TakeFX_AddByName', 'TakeFX_GetCount', 'TakeFX_GetFXGUID', 'EnumerateFiles', 'EnumerateSubdirectories' }
  for _, api in ipairs(needed) do
    if not reaper.APIExists(api) then
      event(session_dir, 'ERROR', run_id, 'This REAPER version cannot put an FX chain on a range.')
      return
    end
  end
  local path = chain_path(parts)
  if not path then
    event(session_dir, 'ERROR', run_id, BAD_CHAIN)
    return
  end
  local wanted = normalize_guid(guid_text)
  local item = nil
  if wanted ~= '' then
    item = find_item(wanted)
  end
  if not item then
    event(session_dir, 'ITEM_STALE', run_id, guid_text, 'item')
    return
  end
  local active = reaper.GetActiveTake(item)
  if not active then
    event(session_dir, 'ERROR', run_id, 'That item has no take to put the chain on.')
    return
  end
  local first = reaper.GetMediaItemInfo_Value(item, 'D_POSITION')
  local last = first + reaper.GetMediaItemInfo_Value(item, 'D_LENGTH')
  if first_fx < first - EDGE_TOLERANCE or last_fx > last + EDGE_TOLERANCE then
    event(session_dir, 'ERROR', run_id, CHAIN_OUTSIDE)
    return
  end
  -- A second chain on a take that carries one would overwrite its record, and its FX could not be taken off again.
  if take_ext(active, CHAIN_KEY) ~= '' then
    event(session_dir, 'ERROR', run_id, 'Those words already have a chain on them. Take it off first.')
    return
  end
  local split_start = first_fx - first > EDGE_TOLERANCE
  local split_end = last - last_fx > EDGE_TOLERANCE

  reaper.PreventUIRefresh(1)
  reaper.Undo_BeginBlock2(0)
  local middle, left, right, splits, failure = item, nil, nil, 0, nil
  if split_end then
    right = reaper.SplitMediaItem(item, last_fx)
    splits = splits + (right and 1 or 0)
    failure = not right and 'REAPER could not split the item.' or nil
  end
  if not failure and split_start then
    middle = reaper.SplitMediaItem(item, first_fx)
    left = middle and item or nil
    splits = splits + (middle and 1 or 0)
    failure = not middle and 'REAPER could not split the item.' or nil
  end
  local take = nil
  if not failure then
    take = reaper.GetActiveTake(middle)
    local before = reaper.TakeFX_GetCount(take)
    local index = reaper.TakeFX_AddByName(take, path, -1)
    local count = reaper.TakeFX_GetCount(take)
    if index < 0 or count <= before then
      failure = 'REAPER did not load the FX chain.'
    else
      local guids = {}
      for fx = before, count - 1 do
        guids[#guids + 1] = reaper.TakeFX_GetFXGUID(take, fx) or ''
      end
      reaper.GetSetMediaItemTakeInfo_String(take, CHAIN_KEY, name, true)
      reaper.GetSetMediaItemTakeInfo_String(take, CHAIN_FX_KEY, table.concat(guids, ' '), true)
      local seams = (left and item_guid(left) or '-') .. ' ' .. (right and item_guid(right) or '-')
      reaper.GetSetMediaItemTakeInfo_String(take, CHAIN_SEAMS_KEY, seams, true)
      for _, seam in ipairs({ { left, 'D_FADEOUTLEN', 'D_FADEINLEN' }, { right, 'D_FADEINLEN', 'D_FADEOUTLEN' } }) do
        local neighbour, its_edge, middle_edge = seam[1], seam[2], seam[3]
        if neighbour then
          reaper.SetMediaItemInfo_Value(neighbour, its_edge, fade)
          reaper.SetMediaItemInfo_Value(middle, middle_edge, fade)
        end
      end
    end
  end
  reaper.Undo_EndBlock2(0, UNDO_ADD_CHAIN, -1)
  reaper.PreventUIRefresh(-1)
  reaper.UpdateArrange()
  if failure then
    if splits > 0 then
      failure = failure .. ' The item was split: press Undo in REAPER to rejoin it.'
    end
    event(session_dir, 'ERROR', run_id, failure)
    return
  end
  event(session_dir, 'RANGE_FX_APPLIED', run_id, item_guid(middle), take_guid(take), name, 1)
end

-- An item as a join compares it: per take its source file, rate, offset, volume and FX names, plus the active take's index,
-- whether any take carries a range chain, and the item's mute and volume.
local function takes_of(item)
  local takes, active, carries = {}, reaper.GetActiveTake(item), false
  local active_index = -1
  for index = 0, reaper.CountTakes(item) - 1 do
    local take = reaper.GetTake(item, index)
    if take == active then
      active_index = index
    end
    if take_ext(take, CHAIN_KEY) ~= '' then
      carries = true
    end
    local fx = {}
    for slot = 0, reaper.TakeFX_GetCount(take) - 1 do
      local _, fx_name = reaper.TakeFX_GetFXName(take, slot, '')
      fx[#fx + 1] = fx_name or ''
    end
    takes[#takes + 1] = {
      file = reaper.GetMediaSourceFileName(reaper.GetMediaItemTake_Source(take), ''),
      rate = reaper.GetMediaItemTakeInfo_Value(take, 'D_PLAYRATE'),
      offset = reaper.GetMediaItemTakeInfo_Value(take, 'D_STARTOFFS'),
      vol = reaper.GetMediaItemTakeInfo_Value(take, 'D_VOL'),
      fx = table.concat(fx, '\0'),
    }
  end
  return {
    takes = takes,
    active = active_index,
    carries = carries,
    muted = reaper.GetMediaItemInfo_Value(item, 'B_MUTE'),
    vol = reaper.GetMediaItemInfo_Value(item, 'D_VOL'),
  }
end

-- Whether b carries on a's audio from where a ends, with nothing set differently, so the two can be one item.
local function follows(a_item, b_item)
  local a, b = takes_of(a_item), takes_of(b_item)
  local length = reaper.GetMediaItemInfo_Value(a_item, 'D_LENGTH')
  local a_end = reaper.GetMediaItemInfo_Value(a_item, 'D_POSITION') + length
  if math.abs(reaper.GetMediaItemInfo_Value(b_item, 'D_POSITION') - a_end) > EDGE_TOLERANCE then
    return false
  end
  if a.carries or b.carries or a.active ~= b.active or a.muted ~= b.muted or a.vol ~= b.vol or #a.takes ~= #b.takes then
    return false
  end
  for index, take in ipairs(a.takes) do
    local other = b.takes[index]
    if take.file ~= other.file or take.rate ~= other.rate or take.vol ~= other.vol or take.fx ~= other.fx then
      return false
    end
    if math.abs(take.offset + length * take.rate - other.offset) > EDGE_TOLERANCE then
      return false
    end
  end
  return true
end

-- The piece apply_fx_range split off on one side (recorded by GUID in seams), when it is still on the piece's track and
-- carries on the same audio; else nil. A neighbour this command did not split is never joined.
local function joinable(piece, seams, before)
  local left, right = seams:match('^(%S+) (%S+)$')
  local wanted = before and left or right
  local other = wanted and wanted ~= '-' and find_item(normalize_guid(wanted)) or nil
  if not other or reaper.GetMediaItem_Track(other) ~= reaper.GetMediaItem_Track(piece) then
    return nil
  end
  if before then
    return follows(other, piece) and other or nil
  end
  return follows(piece, other) and other or nil
end

local function remove_fx_range(session_dir, run_id, guid_text, name)
  if not chain_parts(name) then
    event(session_dir, 'ERROR', run_id, BAD_CHAIN)
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local needed = { 'TakeFX_Delete', 'TakeFX_GetFXGUID', 'TakeFX_GetFXName', 'TakeFX_GetCount', 'DeleteTrackMediaItem' }
  for _, api in ipairs(needed) do
    if not reaper.APIExists(api) then
      event(session_dir, 'ERROR', run_id, 'This REAPER version cannot take an FX chain off a range.')
      return
    end
  end
  local wanted = normalize_guid(guid_text)
  local piece = wanted ~= '' and find_item(wanted) or nil
  if not piece then
    event(session_dir, 'ITEM_STALE', run_id, guid_text, 'item')
    return
  end
  local take = nil
  for index = 0, reaper.CountTakes(piece) - 1 do
    local candidate = reaper.GetTake(piece, index)
    if take_ext(candidate, CHAIN_KEY) == name then
      take = candidate
      break
    end
  end
  -- The 0-based indices, highest first, of the FX the record names that are still on the take.
  local doomed = {}
  if take then
    local recorded = {}
    for guid in take_ext(take, CHAIN_FX_KEY):gmatch('%S+') do
      recorded[guid] = true
    end
    for fx = reaper.TakeFX_GetCount(take) - 1, 0, -1 do
      if recorded[reaper.TakeFX_GetFXGUID(take, fx) or ''] then
        doomed[#doomed + 1] = fx
      end
    end
  end
  if #doomed == 0 then
    event(session_dir, 'RANGE_FX_REMOVED', run_id, item_guid(piece), name, 0)
    return
  end

  reaper.PreventUIRefresh(1)
  reaper.Undo_BeginBlock2(0)
  local kept = 0
  for _, fx in ipairs(doomed) do
    if not reaper.TakeFX_Delete(take, fx) then
      kept = kept + 1
    end
  end
  if kept > 0 then
    -- The record stays, so the FX REAPER kept can be taken off again; nothing is joined.
    reaper.Undo_EndBlock2(0, UNDO_REMOVE_CHAIN, -1)
    reaper.PreventUIRefresh(-1)
    reaper.UpdateArrange()
    event(session_dir, 'ERROR', run_id, 'REAPER did not take off every FX of the chain. Press Undo in REAPER to put back what it took off.')
    return
  end
  local seams = take_ext(take, CHAIN_SEAMS_KEY)
  for _, key in ipairs({ CHAIN_KEY, CHAIN_FX_KEY, CHAIN_SEAMS_KEY }) do
    reaper.GetSetMediaItemTakeInfo_String(take, key, '', true)
  end
  local left, right = joinable(piece, seams, true), joinable(piece, seams, false)
  local keep, last = left or piece, right or piece
  if keep ~= last then
    local track = reaper.GetMediaItem_Track(piece)
    local first = reaper.GetMediaItemInfo_Value(keep, 'D_POSITION')
    local ends = reaper.GetMediaItemInfo_Value(last, 'D_POSITION') + reaper.GetMediaItemInfo_Value(last, 'D_LENGTH')
    local fadeout = reaper.GetMediaItemInfo_Value(last, 'D_FADEOUTLEN')
    if left then
      reaper.DeleteTrackMediaItem(track, piece)
    end
    if right then
      reaper.DeleteTrackMediaItem(track, right)
    end
    reaper.SetMediaItemInfo_Value(keep, 'D_LENGTH', ends - first)
    reaper.SetMediaItemInfo_Value(keep, 'D_FADEOUTLEN', fadeout)
  end
  reaper.Undo_EndBlock2(0, UNDO_REMOVE_CHAIN, -1)
  reaper.PreventUIRefresh(-1)
  reaper.UpdateArrange()
  event(session_dir, 'RANGE_FX_REMOVED', run_id, item_guid(keep), name, 1)
end

return function(registry)
  registry.register('delete_range', function(ctx, args)
    delete_range(ctx.session_dir, args[1] or '', args[2] or '', args[3], args[4], args[5], args[6])
  end)
  registry.register('apply_fx_range', function(ctx, args)
    apply_fx_range(ctx.session_dir, args[1] or '', args[2] or '', args[3], args[4], args[5] or '', args[6])
  end)
  registry.register('remove_fx_range', function(ctx, args)
    remove_fx_range(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '')
  end)
end
