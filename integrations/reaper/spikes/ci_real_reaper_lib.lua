-- Helpers for the real-REAPER bridge check's scenario commands (docs/research/real-reaper-ci-integration.md). Loaded by
-- ci_real_reaper_launcher.lua, which hands them to every Lua snippet the driver (scripts/ci/real-reaper/drive.py) sends with
-- `ci_exec`. A snippet arranges a scratch project, acts as the narrator (moves an item, turns a take down) or reads the
-- project back for the driver to assert on. Research tool, not product code (integrations/reaper/spikes/README.md).

local M = {}

-- JSON ------------------------------------------------------------------------------------------------------------------

local function encode_string(text)
  return '"'
    .. tostring(text):gsub('[%c"\\]', function(char)
      local named = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
      return named[char] or string.format('\\u%04x', char:byte())
    end)
    .. '"'
end

function M.json(value)
  local kind = type(value)
  if kind == 'nil' then
    return 'null'
  elseif kind == 'boolean' or kind == 'number' then
    if kind == 'number' and (value ~= value or value == math.huge or value == -math.huge) then
      return 'null'
    end
    return kind == 'number' and string.format('%.9g', value) or tostring(value)
  elseif kind == 'string' then
    return encode_string(value)
  end
  assert(kind == 'table', 'cannot encode a ' .. kind)
  if #value > 0 or next(value) == nil then
    local parts = {}
    for index, entry in ipairs(value) do
      parts[index] = M.json(entry)
    end
    return '[' .. table.concat(parts, ',') .. ']'
  end
  local keys = {}
  for key in pairs(value) do
    keys[#keys + 1] = tostring(key)
  end
  table.sort(keys)
  local parts = {}
  for _, key in ipairs(keys) do
    parts[#parts + 1] = encode_string(key) .. ':' .. M.json(value[key])
  end
  return '{' .. table.concat(parts, ',') .. '}'
end

-- Project reads ---------------------------------------------------------------------------------------------------------

function M.item_guid(item)
  local _, guid = reaper.GetSetMediaItemInfo_String(item, 'GUID', '', false)
  return guid
end

function M.take_guid(take)
  local _, guid = reaper.GetSetMediaItemTakeInfo_String(take, 'GUID', '', false)
  return guid
end

function M.basename(path)
  return (tostring(path or ''):gsub('\\', '/'):match('([^/]*)$'))
end

function M.track_by_name(name)
  for index = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, index)
    local _, found = reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', '', false)
    if found == name then
      return track
    end
  end
  return nil
end

function M.item(guid)
  for index = 0, reaper.CountMediaItems(0) - 1 do
    local item = reaper.GetMediaItem(0, index)
    if M.item_guid(item) == guid then
      return item
    end
  end
  return nil
end

function M.take(guid)
  for index = 0, reaper.CountMediaItems(0) - 1 do
    local item = reaper.GetMediaItem(0, index)
    for slot = 0, reaper.CountTakes(item) - 1 do
      local take = reaper.GetTake(item, slot)
      if M.take_guid(take) == guid then
        return take, item
      end
    end
  end
  return nil
end

function M.take_ext(take, key)
  local ok, value = reaper.GetSetMediaItemTakeInfo_String(take, 'P_EXT:' .. key, '', false)
  return ok and value or ''
end

-- One item as the driver asserts on it: place, length, mute, volume, fades, its track's name and every take.
function M.describe_item(item)
  local track = reaper.GetMediaItemTrack(item)
  local _, track_name = reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', '', false)
  local active = reaper.GetActiveTake(item)
  local out = {
    guid = M.item_guid(item),
    track = track_name,
    position = reaper.GetMediaItemInfo_Value(item, 'D_POSITION'),
    length = reaper.GetMediaItemInfo_Value(item, 'D_LENGTH'),
    mute = reaper.GetMediaItemInfo_Value(item, 'B_MUTE') ~= 0,
    volume = reaper.GetMediaItemInfo_Value(item, 'D_VOL'),
    fade_in = reaper.GetMediaItemInfo_Value(item, 'D_FADEINLEN'),
    fade_out = reaper.GetMediaItemInfo_Value(item, 'D_FADEOUTLEN'),
    takes = {},
  }
  for slot = 0, reaper.CountTakes(item) - 1 do
    local take = reaper.GetTake(item, slot)
    if not take then
      out.takes[#out.takes + 1] = { empty = true, guid = '', active = false, file = '', offset = 0, volume = 0, rate = 1, fx = {}, envelope_points = {} }
    else
      local source = reaper.GetMediaItemTake_Source(take)
      local fx = {}
      for index = 0, reaper.TakeFX_GetCount(take) - 1 do
        local _, name = reaper.TakeFX_GetFXName(take, index, '')
        fx[#fx + 1] = { name = name, enabled = reaper.TakeFX_GetEnabled(take, index) }
      end
      out.takes[#out.takes + 1] = {
        guid = M.take_guid(take),
        active = take == active,
        file = M.basename(source and reaper.GetMediaSourceFileName(source, '') or ''),
        offset = reaper.GetMediaItemTakeInfo_Value(take, 'D_STARTOFFS'),
        volume = reaper.GetMediaItemTakeInfo_Value(take, 'D_VOL'),
        rate = reaper.GetMediaItemTakeInfo_Value(take, 'D_PLAYRATE'),
        fx = fx,
        envelope_points = M.volume_points(take),
      }
    end
  end
  return out
end

-- The take's volume envelope points as {time, value} pairs (none when it has no envelope).
function M.volume_points(take)
  local envelope = reaper.GetTakeEnvelopeByName(take, 'Volume')
  local out = {}
  if not envelope then
    return out
  end
  for index = 0, reaper.CountEnvelopePoints(envelope) - 1 do
    local _, time, value = reaper.GetEnvelopePoint(envelope, index)
    out[#out + 1] = { time = time, value = value }
  end
  return out
end

-- Every item, in position order within each track, every track in order; markers and regions; the undo label.
function M.snapshot()
  local items = {}
  for index = 0, reaper.CountMediaItems(0) - 1 do
    items[#items + 1] = M.describe_item(reaper.GetMediaItem(0, index))
  end
  table.sort(items, function(a, b)
    if a.track ~= b.track then
      return a.track < b.track
    end
    return a.position < b.position
  end)
  local tracks = {}
  for index = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, index)
    local _, name = reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', '', false)
    local fx = {}
    for slot = 0, reaper.TrackFX_GetCount(track) - 1 do
      local _, fx_name = reaper.TrackFX_GetFXName(track, slot, '')
      fx[#fx + 1] = fx_name
    end
    tracks[#tracks + 1] = {
      name = name,
      guid = reaper.GetTrackGUID(track),
      mute = reaper.GetMediaTrackInfo_Value(track, 'B_MUTE') ~= 0,
      armed = reaper.GetMediaTrackInfo_Value(track, 'I_RECARM') ~= 0,
      selected = reaper.GetMediaTrackInfo_Value(track, 'I_SELECTED') ~= 0,
      fx = fx,
    }
  end
  local markers, index = {}, 0
  while true do
    local found, is_region, first, last, name, number, color = reaper.EnumProjectMarkers3(0, index)
    if not found or found == 0 then
      break
    end
    markers[#markers + 1] = { region = is_region, start = first, finish = last, name = name, number = number, color = color }
    index = index + 1
  end
  return {
    items = items,
    tracks = tracks,
    markers = markers,
    undo = reaper.Undo_CanUndo2(0) or '',
    redo = reaper.Undo_CanRedo2(0) or '',
    cursor = reaper.GetCursorPosition(),
    play_state = reaper.GetPlayState(),
    change_count = reaper.GetProjectStateChangeCount(0),
  }
end

-- Row A10, "nothing else changed": every track's state chunk (the master's too) but those named in `except`, without the arm and selection
-- lines, and every marker and region unless `markers` is false. Two reads that are equal mean the command touched none of them.
function M.witness(except, markers)
  local skip = {}
  for _, name in ipairs(except or {}) do
    skip[name] = true
  end
  local out = {}
  local function add(track, label)
    local _, name = reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', '', false)
    if skip[name] then
      return
    end
    local _, chunk = reaper.GetTrackStateChunk(track, '', false)
    out[#out + 1] = '# ' .. label
    for line in chunk:gmatch('[^\r\n]+') do
      local key = line:match('^%s*(%S+)')
      if key ~= 'REC' and key ~= 'SEL' and key ~= 'FLOATPOS' then
        out[#out + 1] = line
      end
    end
  end
  add(reaper.GetMasterTrack(0), 'master')
  for index = 0, reaper.CountTracks(0) - 1 do
    add(reaper.GetTrack(0, index), 'track ' .. index)
  end
  if markers ~= false then
    for _, marker in ipairs(M.snapshot().markers) do
      out[#out + 1] =
        string.format('marker %s %.6f %.6f %s %s %s', tostring(marker.region), marker.start, marker.finish, marker.name, marker.number, marker.color)
    end
  end
  return table.concat(out, '\n')
end

-- Scenes ------------------------------------------------------------------------------------------------------------------

-- Empties the project (tracks, markers, every setting the scenes touch), saves it and opens it again from disk, so a scene
-- starts with no undo history and the project saved: the state a narrator's project is in when the app first looks.
function M.reset(rpp)
  while reaper.CountTracks(0) > 0 do
    reaper.DeleteTrack(reaper.GetTrack(0, 0))
  end
  local index = 0
  while reaper.EnumProjectMarkers3(0, 0) ~= 0 and index < 1000 do
    reaper.DeleteProjectMarkerByIndex(0, 0)
    index = index + 1
  end
  reaper.SetEditCurPos(0, false, false)
  reaper.GetSet_LoopTimeRange(true, false, 0, 0, false)
  reaper.Main_SaveProjectEx(0, rpp, 0)
  reaper.Main_openProject('noprompt:' .. rpp)
end

function M.add_track(name)
  local index = reaper.CountTracks(0)
  reaper.InsertTrackAtIndex(index, true)
  local track = reaper.GetTrack(0, index)
  reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', name, true)
  return track
end

-- An item on `track` at `position` for `length` seconds playing `file` from `offset`; answers the item and its take.
function M.add_item(track, file, position, length, offset)
  local item = reaper.AddMediaItemToTrack(track)
  reaper.SetMediaItemInfo_Value(item, 'D_POSITION', position)
  reaper.SetMediaItemInfo_Value(item, 'D_LENGTH', length)
  local take = reaper.AddTakeToMediaItem(item)
  local source = reaper.PCM_Source_CreateFromFile(file)
  assert(source, 'REAPER could not open ' .. file)
  reaper.SetMediaItemTake_Source(take, source)
  reaper.SetMediaItemTakeInfo_Value(take, 'D_STARTOFFS', offset or 0)
  reaper.UpdateItemInProject(item)
  return item, take
end

function M.add_take(item, file, offset)
  local take = reaper.AddTakeToMediaItem(item)
  local source = reaper.PCM_Source_CreateFromFile(file)
  assert(source, 'REAPER could not open ' .. file)
  reaper.SetMediaItemTake_Source(take, source)
  reaper.SetMediaItemTakeInfo_Value(take, 'D_STARTOFFS', offset or 0)
  return take
end

-- Writes <resource>/FXChains/<relative> holding `plugin` (as the FX browser names it), the text being REAPER's own: the plug-in is
-- added to a scratch track and the track's FX chunk is copied out (as spike_ep0_workspace.lua does). `setup(track, index)` may
-- set its parameters first. Answers the chain's full path.
function M.make_chain(relative, plugin, setup)
  reaper.InsertTrackAtIndex(reaper.CountTracks(0), false)
  local scratch = reaper.GetTrack(0, reaper.CountTracks(0) - 1)
  local index = reaper.TrackFX_AddByName(scratch, plugin, false, -1)
  assert(index >= 0, 'could not add ' .. plugin .. ' to the scratch track')
  if setup then
    setup(scratch, index)
  end
  local _, chunk = reaper.GetTrackStateChunk(scratch, '', false)
  local lines, inside, depth = {}, false, 0
  for line in chunk:gmatch('[^\r\n]+') do
    local trimmed = line:match('^%s*(.-)%s*$')
    if not inside and trimmed:match('^<FXCHAIN') then
      inside, depth = true, 1
    elseif inside then
      if trimmed:sub(1, 1) == '<' then
        depth = depth + 1
      elseif trimmed == '>' then
        depth = depth - 1
        if depth == 0 then
          break
        end
      end
      if #lines > 0 or trimmed:match('^BYPASS') then
        lines[#lines + 1] = trimmed
      end
    end
  end
  reaper.DeleteTrack(scratch)
  assert(#lines > 0, 'the scratch track has no FX chain text')
  local sep = package.config:sub(1, 1)
  local path = reaper.GetResourcePath() .. sep .. 'FXChains'
  local parts = {}
  for part in relative:gmatch('[^/]+') do
    parts[#parts + 1] = part
  end
  reaper.RecursiveCreateDirectory(path .. sep .. table.concat(parts, sep, 1, #parts - 1), 0)
  path = path .. sep .. table.concat(parts, sep)
  local handle = assert(io.open(path, 'wb'))
  handle:write(table.concat(lines, '\n') .. '\n')
  handle:close()
  return path
end

-- Saves in place and re-reads the project from disk, as a narrator who saves and reopens it: what survives is what REAPER wrote.
function M.save_and_reload(rpp)
  reaper.Main_SaveProjectEx(0, rpp, 0)
  reaper.Main_openProject('noprompt:' .. rpp)
end

return M
