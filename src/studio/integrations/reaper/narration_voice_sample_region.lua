-- A character voice sample kept in the project as a region: keep_voice_sample (add a region, or move and rename one),
-- delete_voice_sample_region (remove one) and read_voice_samples (list the regions the host named). Phase 6 of docs/prds/character-voice-samples.prd.md. Loaded by
-- narration_ui_bridge.lua, which passes the shared helpers as the chunk argument.
--
-- The host names the region (the prefix, the character and the label); this file only refuses a name or range REAPER
-- would take wrongly. A region is in project time, so it does not follow its item: the host keeps the source range
-- beside the region and compares.
--
-- keep_voice_sample <run> <number or empty> <first> <last> <name>
--   no number: adds a region, unless one with the same name and bounds within REGION_TOLERANCE is there
--   (VOICE_SAMPLE_KEPT|run|number|created or existing).
--   a number: moves and renames that region, keeping its number and colour (moved or unchanged). The number must belong
--   to a region whose name starts with SAMPLE_PREFIX, so a stale number can never move a chapter region
--   (VOICE_SAMPLE_STALE|run|number otherwise).
-- delete_voice_sample_region <run> <number>
--   removes the region that number names, in one undo point, only when its name starts with SAMPLE_PREFIX: a chapter region (or a
--   plain marker) that shares the number is never touched (VOICE_SAMPLE_STALE|run|number for a region without the prefix).
--   Idempotent: a number no region has is VOICE_SAMPLE_REMOVED|run|number|unchanged, with no undo point; a removal is |deleted.
--   Refuses while REAPER records.
-- read_voice_samples <run> <prefix>
--   VOICE_SAMPLE_REGION|run|number|first|last|name per region whose name starts with the prefix (at most 500, in project
--   order), then VOICE_SAMPLES_READ|run|count|changeCount.

local core = ...
local event = core.event

local REGION_TOLERANCE = 0.01
local READ_LIMIT = 500
-- The host's name prefix; keep_voice_sample only moves a region that has it. Kept equal to the Go constant.
local SAMPLE_PREFIX = 'Voice sample: '
local RECORDING = 'REAPER is recording. Stop recording first.'
local NO_API = 'This REAPER version cannot keep a voice sample as a region.'
local BAD_INPUT = 'The voice sample range or name is not valid.'
local NO_DELETE_API = 'This REAPER version cannot remove a voice sample region.'
local BAD_NUMBER = 'The voice sample region number is not valid.'

local function recording()
  return math.floor(reaper.GetPlayState() / 4) % 2 == 1
end

