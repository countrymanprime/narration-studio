-- Carries the app's extension data (P_EXT) in an open REAPER project from the key names it had before the product was renamed
-- to the current ones, so every command reads only the current names. scripts/ci/old-name.mjs allows the old name in this file
-- and in internal/legacyname (the Go side, which does the same for a saved .rpp) and nowhere else.
--
-- It runs once per open project per bridge session, before the first command for that project. A value under an old key is
-- copied to the current key when that one is empty, and the old key is cleared. Nothing else is touched, and no undo point is
-- made: the bridge runs in a deferred loop, so REAPER adds none, and undoing a carry-over would only bring the old names back.

local M = {}

-- The prefixes, without REAPER's P_EXT: part.
M.OLD_PREFIX, M.NEW_PREFIX = 'narration_utils_', 'narration_studio_'
local OLD, NEW = 'P_EXT:' .. M.OLD_PREFIX, 'P_EXT:' .. M.NEW_PREFIX

-- The keys the bridge writes, by what holds them (narration_range.lua, narration_takes.lua, narration_line_identity.lua,
-- narration_retake_lanes.lua, narration_take_review.lua).
M.TRACK_KEYS = { 'cuts' }
M.ITEM_KEYS = { 'line_id', 'line_text', 'room_tone' }
M.TAKE_KEYS = {
  'fx_range_chain',
  'fx_range_fx',
  'fx_range_seams',
  'take_finding_id',
  'take_source_file',
  'take_source_range',
  'take_hidden_volume',
  'stacked_from',
  'split_from',
}

local function carry(get_set, object, keys)
  local moved = 0
  for _, key in ipairs(keys) do
    local _, old = get_set(object, OLD .. key, '', false)
    if old and old ~= '' then
      local _, current = get_set(object, NEW .. key, '', false)
      if not current or current == '' then
        get_set(object, NEW .. key, old, true)
      end
      get_set(object, OLD .. key, '', true)
      moved = moved + 1
    end
  end
  return moved
end

-- Carries every old key in project over; answers how many values moved.
function M.carry_over(project)
  local moved = 0
  for index = 0, reaper.CountTracks(project) - 1 do
    moved = moved + carry(reaper.GetSetMediaTrackInfo_String, reaper.GetTrack(project, index), M.TRACK_KEYS)
  end
  for index = 0, reaper.CountMediaItems(project) - 1 do
    local item = reaper.GetMediaItem(project, index)
    moved = moved + carry(reaper.GetSetMediaItemInfo_String, item, M.ITEM_KEYS)
    for take_index = 0, reaper.CountTakes(item) - 1 do
      local take = reaper.GetTake(item, take_index)
      if take then
        moved = moved + carry(reaper.GetSetMediaItemTakeInfo_String, take, M.TAKE_KEYS)
      end
    end
  end
  return moved
end

-- A function that carries the active project over the first time it is called for that project (by its pointer and path).
function M.once_per_project()
  local done = {}
  return function()
    local project, path = reaper.EnumProjects(-1, '')
    local key = tostring(project) .. '|' .. tostring(path or '')
    if not project or done[key] then
      return 0
    end
    done[key] = true
    return M.carry_over(project)
  end
end

return M
