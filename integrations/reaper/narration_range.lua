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
-- Two arguments follow fade_ms (SN-E97); omitted or empty, the command does what it did before them. pad (seconds, 0 to
-- 0.5) cuts that much less at each end of the range, so the cut is start + pad to end - pad. room_tone ('1'; gap mode only)
-- fills the gap the cut leaves with the chapter's room tone instead of silence: the first region named "Room tone" (any
-- case) that lies inside one item on the cut item's track and clear of the cut. Copies of that stretch, each a new item
-- whose take opens the same file the marked item plays (a path read from the project, never sent by the host), are laid
-- end to end across the gap with the seam fade at each edge and P_EXT:narration_utils_room_tone set, in the same undo block.
-- With no such region, the command refuses and cuts nothing. The answer is RANGE_CUT as above.
--
-- The bridge splits a command line into at most eight fields and the last keeps the rest, so pad and room_tone arrive in
-- the fade's field as fade|pad|room_tone. The host sends them only when it asks for either, so a script older than them
-- reads that field as a fade that is not a number and refuses, cutting nothing, rather than cutting without them.
--
-- Not run in REAPER (pending the QA pass, #1495): whether a take on a new item plays a source opened from the same file
-- at the offset set, and whether the room-tone items are in the cut's one undo step.
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
--
-- reduce_range_gain(run, item_guid, take_guid, reduce_db, stretches) lowers stretches of the item's active take by reduce_db
-- (1 to 24) with points on the take's volume envelope, leaving the source file, the item and every other item as they were:
-- Clean up's Breaths, Plosives and Noise (SN-E100). stretches is 'start:end' pairs in the take's source seconds, joined by
-- ',' (at most 500, plain decimals only). With the playback rate at 1, a stretch's envelope time is its source time less the
-- take's D_STARTOFFS; a stretch outside 0..the item's length is one the app read before the item changed, so it answers
-- ITEM_STALE|run|guid|item, as a GUID that does not resolve does (reason item or take). Stretches whose GAIN_RAMP ramps would
-- meet are made one. In one undo block it makes the take a volume envelope when it has none (action 40693 on the item alone,
-- the item selection put back after) and adds four linear points per stretch: the level the envelope held GAIN_RAMP before the
-- start, that level lowered at the start and at the end, and the level GAIN_RAMP after (none outside the item). A take that is
-- not the active one, a MIDI take, a changed playback rate, a take whose envelope already has a point where a stretch would be
-- lowered, and recording are refused before any change. Answers RANGE_GAIN_REDUCED|run|itemGuid|takeGuid|stretches|reduceDb|
-- undoPoints.
--
-- Not run in REAPER (pending the QA pass, #1495): whether action 40693 makes a visible take volume envelope on the selected
-- item's active take, whether the envelope's point times are seconds from the item's start, what GetEnvelopeScalingMode answers
-- for it, that the edges do not click, and that one Undo removes the points and the envelope.
--
-- repair_click(run, item_guid, take_guid, clicks) smooths short clicks in the item's active take with a dip on the take's
-- volume envelope, leaving the source file, the item and every other item as they were: Clean up's Clicks (SN-E101).
-- REAPER's own Repair Pops/Clicks is a dialog the narrator works, so this is the stock means a command can use. clicks is
-- 'start:end' pairs in the take's source seconds, joined by ',' (at most 500, each at most 50 ms, plain decimals only),
-- mapped to envelope time as reduce_range_gain maps a stretch, with the same ITEM_STALE answers. Clicks whose CLICK_RAMP ramps
-- would meet are made one. In one undo block it makes the take a volume envelope when it has none (as reduce_range_gain) and
-- adds four linear points per click: the level the envelope held CLICK_RAMP before it, that level lowered by CLICK_DIP_DB at
-- the click's start and end, and the level CLICK_RAMP after (none outside the item). The same refusals as reduce_range_gain
-- come before any change. Answers CLICKS_REPAIRED|run|itemGuid|takeGuid|clicks|undoPoints.
--
-- Not run in REAPER (pending the QA pass, #1495): as reduce_range_gain, and that a click dipped by CLICK_DIP_DB is no longer
-- heard and the dip itself is not.
--
-- fx_range_params(run, item_guid, take_guid, chain), fx_range_set_param(run, item_guid, take_guid, chain, fx, param|value) and
-- fx_range_bypass(run, item_guid, take_guid, chain, on) read and change the chain apply_fx_range put on a piece (SN-E104).
-- item_guid and take_guid are as apply_fx_range answered them; an empty take_guid is the piece's take that carries the chain.
-- The take must carry that chain in its P_EXT and still hold every FX the record names, else ITEM_STALE|run|guid|item, take
-- or fx and nothing changes. The chain's FX are numbered in the order the record names them, so an FX the narrator added is
-- never read or changed. fx_range_params answers RANGE_FX_PARAM|run|fx|fxName|param|name|value|min|max|step|formatted per
-- setting (at most MAX_FX_PARAMS; step 0 when continuous), then RANGE_FX_PARAMS|run|itemGuid|takeGuid|chain|count|truncated|
-- bypassed. fx_range_set_param sets one setting to a value inside its range in one undo block and answers RANGE_FX_PARAM_SET|
-- run|itemGuid|takeGuid|fx|param|value|formatted|undoPoints with the value REAPER holds; fx_range_bypass ('1' bypass, '0' on)
-- switches every FX of the chain in one undo block and answers RANGE_FX_BYPASSED|run|itemGuid|takeGuid|chain|bypassed|
-- undoPoints. Neither opens a block when nothing needs changing (undoPoints 0); both refuse while recording.
--
-- Not run in REAPER (pending the QA pass, #1495): whether TakeFX_GetParam's bounds are the plug-in's units, whether a
-- parameter change and a bypass are each one undo step that Undo reverses, and that both are heard.

local core = ...
local event = core.event

local UNDO_DELETE_WORDS = 'Narration Utils: delete words'
-- The Cuts track's key and name. The key is what the bridge looks for; the name is what the narrator sees.
local CUTS_KEY = 'P_EXT:narration_utils_cuts'
local CUTS_NAME = 'Cuts'
local MAX_FADE_MS = 500
-- How far outside an item's bounds a range may fall and still count as inside it, and how close to an edge a range end
-- counts as that edge (float rounding of position maths), matching narration_navigation.lua.
local EDGE_TOLERANCE = 0.000001

local BAD_RANGE = 'The range to cut is not a usable pair of times.'
local OUTSIDE = 'The range to cut is not inside that item.'
local BAD_FADE = 'The fade must be a whole number of milliseconds from 0 to 500.'
local RECORDING = 'REAPER is recording. Stop recording first.'

local MAX_PAD = 0.5
-- The item P_EXT key a room-tone piece carries, the region name that marks the room tone, and the most pieces one gap
-- takes: a stretch so short that the gap needs more is refused rather than laid as hundreds of items.
local ROOM_TONE_KEY = 'P_EXT:narration_utils_room_tone'
local ROOM_TONE_REGION = 'room tone'
local MAX_ROOM_TONE_PIECES = 64
local BAD_PAD = 'The pad must be from 0 to 500 milliseconds.'
local NO_ROOM_TONE = 'This chapter has no room tone marked in REAPER. Mark a stretch of room tone on its track with a region named Room tone.'

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

-- The pad in seconds: 0 when omitted or empty, nil when it is not a number from 0 to MAX_PAD.
local function pad_from(text)
  if text == nil or text == '' then
    return 0
  end
  local value = finite(text)
  if not value or value < 0 or value > MAX_PAD + EDGE_TOLERANCE then
    return nil
  end
  return value
end

-- The room tone for a cut of first..last on track: the first region named Room tone that lies inside one audio item on the
-- track, as { file, offset, rate, length }, or nil and the sentence to refuse with. Reads only.
local function find_room_tone(track, first, last)
  local index, overlaps = 0, false
  while true do
    local found, is_region, start, ends, name = reaper.EnumProjectMarkers3(0, index)
    if not found or found == 0 then
      break
    end
    index = index + 1
    local label = tostring(name or ''):lower():gsub('^%s+', ''):gsub('%s+$', '')
    if is_region and label == ROOM_TONE_REGION and ends - start > EDGE_TOLERANCE then
      if start < last - EDGE_TOLERANCE and ends > first + EDGE_TOLERANCE then
        overlaps = true
      else
        for slot = 0, reaper.CountTrackMediaItems(track) - 1 do
          local item = reaper.GetTrackMediaItem(track, slot)
          local position = reaper.GetMediaItemInfo_Value(item, 'D_POSITION')
          local item_end = position + reaper.GetMediaItemInfo_Value(item, 'D_LENGTH')
          local take = reaper.GetActiveTake(item)
          if take and not reaper.TakeIsMIDI(take) and start >= position - EDGE_TOLERANCE and ends <= item_end + EDGE_TOLERANCE then
            local rate = reaper.GetMediaItemTakeInfo_Value(take, 'D_PLAYRATE')
            return {
              file = reaper.GetMediaSourceFileName(reaper.GetMediaItemTake_Source(take), ''),
              offset = reaper.GetMediaItemTakeInfo_Value(take, 'D_STARTOFFS') + (start - position) * rate,
              rate = rate,
              length = ends - start,
            }
          end
        end
      end
    end
  end
  if overlaps then
    return nil, 'The room tone region overlaps the words to cut. Mark room tone elsewhere on the track.'
  end
  return nil, NO_ROOM_TONE
end

-- The pieces of room tone a gap of first..last takes, as { position, length }, or nil when it needs more than
-- MAX_ROOM_TONE_PIECES.
local function room_tone_spans(tone, first, last)
  local spans, at = {}, first
  while last - at > EDGE_TOLERANCE do
    if #spans == MAX_ROOM_TONE_PIECES then
      return nil
    end
    spans[#spans + 1] = { at, math.min(tone.length, last - at) }
    at = at + tone.length
  end
  return spans
end

-- One source per piece, opened from the room tone's file before any change: a take owns its source. nil, having let go of
-- every source it opened, when REAPER cannot open one.
local function open_sources(tone, count)
  local sources = {}
  for index = 1, count do
    local source = reaper.PCM_Source_CreateFromFile(tone.file)
    if not source then
      for _, opened in ipairs(sources) do
        reaper.PCM_Source_Destroy(opened)
      end
      return nil
    end
    sources[index] = source
  end
  return sources
end

-- Inside the undo block: a room-tone item per span on track, each playing its source from the room tone's offset.
local function lay_room_tone(track, tone, spans, sources, fade)
  for index, at in ipairs(spans) do
    local piece = reaper.AddMediaItemToTrack(track)
    reaper.SetMediaItemInfo_Value(piece, 'D_POSITION', at[1])
    reaper.SetMediaItemInfo_Value(piece, 'D_LENGTH', at[2])
    local take = reaper.AddTakeToMediaItem(piece)
    reaper.SetMediaItemTake_Source(take, sources[index])
    reaper.SetMediaItemTakeInfo_Value(take, 'D_STARTOFFS', tone.offset)
    if tone.rate ~= 1 then
      reaper.SetMediaItemTakeInfo_Value(take, 'D_PLAYRATE', tone.rate)
    end
    reaper.SetMediaItemInfo_Value(piece, 'D_FADEINLEN', math.min(fade, at[2] / 2))
    reaper.SetMediaItemInfo_Value(piece, 'D_FADEOUTLEN', math.min(fade, at[2] / 2))
    reaper.GetSetMediaItemInfo_String(piece, ROOM_TONE_KEY, '1', true)
  end
end

local function delete_range(session_dir, run_id, guid_text, start_text, end_text, mode, fade_text, pad_text, tone_text)
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
  local pad = pad_from(pad_text)
  if not pad then
    event(session_dir, 'ERROR', run_id, BAD_PAD)
    return
  end
  if tone_text ~= nil and tone_text ~= '' and tone_text ~= '0' and tone_text ~= '1' then
    event(session_dir, 'ERROR', run_id, 'The room tone choice must be 0 or 1.')
    return
  end
  local with_tone = tone_text == '1'
  if with_tone and mode ~= 'gap' then
    event(session_dir, 'ERROR', run_id, 'Room tone fills a gap that keeps its length, so it needs the gap mode.')
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
  if with_tone then
    local tone_needed = { 'EnumProjectMarkers3', 'AddMediaItemToTrack', 'AddTakeToMediaItem', 'PCM_Source_CreateFromFile', 'SetMediaItemTake_Source' }
    for _, api in ipairs(tone_needed) do
      if not reaper.APIExists(api) then
        event(session_dir, 'ERROR', run_id, 'This REAPER version cannot fill a cut with room tone.')
        return
      end
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
  first_cut, last_cut = first_cut + pad, last_cut - pad
  if last_cut - first_cut <= EDGE_TOLERANCE then
    event(session_dir, 'ERROR', run_id, 'The pad leaves nothing to cut.')
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
  local tone, spans, sources = nil, {}, {}
  if with_tone then
    local refusal
    tone, refusal = find_room_tone(track, first_cut, last_cut)
    if not tone then
      event(session_dir, 'ERROR', run_id, refusal)
      return
    end
    spans = room_tone_spans(tone, first_cut, last_cut)
    if not spans then
      event(session_dir, 'ERROR', run_id, 'The marked room tone is too short to fill that gap.')
      return
    end
    sources = open_sources(tone, #spans)
    if not sources then
      event(session_dir, 'ERROR', run_id, 'REAPER could not open the room tone audio.')
      return
    end
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
  if tone then
    lay_room_tone(track, tone, spans, sources, fade)
  end
  reaper.Undo_EndBlock2(0, UNDO_DELETE_WORDS, -1)
  reaper.UpdateArrange()
  event(session_dir, 'RANGE_CUT', run_id, left and item_guid(left) or '', item_guid(middle), 1)
end

-- delete_range's last field: fade_ms, or fade_ms|pad|room_tone. More parts than that leave the whole field as the fade,
-- which then refuses.
local function cut_tail(field)
  local parts = {}
  for part in ((field or '') .. '|'):gmatch('(.-)|') do
    parts[#parts + 1] = part
  end
  if #parts > 3 then
    return field
  end
  return parts[1], parts[2], parts[3]
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

-- reduce_range_gain ------------------------------------------------------------------------------------------------

local UNDO_REDUCE_GAIN = 'Narration Utils: lower stretches'
local REDUCE_GAIN_UNREADABLE = 'The stretches to lower are not readable, so nothing changed.'
local BAD_REDUCTION = 'The reduction must be from 1 to 24 dB.'
local MIN_REDUCE_DB, MAX_REDUCE_DB = 1, 24
local MAX_GAIN_STRETCHES = 500
-- The ramp, in seconds, outside each edge of a stretch, from the take's level to the lowered level and back.
local GAIN_RAMP = 0.01
-- "Take: Toggle take volume envelope", run on the item alone when its take has no volume envelope yet.
local TOGGLE_TAKE_VOLUME_ENVELOPE = 40693
local GAIN_NEEDED = {
  'GetTakeEnvelopeByName',
  'GetEnvelopeScalingMode',
  'ScaleToEnvelopeMode',
  'ScaleFromEnvelopeMode',
  'Envelope_Evaluate',
  'CountEnvelopePoints',
  'GetEnvelopePoint',
  'InsertEnvelopePoint',
  'Envelope_SortPoints',
}

local function take_guid(take)
  local _, guid = reaper.GetSetMediaItemTakeInfo_String(take, 'GUID', '', false)
  return normalize_guid(guid)
end

-- A plain decimal number of seconds ('12', '12.5'), or nil: no sign, exponent, hex, nan or inf.
local function plain_seconds(text)
  if not text:match('^%d+$') and not text:match('^%d+%.%d+$') then
    return nil
  end
  return tonumber(text)
end

-- 'start:end,start:end' as { { start, end } } in the order given, or nil when any pair is not two plain times with
-- start before end, and false when there are more than MAX_GAIN_STRETCHES.
local function stretches_from(text)
  local out = {}
  for part in (text .. ','):gmatch('([^,]*),') do
    local first_text, last_text = part:match('^([^:]+):([^:]+)$')
    local first, last = plain_seconds(first_text or ''), plain_seconds(last_text or '')
    if not first or not last or last - first <= EDGE_TOLERANCE then
      return nil
    end
    out[#out + 1] = { first, last }
  end
  if #out > MAX_GAIN_STRETCHES then
    return false
  end
  return out
end

-- The stretches in item time (source time less the take's offset), sorted, with any two whose ramps would meet made one.
local function item_stretches(stretches, offset)
  local sorted = {}
  for _, stretch in ipairs(stretches) do
    sorted[#sorted + 1] = { stretch[1] - offset, stretch[2] - offset }
  end
  table.sort(sorted, function(a, b)
    return a[1] < b[1]
  end)
  local merged = {}
  for _, stretch in ipairs(sorted) do
    local previous = merged[#merged]
    if previous and stretch[1] - GAIN_RAMP <= previous[2] + GAIN_RAMP + EDGE_TOLERANCE then
      previous[2] = math.max(previous[2], stretch[2])
    else
      merged[#merged + 1] = { stretch[1], stretch[2] }
    end
  end
  return merged
end

-- Whether the envelope already has a point from first to last.
local function has_point_within(env, first, last)
  for index = 0, reaper.CountEnvelopePoints(env) - 1 do
    local _, time = reaper.GetEnvelopePoint(env, index)
    if time >= first - EDGE_TOLERANCE and time <= last + EDGE_TOLERANCE then
      return true
    end
  end
  return false
end

-- Makes the active take of item a volume envelope with the action, on the item alone, then puts the item selection back.
local function make_volume_envelope(item, take)
  local selected = {}
  for index = 0, reaper.CountSelectedMediaItems(0) - 1 do
    selected[#selected + 1] = reaper.GetSelectedMediaItem(0, index)
  end
  reaper.SelectAllMediaItems(0, false)
  reaper.SetMediaItemSelected(item, true)
  reaper.Main_OnCommand(TOGGLE_TAKE_VOLUME_ENVELOPE, 0)
  reaper.SetMediaItemSelected(item, false)
  for _, other in ipairs(selected) do
    reaper.SetMediaItemSelected(other, true)
  end
  return reaper.GetTakeEnvelopeByName(take, 'Volume')
end

local function reduce_range_gain(session_dir, run_id, item_text, take_text, db_text, stretches_text)
  local db = finite(db_text)
  if not db or db < MIN_REDUCE_DB or db > MAX_REDUCE_DB then
    event(session_dir, 'ERROR', run_id, BAD_REDUCTION)
    return
  end
  local stretches = stretches_from(stretches_text or '')
  if stretches == false then
    event(session_dir, 'ERROR', run_id, 'A take can have at most 500 stretches lowered at once, so nothing changed.')
    return
  end
  if not stretches then
    event(session_dir, 'ERROR', run_id, REDUCE_GAIN_UNREADABLE)
    return
  end
  for _, call in ipairs(GAIN_NEEDED) do
    if not reaper.APIExists(call) then
      event(session_dir, 'ERROR', run_id, 'This REAPER version cannot lower a stretch of a take.')
      return
    end
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local wanted_item, wanted_take = normalize_guid(item_text), normalize_guid(take_text)
  local item = wanted_item ~= '' and find_item(wanted_item) or nil
  if not item then
    event(session_dir, 'ITEM_STALE', run_id, item_text, 'item')
    return
  end
  local take
  for index = 0, reaper.CountTakes(item) - 1 do
    local candidate = reaper.GetTake(item, index)
    if candidate and wanted_take ~= '' and take_guid(candidate) == wanted_take then
      take = candidate
    end
  end
  if not take then
    event(session_dir, 'ITEM_STALE', run_id, take_text, 'take')
    return
  end
  local function refuse(sentence)
    event(session_dir, 'ERROR', run_id, sentence)
  end
  if reaper.GetActiveTake(item) ~= take then
    return refuse('That is not the take the item plays, so nothing was lowered.')
  end
  if reaper.TakeIsMIDI(take) then
    return refuse('A MIDI take has no audio to lower.')
  end
  if reaper.GetMediaItemTakeInfo_Value(take, 'D_PLAYRATE') ~= 1 then
    return refuse('A take with a changed playback rate cannot have a stretch lowered.')
  end
  local length = reaper.GetMediaItemInfo_Value(item, 'D_LENGTH')
  local spans = item_stretches(stretches, reaper.GetMediaItemTakeInfo_Value(take, 'D_STARTOFFS'))
  -- A stretch the item no longer plays is one the app read before the item was trimmed or its take moved.
  for _, span in ipairs(spans) do
    if span[1] < -EDGE_TOLERANCE or span[2] > length + EDGE_TOLERANCE then
      event(session_dir, 'ITEM_STALE', run_id, item_guid(item), 'item')
      return
    end
  end
  local env = reaper.GetTakeEnvelopeByName(take, 'Volume')
  if env then
    for _, span in ipairs(spans) do
      if has_point_within(env, span[1] - GAIN_RAMP, span[2] + GAIN_RAMP) then
        return refuse('That take already has volume changes where a stretch would be lowered, so nothing was lowered.')
      end
    end
  end

  local gain = 10 ^ (-db / 20)
  reaper.Undo_BeginBlock2(0)
  if not env then
    env = make_volume_envelope(item, take)
  end
  if env then
    local mode = reaper.GetEnvelopeScalingMode(env)
    -- Every value is read before any point is added, so each one scales the take's level as it was.
    local planned = {}
    local function plan(time, factor)
      local _, value = reaper.Envelope_Evaluate(env, time, 0, 0)
      local amplitude = reaper.ScaleFromEnvelopeMode(mode, value) * factor
      planned[#planned + 1] = { time, reaper.ScaleToEnvelopeMode(mode, amplitude) }
    end
    for _, span in ipairs(spans) do
      local first, last = math.max(span[1], 0), math.min(span[2], length)
      if first > EDGE_TOLERANCE then
        plan(math.max(first - GAIN_RAMP, 0), 1)
      end
      plan(first, gain)
      plan(last, gain)
      if last < length - EDGE_TOLERANCE then
        plan(math.min(last + GAIN_RAMP, length), 1)
      end
    end
    for _, point in ipairs(planned) do
      reaper.InsertEnvelopePoint(env, point[1], point[2], 0, 0, false, true)
    end
    reaper.Envelope_SortPoints(env)
  end
  reaper.UpdateItemInProject(item)
  -- No envelope means nothing changed, so the block is closed with no description and records no undo point.
  reaper.Undo_EndBlock2(0, env and UNDO_REDUCE_GAIN or '', -1)
  reaper.UpdateArrange()
  if not env then
    return refuse('REAPER did not make a volume envelope for that take, so nothing was lowered.')
  end
  event(session_dir, 'RANGE_GAIN_REDUCED', run_id, item_guid(item), take_guid(take), #spans, string.format('%.1f', db), 1)
end

-- repair_click ------------------------------------------------------------------------------------------------------

local UNDO_REPAIR_CLICKS = 'Narration Utils: repair clicks'
local CLICKS_UNREADABLE = 'The clicks to repair are not readable, so nothing changed.'
local MAX_CLICKS = 500
-- The longest click repaired, in seconds: a click lasts a few milliseconds, and a longer dip would be heard as a gap.
local MAX_CLICK_LENGTH = 0.05
-- The ramp, in seconds, outside each edge of a click, and how far the click is lowered between the ramps. Starting values to
-- tune in REAPER on real narration (the QA pass, #1495).
local CLICK_RAMP = 0.002
local CLICK_DIP_DB = 30

-- 'start:end,start:end' as { { start, end } } in the order given; nil when any pair is not two plain times with start
-- before end; 'count' when there are more than MAX_CLICKS, and 'long' when a click is longer than MAX_CLICK_LENGTH.
local function clicks_from(text)
  local out = {}
  for part in (text .. ','):gmatch('([^,]*),') do
    local first_text, last_text = part:match('^([^:]+):([^:]+)$')
    local first, last = plain_seconds(first_text or ''), plain_seconds(last_text or '')
    if not first or not last or last - first <= EDGE_TOLERANCE then
      return nil
    end
    out[#out + 1] = { first, last }
  end
  if #out > MAX_CLICKS then
    return 'count'
  end
  for _, click in ipairs(out) do
    if click[2] - click[1] > MAX_CLICK_LENGTH + EDGE_TOLERANCE then
      return 'long'
    end
  end
  return out
end

-- The clicks in item time (source time less the take's offset), sorted, with any two whose ramps would meet made one.
local function item_clicks(clicks, offset)
  local sorted = {}
  for _, click in ipairs(clicks) do
    sorted[#sorted + 1] = { click[1] - offset, click[2] - offset }
  end
  table.sort(sorted, function(a, b)
    return a[1] < b[1]
  end)
  local merged = {}
  for _, click in ipairs(sorted) do
    local previous = merged[#merged]
    if previous and click[1] - CLICK_RAMP <= previous[2] + CLICK_RAMP + EDGE_TOLERANCE then
      previous[2] = math.max(previous[2], click[2])
    else
      merged[#merged + 1] = { click[1], click[2] }
    end
  end
  return merged
end

local function repair_click(session_dir, run_id, item_text, take_text, clicks_text)
  local clicks = clicks_from(clicks_text or '')
  if clicks == 'count' then
    event(session_dir, 'ERROR', run_id, 'A take can have at most 500 clicks repaired at once, so nothing changed.')
    return
  end
  if clicks == 'long' then
    event(session_dir, 'ERROR', run_id, 'A click to repair is at most 50 ms long, so nothing changed.')
    return
  end
  if not clicks then
    event(session_dir, 'ERROR', run_id, CLICKS_UNREADABLE)
    return
  end
  for _, call in ipairs(GAIN_NEEDED) do
    if not reaper.APIExists(call) then
      event(session_dir, 'ERROR', run_id, 'This REAPER version cannot repair a click in a take.')
      return
    end
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local wanted_item, wanted_take = normalize_guid(item_text), normalize_guid(take_text)
  local item = wanted_item ~= '' and find_item(wanted_item) or nil
  if not item then
    event(session_dir, 'ITEM_STALE', run_id, item_text, 'item')
    return
  end
  local take
  for index = 0, reaper.CountTakes(item) - 1 do
    local candidate = reaper.GetTake(item, index)
    if candidate and wanted_take ~= '' and take_guid(candidate) == wanted_take then
      take = candidate
    end
  end
  if not take then
    event(session_dir, 'ITEM_STALE', run_id, take_text, 'take')
    return
  end
  local function refuse(sentence)
    event(session_dir, 'ERROR', run_id, sentence)
  end
  if reaper.GetActiveTake(item) ~= take then
    return refuse('That is not the take the item plays, so no click was repaired.')
  end
  if reaper.TakeIsMIDI(take) then
    return refuse('A MIDI take has no audio to repair.')
  end
  if reaper.GetMediaItemTakeInfo_Value(take, 'D_PLAYRATE') ~= 1 then
    return refuse('A take with a changed playback rate cannot have a click repaired.')
  end
  local length = reaper.GetMediaItemInfo_Value(item, 'D_LENGTH')
  local spans = item_clicks(clicks, reaper.GetMediaItemTakeInfo_Value(take, 'D_STARTOFFS'))
  -- A click the item no longer plays is one the app read before the item was trimmed or its take moved.
  for _, span in ipairs(spans) do
    if span[1] < -EDGE_TOLERANCE or span[2] > length + EDGE_TOLERANCE then
      event(session_dir, 'ITEM_STALE', run_id, item_guid(item), 'item')
      return
    end
  end
  local env = reaper.GetTakeEnvelopeByName(take, 'Volume')
  if env then
    for _, span in ipairs(spans) do
      if has_point_within(env, span[1] - CLICK_RAMP, span[2] + CLICK_RAMP) then
        return refuse('That take already has volume changes where a click would be repaired, so no click was repaired.')
      end
    end
  end

  local dip = 10 ^ (-CLICK_DIP_DB / 20)
  reaper.Undo_BeginBlock2(0)
  if not env then
    env = make_volume_envelope(item, take)
  end
  if env then
    local mode = reaper.GetEnvelopeScalingMode(env)
    -- Every value is read before any point is added, so each one scales the take's level as it was.
    local planned = {}
    local function plan(time, factor)
      local _, value = reaper.Envelope_Evaluate(env, time, 0, 0)
      local amplitude = reaper.ScaleFromEnvelopeMode(mode, value) * factor
      planned[#planned + 1] = { time, reaper.ScaleToEnvelopeMode(mode, amplitude) }
    end
    for _, span in ipairs(spans) do
      local first, last = math.max(span[1], 0), math.min(span[2], length)
      if first > EDGE_TOLERANCE then
        plan(math.max(first - CLICK_RAMP, 0), 1)
      end
      plan(first, dip)
      plan(last, dip)
      if last < length - EDGE_TOLERANCE then
        plan(math.min(last + CLICK_RAMP, length), 1)
      end
    end
    for _, point in ipairs(planned) do
      reaper.InsertEnvelopePoint(env, point[1], point[2], 0, 0, false, true)
    end
    reaper.Envelope_SortPoints(env)
  end
  reaper.UpdateItemInProject(item)
  -- No envelope means nothing changed, so the block is closed with no description and records no undo point.
  reaper.Undo_EndBlock2(0, env and UNDO_REPAIR_CLICKS or '', -1)
  reaper.UpdateArrange()
  if not env then
    return refuse('REAPER did not make a volume envelope for that take, so no click was repaired.')
  end
  event(session_dir, 'CLICKS_REPAIRED', run_id, item_guid(item), take_guid(take), #spans, 1)
end

-- fx_range_params, fx_range_set_param, fx_range_bypass ---------------------------------------------------------------

local UNDO_SET_PARAM = 'Narration Utils: change effect setting'
local UNDO_BYPASS = 'Narration Utils: bypass effect'
local UNDO_ENABLE = 'Narration Utils: turn effect back on'
-- The most parameters fx_range_params lists, over every FX of the chain: a plug-in can have thousands.
local MAX_FX_PARAMS = 512
local FX_EDIT_NEEDED = {
  'TakeFX_GetCount',
  'TakeFX_GetFXGUID',
  'TakeFX_GetFXName',
  'TakeFX_GetNumParams',
  'TakeFX_GetParamName',
  'TakeFX_GetParam',
  'TakeFX_GetParameterStepSizes',
  'TakeFX_GetFormattedParamValue',
  'TakeFX_SetParam',
  'TakeFX_GetEnabled',
  'TakeFX_SetEnabled',
}
local FX_EDIT_UNSUPPORTED = 'This REAPER version cannot read or change an effect on words.'
local NO_SUCH_SETTING = 'That effect has no such setting.'

-- A number as the events carry it: every digit a double needs, and no '.0' on a whole number.
local function num(value)
  return string.format('%.17g', value)
end

-- Whether every call the three commands make is there; answers ERROR when one is not.
local function fx_edit_supported(session_dir, run_id)
  for _, call in ipairs(FX_EDIT_NEEDED) do
    if not reaper.APIExists(call) then
      event(session_dir, 'ERROR', run_id, FX_EDIT_UNSUPPORTED)
      return false
    end
  end
  return true
end

-- The chain apply_fx_range put on a piece: the item, the take, and the take's FX indices of the FX the take's record names,
-- in the order recorded. take_text empty is the item's take that carries the chain. Answers ITEM_STALE and returns nil
-- when the item (reason item) or the named take (reason take) no longer resolves, or when the take no longer carries
-- that chain or an FX the record names is gone (reason fx).
local function applied_chain(session_dir, run_id, item_text, take_text, name)
  local wanted_item, wanted_take = normalize_guid(item_text), normalize_guid(take_text)
  local item = wanted_item ~= '' and find_item(wanted_item) or nil
  if not item then
    event(session_dir, 'ITEM_STALE', run_id, item_text, 'item')
    return nil
  end
  local take = nil
  for index = 0, reaper.CountTakes(item) - 1 do
    local candidate = reaper.GetTake(item, index)
    if wanted_take ~= '' and take_guid(candidate) == wanted_take then
      take = candidate
    elseif wanted_take == '' and not take and take_ext(candidate, CHAIN_KEY) == name then
      take = candidate
    end
  end
  if wanted_take ~= '' and not take then
    event(session_dir, 'ITEM_STALE', run_id, take_text, 'take')
    return nil
  end
  local slots = {}
  if take and take_ext(take, CHAIN_KEY) == name then
    local at = {}
    for fx = 0, reaper.TakeFX_GetCount(take) - 1 do
      at[reaper.TakeFX_GetFXGUID(take, fx) or ''] = fx
    end
    for guid in take_ext(take, CHAIN_FX_KEY):gmatch('%S+') do
      if not at[guid] then
        slots = {}
        break
      end
      slots[#slots + 1] = at[guid]
    end
  end
  if #slots == 0 then
    event(session_dir, 'ITEM_STALE', run_id, item_guid(item), 'fx')
    return nil
  end
  return item, take, slots
end

-- fx_range_set_param's last field: param|value (the bridge splits a line into at most eight fields and the last keeps the
-- rest). Any other number of parts is nil, which refuses.
local function setting_tail(field)
  local parts = {}
  for part in ((field or '') .. '|'):gmatch('(.-)|') do
    parts[#parts + 1] = part
  end
  if #parts ~= 2 then
    return nil
  end
  return parts[1], parts[2]
end

-- A whole number 0 or more written in plain digits, or nil.
local function index_from(text)
  if not (text or ''):match('^%d+$') then
    return nil
  end
  return tonumber(text)
end

local function fx_range_params(session_dir, run_id, item_text, take_text, name)
  if not chain_parts(name) then
    event(session_dir, 'ERROR', run_id, BAD_CHAIN)
    return
  end
  if not fx_edit_supported(session_dir, run_id) then
    return
  end
  local item, take, slots = applied_chain(session_dir, run_id, item_text, take_text, name)
  if not item then
    return
  end
  local listed_count, truncated, bypassed = 0, 0, 1
  for position, fx in ipairs(slots) do
    if reaper.TakeFX_GetEnabled(take, fx) then
      bypassed = 0
    end
    local _, fx_name = reaper.TakeFX_GetFXName(take, fx, '')
    for param = 0, reaper.TakeFX_GetNumParams(take, fx) - 1 do
      if listed_count == MAX_FX_PARAMS then
        truncated = 1
        break
      end
      local value, low, high = reaper.TakeFX_GetParam(take, fx, param)
      local _, param_name = reaper.TakeFX_GetParamName(take, fx, param, '')
      local stepped, step = reaper.TakeFX_GetParameterStepSizes(take, fx, param)
      local _, formatted = reaper.TakeFX_GetFormattedParamValue(take, fx, param, '')
      -- A value that is not a finite number is not one the host can read or send back, so it is not listed.
      if finite(value) and finite(low) and finite(high) then
        step = stepped and finite(step) or 0
        event(
          session_dir,
          'RANGE_FX_PARAM',
          run_id,
          position - 1,
          fx_name or '',
          param,
          param_name or '',
          num(value),
          num(low),
          num(high),
          num(step),
          formatted or ''
        )
        listed_count = listed_count + 1
      end
    end
  end
  event(session_dir, 'RANGE_FX_PARAMS', run_id, item_guid(item), take_guid(take), name, listed_count, truncated, bypassed)
end

local function fx_range_set_param(session_dir, run_id, item_text, take_text, name, fx_text, param_text, value_text)
  if not chain_parts(name) then
    event(session_dir, 'ERROR', run_id, BAD_CHAIN)
    return
  end
  local position, param = index_from(fx_text), index_from(param_text)
  if not position or not param then
    event(session_dir, 'ERROR', run_id, NO_SUCH_SETTING)
    return
  end
  local value = finite(value_text)
  if not value then
    event(session_dir, 'ERROR', run_id, 'The value for that setting is not a number.')
    return
  end
  if not fx_edit_supported(session_dir, run_id) then
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local item, take, slots = applied_chain(session_dir, run_id, item_text, take_text, name)
  if not item then
    return
  end
  local fx = slots[position + 1]
  if not fx or param >= reaper.TakeFX_GetNumParams(take, fx) then
    event(session_dir, 'ERROR', run_id, NO_SUCH_SETTING)
    return
  end
  local current, low, high = reaper.TakeFX_GetParam(take, fx, param)
  if value < low - EDGE_TOLERANCE or value > high + EDGE_TOLERANCE then
    event(session_dir, 'ERROR', run_id, 'That value is outside what the setting takes.')
    return
  end
  local function answer(undo_points)
    local held = reaper.TakeFX_GetParam(take, fx, param)
    local _, formatted = reaper.TakeFX_GetFormattedParamValue(take, fx, param, '')
    event(session_dir, 'RANGE_FX_PARAM_SET', run_id, item_guid(item), take_guid(take), position, param, num(held), formatted or '', undo_points)
  end
  if current == value then
    answer(0)
    return
  end

  reaper.Undo_BeginBlock2(0)
  local changed = reaper.TakeFX_SetParam(take, fx, param, value)
  reaper.Undo_EndBlock2(0, UNDO_SET_PARAM, -1)
  reaper.UpdateArrange()
  if not changed then
    event(session_dir, 'ERROR', run_id, 'REAPER did not change the setting.')
    return
  end
  answer(1)
end

local function fx_range_bypass(session_dir, run_id, item_text, take_text, name, on_text)
  if not chain_parts(name) then
    event(session_dir, 'ERROR', run_id, BAD_CHAIN)
    return
  end
  if on_text ~= '1' and on_text ~= '0' then
    event(session_dir, 'ERROR', run_id, 'Bypass must be 1 (on) or 0 (off).')
    return
  end
  if not fx_edit_supported(session_dir, run_id) then
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local item, take, slots = applied_chain(session_dir, run_id, item_text, take_text, name)
  if not item then
    return
  end
  local enable = on_text == '0'
  local switch = {}
  for _, fx in ipairs(slots) do
    if (reaper.TakeFX_GetEnabled(take, fx) and true or false) ~= enable then
      switch[#switch + 1] = fx
    end
  end
  if #switch == 0 then
    event(session_dir, 'RANGE_FX_BYPASSED', run_id, item_guid(item), take_guid(take), name, on_text, 0)
    return
  end

  reaper.Undo_BeginBlock2(0)
  for _, fx in ipairs(switch) do
    reaper.TakeFX_SetEnabled(take, fx, enable)
  end
  reaper.Undo_EndBlock2(0, enable and UNDO_ENABLE or UNDO_BYPASS, -1)
  reaper.UpdateArrange()
  event(session_dir, 'RANGE_FX_BYPASSED', run_id, item_guid(item), take_guid(take), name, on_text, 1)
end

return function(registry)
  registry.register('delete_range', function(ctx, args)
    local fade, pad, tone = cut_tail(args[6])
    delete_range(ctx.session_dir, args[1] or '', args[2] or '', args[3], args[4], args[5], fade, pad, tone)
  end)
  registry.register('apply_fx_range', function(ctx, args)
    apply_fx_range(ctx.session_dir, args[1] or '', args[2] or '', args[3], args[4], args[5] or '', args[6])
  end)
  registry.register('remove_fx_range', function(ctx, args)
    remove_fx_range(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '')
  end)
  registry.register('reduce_range_gain', function(ctx, args)
    reduce_range_gain(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '', args[4], args[5])
  end)
  registry.register('repair_click', function(ctx, args)
    repair_click(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '', args[4])
  end)
  registry.register('fx_range_params', function(ctx, args)
    fx_range_params(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '', args[4] or '')
  end)
  registry.register('fx_range_set_param', function(ctx, args)
    local param, value = setting_tail(args[6])
    fx_range_set_param(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '', args[4] or '', args[5], param, value)
  end)
  registry.register('fx_range_bypass', function(ctx, args)
    fx_range_bypass(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '', args[4] or '', args[5] or '')
  end)
end