local function starts_with(text, prefix)
  return text:sub(1, #prefix) == prefix
end

local function seconds(value)
  return string.format('%.6f', value)
end

local function regions()
  local out, index = {}, 0
  while true do
    local next_index, is_region, first, last, name, number = reaper.EnumProjectMarkers3(0, index)
    if next_index == 0 then
      break
    end
    if is_region then
      out[#out + 1] = { first = first, last = last, name = name, number = number }
    end
    index = index + 1
  end
  return out
end

local function same_bounds(region, first, last)
  return math.abs(region.first - first) <= REGION_TOLERANCE and math.abs(region.last - last) <= REGION_TOLERANCE
end

local function keep(ctx, args)
  local session_dir, run_id = ctx.session_dir, args[1] or ''
  if not reaper.APIExists('AddProjectMarker2') or not reaper.APIExists('SetProjectMarker4') then
    event(session_dir, 'ERROR', run_id, NO_API)
    return
  end
  local wanted = tostring(args[2] or '')
  local number = tonumber(wanted)
  local first, last = tonumber(args[3]), tonumber(args[4])
  local name = (tostring(args[5] or ''):gsub('[\r\n]+', ' '))
  local usable = first and last and first == first and last == last and first >= 0 and last > first and name:match('%S')
  if not usable or (wanted ~= '' and (not number or number < 1 or number % 1 ~= 0)) then
    event(session_dir, 'ERROR', run_id, BAD_INPUT)
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local known = regions()
  if wanted == '' then
    for _, region in ipairs(known) do
      if region.name == name and same_bounds(region, first, last) then
        event(session_dir, 'VOICE_SAMPLE_KEPT', run_id, region.number, 'existing')
        return
      end
    end
    reaper.Undo_BeginBlock2(0)
    local added = reaper.AddProjectMarker2(0, true, first, last, name, -1, 0)
    if added < 0 then
      reaper.Undo_EndBlock2(0, core.brand.name .. ': keep voice sample', -1)
      event(session_dir, 'ERROR', run_id, 'REAPER could not add the region.')
      return
    end
    reaper.Undo_EndBlock2(0, core.brand.name .. ': keep voice sample', -1)
    reaper.UpdateArrange()
    event(session_dir, 'VOICE_SAMPLE_KEPT', run_id, added, 'created')
    return
  end
  local target
  for _, region in ipairs(known) do
    if region.number == number and starts_with(region.name, SAMPLE_PREFIX) then
      target = region
    end
  end
  if not target then
    event(session_dir, 'VOICE_SAMPLE_STALE', run_id, wanted)
    return
  end
  if target.name == name and same_bounds(target, first, last) then
    event(session_dir, 'VOICE_SAMPLE_KEPT', run_id, number, 'unchanged')
    return
  end
  reaper.Undo_BeginBlock2(0)
  reaper.SetProjectMarker4(0, number, true, first, last, name, 0, 0)
  reaper.Undo_EndBlock2(0, core.brand.name .. ': move voice sample', -1)
  reaper.UpdateArrange()
  event(session_dir, 'VOICE_SAMPLE_KEPT', run_id, number, 'moved')
end

local function delete(ctx, args)
  local session_dir, run_id = ctx.session_dir, args[1] or ''
  if not reaper.APIExists('DeleteProjectMarker') then
    event(session_dir, 'ERROR', run_id, NO_DELETE_API)
    return
  end
  local wanted = tostring(args[2] or '')
  local number = tonumber(wanted)
  if not number or number ~= number or number < 1 or number % 1 ~= 0 or number == math.huge then
    event(session_dir, 'ERROR', run_id, BAD_NUMBER)
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local target
  for _, region in ipairs(regions()) do
    if region.number == number then
      target = region
    end
  end
  if not target then
    event(session_dir, 'VOICE_SAMPLE_REMOVED', run_id, wanted, 'unchanged')
    return
  end
  if not starts_with(target.name, SAMPLE_PREFIX) then
    event(session_dir, 'VOICE_SAMPLE_STALE', run_id, wanted)
    return
  end
  reaper.Undo_BeginBlock2(0)
  local removed = reaper.DeleteProjectMarker(0, number, true)
  if not removed then
    reaper.Undo_EndBlock2(0, core.brand.name .. ': delete voice sample', -1)
    event(session_dir, 'ERROR', run_id, 'REAPER could not delete the region.')
    return
  end
  reaper.Undo_EndBlock2(0, core.brand.name .. ': delete voice sample', -1)
  reaper.UpdateArrange()
  event(session_dir, 'VOICE_SAMPLE_REMOVED', run_id, number, 'deleted')
end

local function read(ctx, args)
  local session_dir, run_id, prefix = ctx.session_dir, args[1] or '', tostring(args[2] or '')
  if prefix == '' then
    event(session_dir, 'ERROR', run_id, 'The voice sample prefix is missing.')
    return
  end
  local count = 0
  for _, region in ipairs(regions()) do
    if starts_with(region.name, prefix) then
      count = count + 1
      if count <= READ_LIMIT then
        event(session_dir, 'VOICE_SAMPLE_REGION', run_id, region.number, seconds(region.first), seconds(region.last), region.name)
      end
    end
  end
  local changes = reaper.APIExists('GetProjectStateChangeCount') and reaper.GetProjectStateChangeCount(0) or 0
  event(session_dir, 'VOICE_SAMPLES_READ', run_id, math.min(count, READ_LIMIT), changes)
end

return function(registry)
  registry.register('keep_voice_sample', keep)
  registry.register('delete_voice_sample_region', delete)
  registry.register('read_voice_samples', read)
end
