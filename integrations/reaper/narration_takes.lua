-- Take housekeeping over the bridge: hide_takes mutes every take of an item but the one the narrator keeps ("Hide other
-- takes", PRD studio-next-daw-ports-and-capabilities SND-5a; DQ-8: never delete). Loaded by narration_ui_bridge.lua,
-- which passes the shared helpers as the chunk argument.
--
-- ReaScript has no per-take mute, so a hidden take is a take whose volume (D_VOL) is 0, with the volume it had saved in
-- the take's own P_EXT under HIDDEN_KEY, so the take is silent, can be told apart from one the narrator turned down
-- and keeps the value to restore. Nothing is deleted, moved or re-sourced. The kept take becomes the active take and,
-- if an earlier hide_takes hid it, gets its volume back. The changes are one undo block; nothing to change opens none.
--
-- An item and the kept take are named by GUID; a GUID that does not resolve, or a take no longer on the item, answers
-- ITEM_STALE|run|guid|reason (item or take) and changes nothing. Nothing changes while REAPER records. The answer is
-- TAKES_HIDDEN|run|item guid|takes hidden|changed: changed is 1 when an undo point was added, which can be with none hidden
-- (the kept take made active, or its volume given back).
--
-- Pending in REAPER (docs/reference/daw/reaper.md, "Takes"): that a take at D_VOL 0 is silent, that the take's P_EXT
-- survives save, and that one Undo restores every volume and the active take. The harness proves only the calls.
--
-- stack_takes(run, payload_path) puts the later reads of passages on the first read's spot as takes (ADR 0860 point 4,
-- the PRD's DQ-7). The payload is a file the host wrote under the session folder: a `shift|seconds` line, then for
-- each passage a `group|first item GUID|first read's take GUID` line followed by one `move|take GUID|from|to|length`
-- line per later read (seconds into the project). It is read line by line and refused whole when it is larger than
-- MAX_PAYLOAD_BYTES, holds more than MAX_GROUPS groups or MAX_MOVES moves, or has any field out of shape: a GUID not
-- shaped like one, a time that is not a plain decimal number, a negative time, a length that is not positive, a group
-- with no move, a GUID named twice, or a shift of the wrong sign. Every item and take is resolved by GUID and checked
-- before anything changes: a GUID that does not resolve, or a read that moved or changed length since the app read it
-- (by more than POSITION_TOLERANCE), answers ITEM_STALE|run|guid|item or take; a read on another track, longer than the
-- first read (adding a take leaves D_LENGTH as it is), MIDI, with a changed playback rate or with its file not on
-- disk, a first read that already carries stacked takes, a destination other than the first read's spot, a fixed-lane
-- track (ADR 0147: the app never converts lanes), other audio between the reads, or a shift the reads do not add up to
-- answers ERROR. Then, in one undo block, each read becomes a new take of the first
-- item (AddTakeToMediaItem, a source from the read's file, its D_STARTOFFS), the take's P_EXT records the read's item,
-- take, track and start and its offset from the first read, the read's item moves to the muted Cuts track (found or
-- added as delete_range does, narration_range.lua) with its own take, so nothing is deleted, and every later item on
-- the track moves up by the shifts of the passages before it. The first read stays the active take. Answers
-- TAKES_STACKED|run|groups|takes|shift|undoPoints.
--
-- unstack_takes(run, payload_path) reads the same payload, each move now from the first read's spot (`from`) to where
-- the read was recorded (`to`: the first read's start plus the offset the take recorded), and a shift that is not
-- negative. A take the first item no longer carries, or a read no longer on the Cuts track, answers ITEM_STALE; a
-- request that leaves any stacked take on the first item answers ERROR, since every offset is from one stack. In one
-- undo block it removes the stacked takes from the first item by rewriting the item's state chunk (REAPER's own
-- take-delete action asks to confirm), keeps the active take (the first read when the active one was removed), moves
-- every later item on the track out again, and moves each read back to its track and time. Answers
-- TAKES_UNSTACKED|run|groups|takes|shift|undoPoints.
--
-- Pending in REAPER (the QA pass, #1495): that a stack with moves to another track is one undo step, that a take's
-- P_EXT and source survive save, and that SetItemStateChunk without a take's lines removes only that take.

local core = ...
local event = core.event

local HIDDEN_KEY = 'P_EXT:narration_utils_take_hidden_volume'

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
local function take_guid(take)
  local _, guid = reaper.GetSetMediaItemTakeInfo_String(take, 'GUID', '', false)
  return normalize_guid(guid)
end
local function recording()
  return math.floor(reaper.GetPlayState() / 4) % 2 == 1
end

-- The item and take a request names, or nil plus the GUID that did not resolve and why. Only by GUID: never by
-- position, and never a take of another item.
local function resolve(item_text, take_text)
  local wanted = normalize_guid(item_text)
  local item = nil
  for index = 0, reaper.CountMediaItems(0) - 1 do
    local candidate = reaper.GetMediaItem(0, index)
    if wanted ~= '' and item_guid(candidate) == wanted then
      item = candidate
      break
    end
  end
  if not item then
    return nil, nil, item_text, 'item'
  end
  local wanted_take = normalize_guid(take_text)
  for index = 0, reaper.CountTakes(item) - 1 do
    local take = reaper.GetTake(item, index)
    if take and wanted_take ~= '' and take_guid(take) == wanted_take then
      return item, take
    end
  end
  return nil, nil, take_text, 'take'
end

-- What a hidden take saved under HIDDEN_KEY, or nil when it is not hidden. Any non-empty value counts as hidden, so a
-- value that does not read as a number is never overwritten with the 0 the take now plays at.
local function saved_volume(take)
  local _, saved = reaper.GetSetMediaItemTakeInfo_String(take, HIDDEN_KEY, '', false)
  if saved == nil or saved == '' then
    return nil
  end
  return saved
end

local function hide_takes(session_dir, run_id, item_text, keep_text)
  if not reaper.APIExists('SetActiveTake') then
    event(session_dir, 'ERROR', run_id, 'This REAPER version cannot choose the active take.')
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, 'REAPER is recording. Stop recording first.')
    return
  end
  local item, keep, stale, reason = resolve(item_text, keep_text)
  if not item then
    event(session_dir, 'ITEM_STALE', run_id, stale, reason)
    return
  end
  local to_hide = {}
  for index = 0, reaper.CountTakes(item) - 1 do
    local take = reaper.GetTake(item, index)
    if take and take ~= keep and saved_volume(take) == nil then
      to_hide[#to_hide + 1] = take
    end
  end
  -- A kept take whose saved volume is unreadable is left as it is: no volume is guessed.
  local restore = tonumber(saved_volume(keep) or '')
  local activate = reaper.GetActiveTake(item) ~= keep
  if #to_hide == 0 and restore == nil and not activate then
    event(session_dir, 'TAKES_HIDDEN', run_id, item_guid(item), 0, 0)
    return
  end
  reaper.Undo_BeginBlock2(0)
  for _, take in ipairs(to_hide) do
    local volume = reaper.GetMediaItemTakeInfo_Value(take, 'D_VOL')
    reaper.GetSetMediaItemTakeInfo_String(take, HIDDEN_KEY, string.format('%.17g', volume), true)
    reaper.SetMediaItemTakeInfo_Value(take, 'D_VOL', 0)
  end
  if restore ~= nil then
    reaper.SetMediaItemTakeInfo_Value(keep, 'D_VOL', restore)
    reaper.GetSetMediaItemTakeInfo_String(keep, HIDDEN_KEY, '', true)
  end
  if activate then
    reaper.SetActiveTake(keep)
  end
  reaper.UpdateItemInProject(item)
  reaper.Undo_EndBlock2(0, 'Narration Utils: hide other takes', -1)
  reaper.UpdateArrange()
  event(session_dir, 'TAKES_HIDDEN', run_id, item_guid(item), #to_hide, 1)
end

-- stack_takes and unstack_takes ------------------------------------------------------------------------------------

local UNDO_STACK = 'Narration Utils: stack takes'
local UNDO_UNSTACK = 'Narration Utils: unstack takes'
-- What a stacked take records: the read's item GUID, its take GUID, its track GUID, its start and its offset from the
-- first read's start, '|'-separated.
local STACK_KEY = 'P_EXT:narration_utils_stacked_from'
-- The Cuts track's key and name, as narration_range.lua's delete_range writes them.
local CUTS_KEY = 'P_EXT:narration_utils_cuts'
local CUTS_NAME = 'Cuts'
-- How far a read may sit from the time the app sent and still be the read it meant: the host rounds times to a tenth.
local POSITION_TOLERANCE = 0.05
local EDGE_TOLERANCE = 0.000001
local MAX_PAYLOAD_BYTES = 65536
local MAX_GROUPS = 200
local MAX_MOVES = 500
local GUID_SHAPE = '^{' .. ('%x'):rep(8) .. '%-' .. ('%x'):rep(4) .. '%-' .. ('%x'):rep(4) .. '%-' .. ('%x'):rep(4) .. '%-' .. ('%x'):rep(12) .. '}$'

local NOT_FOUND = 'The stacking request was not found.'
local UNREADABLE = 'The stacking request is not readable, so nothing changed.'
local TOO_LARGE = 'The stacking request is too large, so nothing changed.'
local RECORDING = 'REAPER is recording. Stop recording first.'

-- A GUID field exactly shaped like one, upper-cased; nil otherwise.
local function guid_field(text)
  if not text:match(GUID_SHAPE) then
    return nil
  end
  return text:upper()
end

-- A plain decimal number (no exponent, hex, inf or nan), or nil.
local function seconds_field(text)
  if #text > 32 or not text:match('^%-?%d+%.?%d*$') then
    return nil
  end
  return tonumber(text)
end

local function split_fields(line)
  local fields = {}
  for field in (line .. '|'):gmatch('(.-)|') do
    fields[#fields + 1] = field
  end
  return fields
end

-- The request in the payload file, or nil and the sentence to answer. `sign` is -1 for a stack (the audio after moves
-- earlier) and 1 for an un-stack. Only the path the host sent is opened.
local function read_stack_payload(path, sign)
  local input = io.open(path, 'rb')
  if not input then
    return nil, NOT_FOUND
  end
  local size = input:seek('end')
  if not size or size > MAX_PAYLOAD_BYTES then
    input:close()
    return nil, TOO_LARGE
  end
  input:seek('set')
  local request, seen, moves, problem = { groups = {} }, {}, 0, nil
  local function named(guid)
    if not guid or seen[guid] then
      return nil
    end
    seen[guid] = true
    return guid
  end
  for raw in input:lines() do
    local fields = split_fields((raw:gsub('\r$', '')))
    local kind = fields[1]
    if request.shift == nil then
      local shift = kind == 'shift' and #fields == 2 and seconds_field(fields[2]) or nil
      if not shift or shift * sign < 0 then
        problem = UNREADABLE
        break
      end
      request.shift = shift
    elseif kind == 'group' and #fields == 3 then
      local item, base = named(guid_field(fields[2])), named(guid_field(fields[3]))
      if not item or not base then
        problem = UNREADABLE
        break
      end
      if #request.groups >= MAX_GROUPS then
        problem = TOO_LARGE
        break
      end
      request.groups[#request.groups + 1] = { item = item, base = base, moves = {} }
    elseif kind == 'move' and #fields == 5 then
      local group = request.groups[#request.groups]
      local take = named(guid_field(fields[2]))
      local from, to, length = seconds_field(fields[3]), seconds_field(fields[4]), seconds_field(fields[5])
      if not group or not take or not from or from < 0 or not to or to < 0 or not length or length <= 0 then
        problem = UNREADABLE
        break
      end
      moves = moves + 1
      if moves > MAX_MOVES then
        problem = TOO_LARGE
        break
      end
      group.moves[#group.moves + 1] = { take = take, from = from, to = to, length = length }
    else
      problem = UNREADABLE
      break
    end
  end
  input:close()
  if problem or request.shift == nil then
    return nil, problem or UNREADABLE
  end
  for _, group in ipairs(request.groups) do
    if #group.moves == 0 then
      return nil, UNREADABLE
    end
  end
  return request
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
local function take_on(item, guid)
  for index = 0, reaper.CountTakes(item) - 1 do
    local take = reaper.GetTake(item, index)
    if take and take_guid(take) == guid then
      return take
    end
  end
  return nil
end
-- The take with that GUID on any item, and its item.
local function find_take(guid)
  for index = 0, reaper.CountMediaItems(0) - 1 do
    local item = reaper.GetMediaItem(0, index)
    local take = take_on(item, guid)
    if take then
      return take, item
    end
  end
  return nil, nil
end
local function track_guid(track)
  return normalize_guid(reaper.GetTrackGUID(track))
end
local function position_of(item)
  return reaper.GetMediaItemInfo_Value(item, 'D_POSITION')
end
local function length_of(item)
  return reaper.GetMediaItemInfo_Value(item, 'D_LENGTH')
end
local function near(a, b)
  return math.abs(a - b) <= POSITION_TOLERANCE + EDGE_TOLERANCE
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

-- How far each item on the groups' tracks moves: the sum of the shifts of the groups on its track whose `from` (the
-- end of what moves, for a stack; the first read's end, for an un-stack) it starts at or after. Read before any
-- change. Items in `skip` (the reads that move to or from the Cuts track) are left out.
local function following(groups, skip)
  local out, tracks = {}, {}
  for _, group in ipairs(groups) do
    if not tracks[group.track] then
      tracks[group.track] = true
      for index = 0, reaper.CountTrackMediaItems(group.track) - 1 do
        local item = reaper.GetTrackMediaItem(group.track, index)
        if not skip[item] then
          out[#out + 1] = { item = item, position = position_of(item), delta = 0 }
        end
      end
    end
  end
  for _, entry in ipairs(out) do
    for _, group in ipairs(groups) do
      if group.track == reaper.GetMediaItem_Track(entry.item) and entry.position >= group.after - EDGE_TOLERANCE then
        entry.delta = entry.delta + group.shift
      end
    end
  end
  return out
end

local function shifts_match(groups, wanted)
  local total = 0
  for _, group in ipairs(groups) do
    total = total + group.shift
  end
  return math.abs(total - wanted) <= POSITION_TOLERANCE * (#groups + 1) + EDGE_TOLERANCE, total
end

local function stack_ready(session_dir, run_id, needed, sentence)
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return false
  end
  for _, name in ipairs(needed) do
    if not reaper.APIExists(name) then
      event(session_dir, 'ERROR', run_id, sentence)
      return false
    end
  end
  return true
end

-- What a stacked take recorded, or nil.
local function stack_record(take)
  local _, text = reaper.GetSetMediaItemTakeInfo_String(take, STACK_KEY, '', false)
  local fields = split_fields(text or '')
  local offset = tonumber(fields[5] or '')
  if #fields ~= 5 or not offset then
    return nil
  end
  return { item = normalize_guid(fields[1]), take = normalize_guid(fields[2]), track = normalize_guid(fields[3]), offset = offset }
end

-- Every group resolved and checked, or nil after answering the refusal. Changes nothing.
local function plan_stack(session_dir, run_id, request, cuts)
  local groups, moving, takes = {}, {}, 0
  local function refuse(kind, ...)
    event(session_dir, kind, run_id, ...)
    return nil
  end
  for _, wanted in ipairs(request.groups) do
    local item = find_item(wanted.item)
    if not item then
      return refuse('ITEM_STALE', wanted.item, 'item')
    end
    if not take_on(item, wanted.base) then
      return refuse('ITEM_STALE', wanted.base, 'take')
    end
    local track = reaper.GetMediaItem_Track(item)
    if cuts and track == cuts then
      return refuse('ERROR', 'That audio is already on the Cuts track.')
    end
    if reaper.GetMediaTrackInfo_Value(track, 'I_FREEMODE') == 2 then
      return refuse('ERROR', 'This track uses fixed item lanes, so its reads cannot be stacked as takes.')
    end
    for index = 0, reaper.CountTakes(item) - 1 do
      local take = reaper.GetTake(item, index)
      if take and stack_record(take) then
        return refuse('ERROR', 'That first read already has stacked takes. Move them back first, so nothing was stacked.')
      end
    end
    local first, length = position_of(item), length_of(item)
    local group = { item = item, track = track, first = first, after = first + length, moves = {} }
    for _, move in ipairs(wanted.moves) do
      local take, read = find_take(move.take)
      if not take then
        return refuse('ITEM_STALE', move.take, 'take')
      end
      if read == item or moving[read] then
        return refuse('ERROR', UNREADABLE)
      end
      if reaper.GetMediaItem_Track(read) ~= track then
        return refuse('ERROR', 'A read to stack is on another track than the first read.')
      end
      local at, span = position_of(read), length_of(read)
      if not near(at, move.from) or not near(span, move.length) then
        return refuse('ITEM_STALE', move.take, 'take')
      end
      if not near(move.to, first) then
        return refuse('ERROR', 'A take can only go to the first read’s spot.')
      end
      if span > length + EDGE_TOLERANCE then
        return refuse('ERROR', 'That read is longer than the first read, so it cannot be one of its takes.')
      end
      if reaper.TakeIsMIDI(take) then
        return refuse('ERROR', 'A MIDI read cannot be stacked.')
      end
      if reaper.GetMediaItemTakeInfo_Value(take, 'D_PLAYRATE') ~= 1 then
        return refuse('ERROR', 'A read with a changed playback rate cannot be stacked.')
      end
      local file = reaper.GetMediaSourceFileName(reaper.GetMediaItemTake_Source(take), '')
      if not file or file == '' then
        return refuse('ERROR', 'A read to stack has no audio file.')
      end
      if not core.file_exists(file) then
        return refuse('ERROR', 'The audio file of a read to stack is missing, so nothing was stacked.')
      end
      moving[read] = true
      group.moves[#group.moves + 1] = {
        item = read,
        take = take,
        file = file,
        at = at,
        offset = at - first,
        startoffs = reaper.GetMediaItemTakeInfo_Value(take, 'D_STARTOFFS'),
      }
      group.after = math.max(group.after, at + span)
    end
    group.shift = first + length - group.after
    takes = takes + #group.moves
    groups[#groups + 1] = group
  end
  for _, group in ipairs(groups) do
    for index = 0, reaper.CountTrackMediaItems(group.track) - 1 do
      local other = reaper.GetTrackMediaItem(group.track, index)
      local at = position_of(other)
      if other ~= group.item and not moving[other] and at > group.first + EDGE_TOLERANCE and at < group.after - EDGE_TOLERANCE then
        return refuse('ERROR', 'Other audio sits between the reads, so nothing was stacked.')
      end
    end
  end
  local matches, total = shifts_match(groups, request.shift)
  if not matches then
    return refuse('ERROR', 'The chapter changed since the plan was made. Nothing was stacked.')
  end
  return { groups = groups, takes = takes, total = total, moving = moving }
end

local function stack_takes(session_dir, run_id, payload_path)
  local request, problem = read_stack_payload(payload_path, -1)
  if not request then
    event(session_dir, 'ERROR', run_id, problem)
    return
  end
  if #request.groups == 0 then
    event(session_dir, 'ERROR', run_id, 'Nothing to stack.')
    return
  end
  local needed = { 'AddTakeToMediaItem', 'PCM_Source_CreateFromFile', 'SetMediaItemTake_Source', 'MoveMediaItemToTrack', 'InsertTrackAtIndex' }
  if not stack_ready(session_dir, run_id, needed, 'This REAPER version cannot stack takes.') then
    return
  end
  local found, keyed = find_cuts()
  local plan = plan_stack(session_dir, run_id, request, found)
  if not plan then
    return
  end
  local later = following(plan.groups, plan.moving)

  reaper.Undo_BeginBlock2(0)
  local cuts = ensure_cuts(found, keyed)
  for _, group in ipairs(plan.groups) do
    local track = track_guid(group.track)
    for _, move in ipairs(group.moves) do
      local take = reaper.AddTakeToMediaItem(group.item)
      reaper.SetMediaItemTake_Source(take, reaper.PCM_Source_CreateFromFile(move.file))
      reaper.SetMediaItemTakeInfo_Value(take, 'D_STARTOFFS', move.startoffs)
      local record = string.format('%s|%s|%s|%.6f|%.6f', item_guid(move.item), take_guid(move.take), track, move.at, move.offset)
      reaper.GetSetMediaItemTakeInfo_String(take, STACK_KEY, record, true)
      reaper.MoveMediaItemToTrack(move.item, cuts)
    end
  end
  for _, entry in ipairs(later) do
    if entry.delta ~= 0 then
      reaper.SetMediaItemInfo_Value(entry.item, 'D_POSITION', entry.position + entry.delta)
    end
  end
  for _, group in ipairs(plan.groups) do
    reaper.UpdateItemInProject(group.item)
  end
  reaper.Undo_EndBlock2(0, UNDO_STACK, -1)
  reaper.UpdateArrange()
  event(session_dir, 'TAKES_STACKED', run_id, #plan.groups, plan.takes, string.format('%.3f', plan.total), 1)
end

-- The item's state chunk without the takes whose GUIDs are in `remove`, and how many it left out. A take after the
-- first starts at a `TAKE` line at the item's own level and runs to the next one or the item's closing `>`; its
-- nested blocks (<SOURCE ...>, <TAKEFX ...>) stay inside it. A take whose GUID it does not find is kept.
local function chunk_without(chunk, remove)
  local out, segment, segment_guid, depth, removed = {}, nil, nil, 0, 0
  local function flush()
    if segment then
      if segment_guid and remove[segment_guid] then
        removed = removed + 1
      else
        for _, line in ipairs(segment) do
          out[#out + 1] = line
        end
      end
    end
    segment, segment_guid = nil, nil
  end
  for line in chunk:gmatch('[^\r\n]+') do
    local text = line:match('^%s*(.-)%s*$')
    if depth == 1 and (text == 'TAKE' or text:match('^TAKE%s')) then
      flush()
      segment = { line }
    elseif depth == 1 and text == '>' then
      flush()
      out[#out + 1] = line
    elseif segment then
      segment[#segment + 1] = line
      local guid = depth == 1 and text:match('^GUID%s+(%S+)$')
      if guid then
        segment_guid = normalize_guid(guid)
      end
    else
      out[#out + 1] = line
    end
    if text:sub(1, 1) == '<' then
      depth = depth + 1
    elseif text == '>' then
      depth = depth - 1
    end
  end
  return table.concat(out, '\n') .. '\n', removed
end

local function plan_unstack(session_dir, run_id, request)
  local cuts = find_cuts()
  local groups, moving, takes = {}, {}, 0
  local function refuse(kind, ...)
    event(session_dir, kind, run_id, ...)
    return nil
  end
  for _, wanted in ipairs(request.groups) do
    local item = find_item(wanted.item)
    if not item then
      return refuse('ITEM_STALE', wanted.item, 'item')
    end
    if not take_on(item, wanted.base) then
      return refuse('ITEM_STALE', wanted.base, 'take')
    end
    local track = reaper.GetMediaItem_Track(item)
    local first, length = position_of(item), length_of(item)
    local records = {}
    for index = 0, reaper.CountTakes(item) - 1 do
      local take = reaper.GetTake(item, index)
      local record = take and stack_record(take)
      if record then
        record.stacked = take_guid(take)
        records[record.take] = record
      end
    end
    local group = { item = item, base = wanted.base, track = track, first = first, after = first + length, moves = {}, remove = {} }
    local active = reaper.GetActiveTake(item)
    group.keep = active and take_guid(active) or wanted.base
    for _, move in ipairs(wanted.moves) do
      local record = records[move.take]
      if not record or not near(move.from, first) then
        return refuse('ITEM_STALE', move.take, 'take')
      end
      local read = find_item(record.item)
      if not read or reaper.GetMediaItem_Track(read) ~= cuts then
        return refuse('ITEM_STALE', record.item, 'item')
      end
      if record.track ~= track_guid(track) then
        return refuse('ITEM_STALE', wanted.item, 'item')
      end
      local span = length_of(read)
      if not near(span, move.length) then
        return refuse('ITEM_STALE', move.take, 'take')
      end
      if not near(move.to, first + record.offset) then
        return refuse('ERROR', 'The chapter changed since the plan was made. Nothing was moved back.')
      end
      moving[read] = true
      group.remove[record.stacked] = true
      group.moves[#group.moves + 1] = { item = read, offset = record.offset }
      group.after = math.max(group.after, first + record.offset + span)
    end
    for _, record in pairs(records) do
      if not group.remove[record.stacked] then
        return refuse('ERROR', 'Every take stacked on that first read goes back together, so nothing was moved back.')
      end
    end
    if group.remove[group.keep] then
      group.keep = wanted.base
    end
    local _, chunk = reaper.GetItemStateChunk(item, '', false)
    local trimmed, removed = chunk_without(chunk or '', group.remove)
    if removed ~= #group.moves then
      return refuse('ERROR', 'REAPER did not list the stacked takes, so nothing was moved back.')
    end
    group.chunk = trimmed
    -- The audio after the first read moves out by what the reads need.
    group.shift = group.after - (first + length)
    group.after = first + length
    takes = takes + #group.moves
    groups[#groups + 1] = group
  end
  local matches, total = shifts_match(groups, request.shift)
  if not matches then
    return refuse('ERROR', 'The chapter changed since the plan was made. Nothing was moved back.')
  end
  return { groups = groups, takes = takes, total = total, moving = moving }
end

local function unstack_takes(session_dir, run_id, payload_path)
  local request, problem = read_stack_payload(payload_path, 1)
  if not request then
    event(session_dir, 'ERROR', run_id, problem)
    return
  end
  if #request.groups == 0 then
    event(session_dir, 'ERROR', run_id, 'Nothing to un-stack.')
    return
  end
  local needed = { 'GetItemStateChunk', 'SetItemStateChunk', 'MoveMediaItemToTrack', 'SetActiveTake' }
  if not stack_ready(session_dir, run_id, needed, 'This REAPER version cannot un-stack takes.') then
    return
  end
  local plan = plan_unstack(session_dir, run_id, request)
  if not plan then
    return
  end
  local later = following(plan.groups, plan.moving)
  local moved = {}
  for _, entry in ipairs(later) do
    moved[entry.item] = entry.delta
  end

  reaper.Undo_BeginBlock2(0)
  for _, group in ipairs(plan.groups) do
    reaper.SetItemStateChunk(group.item, group.chunk, false)
    local kept = take_on(group.item, group.keep)
    if kept and reaper.GetActiveTake(group.item) ~= kept then
      reaper.SetActiveTake(kept)
    end
  end
  for _, entry in ipairs(later) do
    if entry.delta ~= 0 then
      reaper.SetMediaItemInfo_Value(entry.item, 'D_POSITION', entry.position + entry.delta)
    end
  end
  for _, group in ipairs(plan.groups) do
    local first = group.first + (moved[group.item] or 0)
    for _, move in ipairs(group.moves) do
      reaper.MoveMediaItemToTrack(move.item, group.track)
      reaper.SetMediaItemInfo_Value(move.item, 'D_POSITION', first + move.offset)
    end
    reaper.UpdateItemInProject(group.item)
  end
  reaper.Undo_EndBlock2(0, UNDO_UNSTACK, -1)
  reaper.UpdateArrange()
  event(session_dir, 'TAKES_UNSTACKED', run_id, #plan.groups, plan.takes, string.format('%.3f', plan.total), 1)
end

return function(registry)
  registry.register('hide_takes', function(ctx, args)
    hide_takes(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '')
  end)
  registry.register('stack_takes', function(ctx, args)
    stack_takes(ctx.session_dir, args[1] or '', args[2] or '')
  end)
  registry.register('unstack_takes', function(ctx, args)
    unstack_takes(ctx.session_dir, args[1] or '', args[2] or '')
  end)
end
