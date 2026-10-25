-- Replace a range of the narrator's words with a stretch of another narrator's audio, and put the narrator's audio back
-- (docs/reference/daw/capabilities.md#replace_range; docs/research/replace-audio.md). Loaded by narration_ui_bridge.lua, which
-- passes the shared helpers as the chunk argument.
--
-- Their audio is already in the project: a track of its own holds their file (the narrator, or the app's import, put it there).
-- The command never opens a path the host sent: it opens the file their item's take plays, read from the project, as
-- delete_range's room tone does.
--
-- replace_range(run, item_guid, start, end, source_guid, source_start|source_end|fade_ms|gain_db|id) replaces project seconds
-- start..end of the narrator's item with project seconds source_start..source_end of their item. The bridge keeps the rest of a
-- line in its eighth field, so the last five arguments arrive joined by '|'. Before any change it refuses (ERROR, in the
-- narrator's words): times that are not finite or not in order, a fade outside 0 to 500 whole milliseconds, a level change
-- outside -24 to 24 dB, an id that is not 1 to 64 letters, digits, '-' or '_', recording, a REAPER without a call it needs, a
-- range outside either item, their item on the narrator's track or on the Cuts track, their item with no audio take (none, or
-- MIDI), a neighbour on the narrator's track over the range, words already replaced (the narrator's item carries a
-- replacement id) and a file REAPER cannot open. A GUID that does not resolve answers ITEM_STALE|run|guid|item for the
-- narrator's item, ITEM_STALE|run|guid|source for theirs.
--
-- Then, in one undo block labelled "<app name>: replace audio" (the replace_range kind, narration_bridge_core.lua), it splits
-- the narrator's item at end and then start and moves the middle piece to the muted Cuts track, exactly as delete_range does,
-- and lays a new item on the narrator's track at start, as long as their stretch, with one take playing their file from the
-- stretch's place in it (their take's D_STARTOFFS plus the stretch's distance into their item at their D_PLAYRATE, which the
-- new take keeps) at the level change as its D_VOL. Every later item on the narrator's track, the right piece included, moves
-- by their length less the words' length, so a shorter read closes the gap and a longer one opens it. The seam fade is set on
-- the left piece's fade-out, both ends of the new item and the right piece's fade-in. Their item and every other track are
-- not touched. P_EXT records the replacement: on the new item <prefix>replacement (the id), <prefix>replacement_cut (the
-- parked piece's GUID) and <prefix>replacement_seams ('left right', '-' for none); on the parked piece <prefix>replaced_by.
-- Answers RANGE_REPLACED|run|newItemGuid|cutItemGuid|leftItemGuid|shift|undoPoints: shift is the seconds the later audio
-- moved (%.6f), leftItemGuid is empty when the words began at the item's start.
--
-- restore_replacement(run, new_item_guid, id) is "Put my audio back", which works after a save and reopen, when REAPER's undo
-- history is gone. The new item must carry the id (else ITEM_STALE|run|guid|replacement) and the piece it names must still be on
-- the Cuts track (else ITEM_STALE|run|cutGuid|cut). In one undo block labelled "<app name>: put audio back" it deletes the new
-- item (the app's own, playing a file it never wrote), moves the parked piece back to the new item's track at the new item's
-- current position, moves every later item on that track by the parked piece's length less the new item's, and sets to 0 the
-- fades where the piece meets the pieces it was split from, when they still touch it, since the audio there runs on. Answers
-- REPLACEMENT_RESTORED|run|restoredItemGuid|shift|undoPoints.
--
-- Run in REAPER 7.82 on Linux (scripts/ci/real-reaper/scenarios_replace.py; docs/operations/reaper-verification-pass.md): see the
-- capability's Checked line. Not run: an MP3 or a sample rate unlike the project's as their file, on Windows.

local core = ...
local event = core.event

local UNDO_REPLACE = core.undo_label('replace_range')
local UNDO_RESTORE = core.undo_label('restore_replacement')
local PREFIX = core.brand.identity.reaperExtPrefix
local CUTS_KEY = 'P_EXT:' .. PREFIX .. 'cuts'
local CUTS_NAME = 'Cuts'
local REPLACEMENT_KEY = 'P_EXT:' .. PREFIX .. 'replacement'
local REPLACEMENT_CUT_KEY = 'P_EXT:' .. PREFIX .. 'replacement_cut'
local REPLACEMENT_SEAMS_KEY = 'P_EXT:' .. PREFIX .. 'replacement_seams'
local REPLACED_BY_KEY = 'P_EXT:' .. PREFIX .. 'replaced_by'
local MAX_FADE_MS = 500
local MAX_GAIN_DB = 24
-- As narration_range.lua: how close to an item's edge a time counts as that edge.
local EDGE_TOLERANCE = 0.000001

local RECORDING = 'REAPER is recording. Stop recording first.'
local BAD_ID = 'The replacement has no usable name.'
local NEEDED = {
  'SplitMediaItem',
  'MoveMediaItemToTrack',
  'InsertTrackAtIndex',
  'GetSetMediaTrackInfo_String',
  'AddMediaItemToTrack',
  'AddTakeToMediaItem',
  'PCM_Source_CreateFromFile',
  'SetMediaItemTake_Source',
  'DeleteTrackMediaItem',
}

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
local function find_item(text)
  local wanted = normalize_guid(text)
  if wanted == '' then
    return nil
  end
  for index = 0, reaper.CountMediaItems(0) - 1 do
    local item = reaper.GetMediaItem(0, index)
    if item_guid(item) == wanted then
      return item
    end
  end
  return nil
end
local function item_ext(item, key)
  local _, value = reaper.GetSetMediaItemInfo_String(item, key, '', false)
  return value or ''
end
local function recording()
  return math.floor(reaper.GetPlayState() / 4) % 2 == 1
end
local function finite(text)
  local value = tonumber(text or '')
  if not value or value ~= value or value == math.huge or value == -math.huge then
    return nil
  end
  return value
end
local function span(first_text, last_text)
  local first, last = finite(first_text), finite(last_text)
  if not first or not last or last - first <= EDGE_TOLERANCE then
    return nil
  end
  return first, last
end
local function valid_id(text)
  return type(text) == 'string' and #text <= 64 and text:match('^[%w_%-]+$') ~= nil
end
local function supported()
  for _, name in ipairs(NEEDED) do
    if not reaper.APIExists(name) then
      return false
    end
  end
  return true
end
local function start_of(item)
  return reaper.GetMediaItemInfo_Value(item, 'D_POSITION')
end
local function end_of(item)
  return start_of(item) + reaper.GetMediaItemInfo_Value(item, 'D_LENGTH')
end

-- The Cuts track, and whether it carries the key (narration_range.lua's find_cuts).
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

-- Inside the undo block: the Cuts track found, keyed and muted, or added (narration_range.lua's ensure_cuts).
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
    if other ~= item and start_of(other) < last - EDGE_TOLERANCE and end_of(other) > first + EDGE_TOLERANCE then
      return true
    end
  end
  return false
end

-- The items on the track, other than item, that start at or after time, read before any change.
local function items_from(track, item, time)
  local out = {}
  for index = 0, reaper.CountTrackMediaItems(track) - 1 do
    local other = reaper.GetTrackMediaItem(track, index)
    if other ~= item and start_of(other) >= time - EDGE_TOLERANCE then
      out[#out + 1] = other
    end
  end
  return out
end

local function shift_items(items, by)
  for _, moved in ipairs(items) do
    reaper.SetMediaItemInfo_Value(moved, 'D_POSITION', start_of(moved) + by)
  end
end

-- source_start|source_end|fade_ms|gain_db|id, or nil when it has another number of parts.
local function replace_tail(field)
  local parts = {}
  for part in (tostring(field or '') .. '|'):gmatch('([^|]*)|') do
    parts[#parts + 1] = part
  end
  if #parts ~= 5 then
    return nil
  end
  return parts
end

-- Their audio, checked before any change: { take, file, offset, rate } for source_start..source_end of their item, or nil and
-- the refusal (an event tag and its fields).
local function their_audio(source, track, cuts, source_start, source_end)
  local their_track = reaper.GetMediaItem_Track(source)
  if their_track == track then
    return nil, 'ERROR', 'Their audio must be on its own track, not on the track being changed.'
  end
  if cuts and their_track == cuts then
    return nil, 'ERROR', 'Their audio is on the Cuts track. Choose their audio on its own track.'
  end
  local take = reaper.GetActiveTake(source)
  if not take or reaper.TakeIsMIDI(take) then
    return nil, 'ERROR', 'Their item has no audio to use.'
  end
  local position = start_of(source)
  if source_start < position - EDGE_TOLERANCE or source_end > end_of(source) + EDGE_TOLERANCE then
    return nil, 'ERROR', 'The stretch of their audio is not inside their item.'
  end
  local rate = reaper.GetMediaItemTakeInfo_Value(take, 'D_PLAYRATE')
  local file = reaper.GetMediaSourceFileName(reaper.GetMediaItemTake_Source(take), '')
  if not file or file == '' then
    return nil, 'ERROR', 'Their item has no audio to use.'
  end
  return {
    file = file,
    rate = rate,
    offset = reaper.GetMediaItemTakeInfo_Value(take, 'D_STARTOFFS') + (source_start - position) * rate,
  }
end

local function replace_range(session_dir, run_id, guid_text, start_text, end_text, source_text, tail)
  local first_cut, last_cut = span(start_text, end_text)
  if not first_cut then
    event(session_dir, 'ERROR', run_id, 'The words to replace are not a usable pair of times.')
    return
  end
  local parts = replace_tail(tail)
  if not parts or not valid_id(parts[5]) then
    event(session_dir, 'ERROR', run_id, BAD_ID)
    return
  end
  local source_start, source_end = span(parts[1], parts[2])
  if not source_start then
    event(session_dir, 'ERROR', run_id, 'The stretch of their audio is not a usable pair of times.')
    return
  end
  local fade_ms = finite(parts[3])
  if not fade_ms or fade_ms ~= math.floor(fade_ms) or fade_ms < 0 or fade_ms > MAX_FADE_MS then
    event(session_dir, 'ERROR', run_id, 'The fade must be a whole number of milliseconds from 0 to 500.')
    return
  end
  local gain_db = finite(parts[4])
  if not gain_db or gain_db < -MAX_GAIN_DB or gain_db > MAX_GAIN_DB then
    event(session_dir, 'ERROR', run_id, 'The level change must be from -24 to 24 dB.')
    return
  end
  local id = parts[5]
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  if not supported() then
    event(session_dir, 'ERROR', run_id, 'This REAPER version cannot replace audio.')
    return
  end
  local item = find_item(guid_text)
  if not item then
    event(session_dir, 'ITEM_STALE', run_id, guid_text, 'item')
    return
  end
  local source = find_item(source_text)
  if not source then
    event(session_dir, 'ITEM_STALE', run_id, source_text, 'source')
    return
  end
  local track = reaper.GetMediaItem_Track(item)
  local cuts, keyed = find_cuts()
  if cuts and track == cuts then
    event(session_dir, 'ERROR', run_id, 'That audio is already on the Cuts track.')
    return
  end
  if item_ext(item, REPLACEMENT_KEY) ~= '' then
    event(session_dir, 'ERROR', run_id, 'Those words are already replaced. Put your audio back first.')
    return
  end
  local theirs, tag, refusal = their_audio(source, track, cuts, source_start, source_end)
  if not theirs then
    event(session_dir, tag, run_id, refusal)
    return
  end
  local first, last = start_of(item), end_of(item)
  if first_cut < first - EDGE_TOLERANCE or last_cut > last + EDGE_TOLERANCE then
    event(session_dir, 'ERROR', run_id, 'The words to replace are not inside that item.')
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
    event(session_dir, 'ERROR', run_id, 'Another item on the track overlaps the words to replace, so nothing changed.')
    return
  end
  local opened = reaper.PCM_Source_CreateFromFile(theirs.file)
  if not opened then
    event(session_dir, 'ERROR', run_id, 'REAPER could not open their audio.')
    return
  end
  local length = source_end - source_start
  local shift = length - (last_cut - first_cut)
  local fade = fade_ms / 1000
  local later = items_from(track, item, last_cut)

  reaper.Undo_BeginBlock2(0)
  local right = split_end and reaper.SplitMediaItem(item, last_cut) or nil
  local middle, left = item, nil
  if split_start then
    middle, left = reaper.SplitMediaItem(item, first_cut), item
  end
  reaper.MoveMediaItemToTrack(middle, ensure_cuts(cuts, keyed))
  if right then
    later[#later + 1] = right
  end
  shift_items(later, shift)

  local new = reaper.AddMediaItemToTrack(track)
  reaper.SetMediaItemInfo_Value(new, 'D_POSITION', first_cut)
  reaper.SetMediaItemInfo_Value(new, 'D_LENGTH', length)
  local take = reaper.AddTakeToMediaItem(new)
  reaper.SetMediaItemTake_Source(take, opened)
  reaper.SetMediaItemTakeInfo_Value(take, 'D_STARTOFFS', theirs.offset)
  if theirs.rate ~= 1 then
    reaper.SetMediaItemTakeInfo_Value(take, 'D_PLAYRATE', theirs.rate)
  end
  reaper.SetMediaItemTakeInfo_Value(take, 'D_VOL', 10 ^ (gain_db / 20))
  local edge = math.min(fade, length / 2)
  if fade > 0 then
    reaper.SetMediaItemInfo_Value(new, 'D_FADEINLEN', edge)
    reaper.SetMediaItemInfo_Value(new, 'D_FADEOUTLEN', edge)
    if left then
      reaper.SetMediaItemInfo_Value(left, 'D_FADEOUTLEN', fade)
    end
    if right then
      reaper.SetMediaItemInfo_Value(right, 'D_FADEINLEN', fade)
    end
  end
  local cut_guid = item_guid(middle)
  local left_guid = left and item_guid(left) or ''
  reaper.GetSetMediaItemInfo_String(new, REPLACEMENT_KEY, id, true)
  reaper.GetSetMediaItemInfo_String(new, REPLACEMENT_CUT_KEY, cut_guid, true)
  reaper.GetSetMediaItemInfo_String(new, REPLACEMENT_SEAMS_KEY, (left and left_guid or '-') .. ' ' .. (right and item_guid(right) or '-'), true)
  reaper.GetSetMediaItemInfo_String(middle, REPLACED_BY_KEY, id, true)
  reaper.Undo_EndBlock2(0, UNDO_REPLACE, -1)
  reaper.UpdateArrange()
  event(session_dir, 'RANGE_REPLACED', run_id, item_guid(new), cut_guid, left_guid, string.format('%.6f', shift), 1)
end

-- A seam piece named in REPLACEMENT_SEAMS_KEY that is still on track and touches the restored piece at `at`.
local function seam_piece(text, track, at, field)
  if text == nil or text == '-' then
    return nil
  end
  local piece = find_item(text)
  if not piece or reaper.GetMediaItem_Track(piece) ~= track then
    return nil
  end
  local edge = field == 'end' and end_of(piece) or start_of(piece)
  if math.abs(edge - at) > EDGE_TOLERANCE * 1000 then
    return nil
  end
  return piece
end

local function restore_replacement(session_dir, run_id, guid_text, id)
  if not valid_id(id) then
    event(session_dir, 'ERROR', run_id, BAD_ID)
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  if not supported() then
    event(session_dir, 'ERROR', run_id, 'This REAPER version cannot put the audio back.')
    return
  end
  local new = find_item(guid_text)
  if not new then
    event(session_dir, 'ITEM_STALE', run_id, guid_text, 'item')
    return
  end
  if item_ext(new, REPLACEMENT_KEY) ~= id then
    event(session_dir, 'ITEM_STALE', run_id, guid_text, 'replacement')
    return
  end
  local cut_text = item_ext(new, REPLACEMENT_CUT_KEY)
  local cut = find_item(cut_text)
  local cuts = find_cuts()
  if not cut or not cuts or reaper.GetMediaItem_Track(cut) ~= cuts then
    event(session_dir, 'ITEM_STALE', run_id, cut_text, 'cut')
    return
  end
  local track = reaper.GetMediaItem_Track(new)
  local at, length = start_of(new), reaper.GetMediaItemInfo_Value(new, 'D_LENGTH')
  local cut_length = reaper.GetMediaItemInfo_Value(cut, 'D_LENGTH')
  local shift = cut_length - length
  local later = items_from(track, new, at + length)
  local seams = item_ext(new, REPLACEMENT_SEAMS_KEY)
  local left_text, right_text = seams:match('^(%S+) (%S+)$')
  local left = seam_piece(left_text, track, at, 'end')
  local right = seam_piece(right_text, track, at + length, 'start')

  reaper.Undo_BeginBlock2(0)
  reaper.DeleteTrackMediaItem(track, new)
  reaper.MoveMediaItemToTrack(cut, track)
  reaper.SetMediaItemInfo_Value(cut, 'D_POSITION', at)
  shift_items(later, shift)
  if left then
    reaper.SetMediaItemInfo_Value(left, 'D_FADEOUTLEN', 0)
    reaper.SetMediaItemInfo_Value(cut, 'D_FADEINLEN', 0)
  end
  if right then
    reaper.SetMediaItemInfo_Value(right, 'D_FADEINLEN', 0)
    reaper.SetMediaItemInfo_Value(cut, 'D_FADEOUTLEN', 0)
  end
  reaper.GetSetMediaItemInfo_String(cut, REPLACED_BY_KEY, '', true)
  reaper.Undo_EndBlock2(0, UNDO_RESTORE, -1)
  reaper.UpdateArrange()
  event(session_dir, 'REPLACEMENT_RESTORED', run_id, item_guid(cut), string.format('%.6f', shift), 1)
end

return function(registry)
  registry.register('replace_range', function(ctx, args)
    if registry.interrupt_compare then
      registry.interrupt_compare()
    end
    replace_range(ctx.session_dir, args[1] or '', args[2] or '', args[3], args[4], args[5] or '', args[6])
  end)
  registry.register('restore_replacement', function(ctx, args)
    if registry.interrupt_compare then
      registry.interrupt_compare()
    end
    restore_replacement(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '')
  end)
end
