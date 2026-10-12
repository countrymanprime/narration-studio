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

return function(registry)
  registry.register('hide_takes', function(ctx, args)
    hide_takes(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '')
  end)
end
