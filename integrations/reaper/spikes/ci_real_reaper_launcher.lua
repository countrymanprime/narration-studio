-- Runs inside a real REAPER for the real-REAPER bridge check (docs/research/real-reaper-ci-integration.md).
-- Builds a scratch project from one LibriVox chapter, loads the real narration_ui_bridge.lua on a session folder the driver
-- (drive.py) writes commands into, adds four CI-only commands (ci_state, ci_undo, ci_render, ci_quit), then signals `ready`.
-- Environment: NARRATION_CI_SESSION, NARRATION_CI_REAPER_DIR, NARRATION_CI_AUDIO, NARRATION_CI_OUT, NARRATION_CI_CFG.
-- Safety: stops unless REAPER's resource path is the scratch cfg folder; closes the audio device; never plays or records.

local SEP = package.config:sub(1, 1)
local function env(name)
  local value = os.getenv(name)
  assert(value and value ~= '', name .. ' is not set')
  return value
end
local function norm(path)
  return (path:gsub('\\', '/'):gsub('/+$', ''):lower())
end
local session, reaper_dir, audio, out, cfg =
  env('NARRATION_CI_SESSION'), env('NARRATION_CI_REAPER_DIR'), env('NARRATION_CI_AUDIO'), env('NARRATION_CI_OUT'), env('NARRATION_CI_CFG')

local function write(path, text)
  local handle = assert(io.open(path, 'wb'))
  handle:write(text)
  handle:close()
end

reaper.Audio_Quit()
assert(norm(reaper.GetResourcePath()) == norm(cfg), 'resource path is not the scratch cfg: ' .. reaper.GetResourcePath())
assert(reaper.Audio_IsRunning() == 0, 'the audio device is running')

-- Fixture: one track, one item playing the whole chapter file.
reaper.InsertTrackAtIndex(0, true)
local track = reaper.GetTrack(0, 0)
reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', 'Chapter 1', true)
local source = reaper.PCM_Source_CreateFromFile(audio)
assert(source, 'REAPER could not open ' .. audio)
local length = reaper.GetMediaSourceLength(source)
local item = reaper.AddMediaItemToTrack(track)
local take = reaper.AddTakeToMediaItem(item)
reaper.SetMediaItemTake_Source(take, source)
reaper.SetMediaItemInfo_Value(item, 'D_POSITION', 0)
reaper.SetMediaItemInfo_Value(item, 'D_LENGTH', length)
reaper.UpdateItemInProject(item)
reaper.Main_SaveProject(0, false)
local _, item_guid = reaper.GetSetMediaItemInfo_String(item, 'GUID', '', false)
local _, rpp = reaper.EnumProjects(-1, '')
local track_guid = reaper.GetTrackGUID(track)

local bridge = dofile(reaper_dir .. SEP .. 'narration_ui_bridge.lua')
local registry = bridge.new_registry()
registry.register('ci_state', function(ctx, args)
  local regions = 0
  local index = 0
  while true do
    local next_index, is_region = reaper.EnumProjectMarkers3(0, index)
    if next_index == 0 then
      break
    end
    if is_region then
      regions = regions + 1
    end
    index = index + 1
  end
  ctx.event('CI_STATE', args[1] or '', regions, reaper.CountMediaItems(0), reaper.Undo_CanUndo2(0) or '', reaper.GetProjectStateChangeCount(0))
end)
registry.register('ci_undo', function(ctx, args)
  ctx.event('CI_UNDONE', args[1] or '', reaper.Undo_DoUndo2(0))
end)
registry.register('ci_render', function(ctx, args)
  -- Same action, same text check as spike S5, so a renumbered action cannot run something else.
  local text = reaper.kbd_getTextFromCmd(42230, reaper.SectionFromUniqueID(0))
  if text ~= 'File: Render project, using the most recent render settings, auto-close render dialog' then
    ctx.event('ERROR', args[1] or '', 'action 42230 is named ' .. tostring(text))
    return
  end
  reaper.Main_OnCommand(42230, 0)
  ctx.event('CI_RENDERED', args[1] or '')
end)
registry.register('ci_quit', function(ctx, args)
  ctx.event('CI_QUIT', args[1] or '')
  write(out .. SEP .. 'done', 'done\n')
  reaper.Main_OnCommand(40004, 0)
end)

write(
  session .. SEP .. 'fixture.json',
  string.format(
    '{"rpp":%q,"audio":%q,"length":%.6f,"item":%q,"track":%q,"reaper_version":%q,"os":%q}\n',
    rpp,
    audio,
    length,
    item_guid,
    reaper.GetAppVersion(),
    reaper.GetOS()
  )
)
bridge.run(session, registry)
write(session .. SEP .. 'ready', 'ready\n')
