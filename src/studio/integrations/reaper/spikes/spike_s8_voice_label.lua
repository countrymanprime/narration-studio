-- Spike S8 (voice sample labels): what a REAPER region does when it is the record of a stretch of audio. Phase 6 of
-- docs/prds/character-voice-samples.prd.md keeps a voice sample as a region whose name carries the character and the label;
-- the app reads it back from the saved project. This script answers, in a scratch project, the questions that design rests
-- on and a fake cannot answer:
--
--   A. Shape: what the saved .rpp holds for a region added by AddProjectMarker2 (the MARKER lines, the name with quotes,
--      pipes, a newline and non-ASCII text, the colour field, the GUID), and whether the GUID survives a re-save.
--   B. Unsaved: whether the live project has the region before it is saved, whether the saved file lacks it until then,
--      and whether GetProjectStateChangeCount rises (the host's "not saved in REAPER yet" signal).
--   C. Edits: what happens to the region when its item is moved, shortened, ripple-edited and split. A region is in
--      project time, so it is expected NOT to follow; the report records what the item and the region report after each.
--   D. Undo: one undo block holds the add (and a move of it); Undo removes it and Redo brings it back; whether the GUID
--      survives.
--   E. Move in place: SetProjectMarker4 keeps the number and the GUID when the name or the bounds change.
--   F. Source mapping: for an item with a take offset, the source range a region maps to (region start - item position +
--      D_STARTOFFS, at playback rate 1) and for a take at another rate.
--
-- Nothing plays or records. Writes voice-label-report.txt, the saved project copies under saved/ and a done marker.
-- Run with run-reaper.ps1 (it sets the scratch folders); see README.md in this folder.

do
  local BACKSLASH = string.char(92)
  local wanted = os.getenv('NARRATION_UTILS_SPIKE_CFG')
  local actual = reaper.GetResourcePath()
  assert(wanted and wanted ~= '', 'NARRATION_UTILS_SPIKE_CFG is not set: start this script with run-reaper.ps1')
  assert(actual:gsub(BACKSLASH, '/'):lower() == wanted:gsub(BACKSLASH, '/'):lower(), 'REAPER is not using the isolated -cfgfile: ' .. actual)
  reaper.Audio_Quit()
  assert(reaper.Audio_IsRunning() == 0, 'the audio device could not be closed')
end

local PACK = assert(os.getenv('NARRATION_UTILS_SPIKE_OUT'), 'set NARRATION_UTILS_SPIKE_OUT (run-reaper.ps1 does)')
PACK = PACK:gsub(string.char(92), '/')
local function native(path)
  return (path:gsub('/', string.char(92)))
end

local report = {}
local function log(...)
  local parts = {}
  for index = 1, select('#', ...) do
    parts[#parts + 1] = tostring((select(index, ...)))
  end
  report[#report + 1] = table.concat(parts, ' ')
end
local function finish()
  local handle = io.open(PACK .. '/voice-label-report.txt', 'wb')
  handle:write(table.concat(report, '\n'), '\n')
  handle:close()
  local done = io.open(PACK .. '/done.txt', 'wb')
  done:write('done\n')
  done:close()
  reaper.Main_OnCommand(40004, 0) -- File: Quit REAPER
end

local function read_file(path)
  local handle = io.open(path, 'rb')
  if not handle then
    return nil
  end
  local text = handle:read('a')
  handle:close()
  return text
end

-- The MARKER lines of a saved project, one string per line, so the report shows them as REAPER wrote them.
local function marker_lines(path)
  local text = read_file(path)
  local lines = {}
  if not text then
    return lines
  end
  for line in text:gmatch('[^\r\n]+') do
    if line:match('^%s*MARKER ') then
      lines[#lines + 1] = line
    end
  end
  return lines
end

local function log_markers(label, path)
  local lines = marker_lines(path)
  log(label, 'MARKER lines:', #lines)
  for _, line in ipairs(lines) do
    log('  ' .. line)
  end
end

-- The live regions, as EnumProjectMarkers3 reports them.
local function live_regions()
  local regions, index = {}, 0
  while true do
    local next_index, is_region, first, last, name, number = reaper.EnumProjectMarkers3(0, index)
    if next_index == 0 then
      break
    end
    if is_region then
      regions[#regions + 1] = string.format('#%s [%.3f, %.3f] %q', tostring(number), first, last, name)
    end
    index = index + 1
  end
  return regions
end
local function log_live(label)
  local regions = live_regions()
  log(label, 'live regions:', #regions)
  for _, line in ipairs(regions) do
    log('  ' .. line)
  end
end

local function save_as(name)
  local path = PACK .. '/saved/' .. name
  reaper.Main_SaveProjectEx(0, native(path), 0)
  return path
end

local ok, err = xpcall(function()
  os.execute('mkdir "' .. native(PACK .. '/saved') .. '" 2>nul')
  reaper.Main_OnCommand(40023, 0) -- File: New project
  log('version', reaper.GetAppVersion(), 'os', reaper.GetOS())
  save_as('s8-base.rpp') -- so REAPER knows the project folder

  local tone = PACK .. '/media/take_a.wav'
  assert(read_file(tone), 'run make_media.py first: ' .. tone .. ' is missing')
  reaper.InsertTrackAtIndex(0, true)
  local track = reaper.GetTrack(0, 0)
  local function add_item(position, length, start_offset, rate)
    local item = reaper.AddMediaItemToTrack(track)
    reaper.SetMediaItemInfo_Value(item, 'D_POSITION', position)
    reaper.SetMediaItemInfo_Value(item, 'D_LENGTH', length)
    local take = reaper.AddTakeToMediaItem(item)
    reaper.SetMediaItemTake_Source(take, reaper.PCM_Source_CreateFromFile(tone))
    reaper.SetMediaItemTakeInfo_Value(take, 'D_STARTOFFS', start_offset)
    reaper.SetMediaItemTakeInfo_Value(take, 'D_PLAYRATE', rate)
    return item, take
  end
  local item_a, take_a = add_item(10, 2, 0.5, 1) -- project 10..12 plays source 0.5..2.5
  local item_b = add_item(20, 2, 0, 1.5) -- project 20..22 plays source 0..3 at 1.5x
  local item_after = add_item(30, 2, 0, 1) -- sits after the others, to see a ripple move it
  reaper.UpdateArrange()

  local name = 'Voice sample|Hatter|Angry, to the "Duke"' .. string.char(92) .. ' Caf' .. string.char(195, 169) .. ' \u{1F600}'
  local count_before = reaper.GetProjectStateChangeCount(0)

  -- D (and A, B): the add as one undo block.
  reaper.Undo_BeginBlock2(0)
  local added = reaper.AddProjectMarker2(0, true, 10.5, 11.5, name, -1, reaper.ColorToNative(255, 136, 0) + 0x1000000)
  reaper.Undo_EndBlock2(0, 'Add voice sample label', -1)
  log('A. AddProjectMarker2 answered', added)
  log_live('B. after add,')
  log('B. state change count before/after add:', count_before, reaper.GetProjectStateChangeCount(0))
  log('B. saved base project still has the region?', #marker_lines(PACK .. '/saved/s8-base.rpp') > 0)

  local saved_one = save_as('s8-saved-one.rpp')
  log_markers('A. saved once,', saved_one)
  local resaved = save_as('s8-saved-two.rpp')
  log_markers('A. re-saved unchanged,', resaved)

  -- E: move in place.
  local _, is_region, first, last, current_name, number = reaper.EnumProjectMarkers3(0, 0)
  log('E. first enumerated marker:', is_region, first, last, current_name, number)
  local moved = reaper.SetProjectMarker4(0, number, true, 10.6, 11.4, name, 0, 0)
  log('E. SetProjectMarker4 (new bounds, same name) answered', moved)
  log_live('E. after move,')
  log_markers('E. saved after move,', save_as('s8-moved.rpp'))
  local renamed = reaper.SetProjectMarker4(0, number, true, 10.6, 11.4, 'Voice sample|Hatter|Renamed', 0, 0)
  log('E. SetProjectMarker4 (new name) answered', renamed)
  log_markers('E. saved after rename,', save_as('s8-renamed.rpp'))

  -- C: edits to the item under the region.
  log('C. item A before:', reaper.GetMediaItemInfo_Value(item_a, 'D_POSITION'), reaper.GetMediaItemInfo_Value(item_a, 'D_LENGTH'))
  reaper.SetMediaItemInfo_Value(item_a, 'D_POSITION', 14)
  reaper.UpdateArrange()
  log('C. item A moved to 14 (D_POSITION):', reaper.GetMediaItemInfo_Value(item_a, 'D_POSITION'))
  log_live('C. after moving the item,')
  reaper.SetMediaItemInfo_Value(item_a, 'D_POSITION', 10)
  reaper.SetMediaItemInfo_Value(item_a, 'D_LENGTH', 0.8)
  log('C. item A shortened to 0.8 s; region still:')
  log_live('C. after shortening the item,')
  reaper.SetMediaItemInfo_Value(item_a, 'D_LENGTH', 2)
  -- Ripple: delete a stretch of the track with ripple editing on and see whether the later item and the region move.
  local after_before = reaper.GetMediaItemInfo_Value(item_after, 'D_POSITION')
  reaper.Main_OnCommand(41990, 0) -- Options: Toggle ripple editing per-track
  reaper.GetSet_LoopTimeRange(true, false, 12.5, 14, false)
  reaper.Main_OnCommand(40201, 0) -- Time selection: Remove contents of time selection (moving later items)
  log('C. item after: position before/after the ripple delete:', after_before, reaper.GetMediaItemInfo_Value(item_after, 'D_POSITION'))
  log_live('C. after the ripple delete,')
  reaper.Main_OnCommand(41990, 0) -- toggle ripple back

  -- D: undo and redo of the add.
  local undo_before = reaper.Undo_CanUndo2(0)
  log('D. next undo step is:', undo_before)
  log_markers('D. saved before undoing everything,', save_as('s8-before-undo.rpp'))
  for _ = 1, 20 do
    if reaper.Undo_CanUndo2(0) and reaper.Undo_CanUndo2(0):match('voice sample') then
      break
    end
    reaper.Undo_DoUndo2(0)
  end
  log('D. undo reached step:', reaper.Undo_CanUndo2(0))
  reaper.Undo_DoUndo2(0)
  log_live('D. after undoing the add,')
  reaper.Undo_DoRedo2(0)
  log_live('D. after redoing the add,')
  log_markers('D. saved after redo,', save_as('s8-after-redo.rpp'))

  -- F: source mapping, for the region as the narrator marked it (10.5..11.5 over item A: position 10, offset 0.5, rate 1).
  local function source_range(item, take, region_first, region_last)
    local position = reaper.GetMediaItemInfo_Value(item, 'D_POSITION')
    local offset = reaper.GetMediaItemTakeInfo_Value(take, 'D_STARTOFFS')
    local rate = reaper.GetMediaItemTakeInfo_Value(take, 'D_PLAYRATE')
    return (region_first - position) * rate + offset, (region_last - position) * rate + offset, rate
  end
  local take_b = reaper.GetActiveTake(item_b)
  log('F. item A (offset 0.5, rate 1): region 10.5..11.5 maps to source', source_range(item_a, take_a, 10.5, 11.5))
  log('F. item B (offset 0, rate 1.5): region 20.5..21.5 maps to source', source_range(item_b, take_b, 20.5, 21.5))
  log('F. item B reports D_PLAYRATE and D_LENGTH:', reaper.GetMediaItemTakeInfo_Value(take_b, 'D_PLAYRATE'), reaper.GetMediaItemInfo_Value(item_b, 'D_LENGTH'))
  log('F. note: the formula above is the one the host would use; PRESERVE_PITCH and stretch markers are not covered.')
end, debug.traceback)

if not ok then
  log('ERROR', err)
end
finish()
