-- Runs inside a throwaway REAPER (rig.sh): loads the app's real bridge (narration_ui_bridge.lua) on a session folder the host also reads,
-- and adds ns_save, a save the host has no command for (docs/operations/real-app-driver.md). No CI fixture, nothing is created in the project.
-- Environment: NS_SESSION, NS_REAPER_DIR, NS_CFG. Refuses to run unless REAPER's resource path is the scratch cfg and the device is JACK.
local SEP = package.config:sub(1, 1)
local session, reaper_dir, cfg = os.getenv('NS_SESSION'), os.getenv('NS_REAPER_DIR'), os.getenv('NS_CFG')
assert(session and reaper_dir and cfg, 'NS_SESSION, NS_REAPER_DIR and NS_CFG must be set')
assert(reaper.GetResourcePath():gsub('\\', '/') == cfg, 'REAPER is not on the scratch cfg: ' .. reaper.GetResourcePath())
local _, driver = reaper.GetAudioDeviceInfo('MODE', '')
assert(reaper.Audio_IsRunning() == 1 and driver == 'JACK', 'REAPER is not on the JACK dummy device')
local bridge = dofile(reaper_dir .. SEP .. 'narration_ui_bridge.lua')
local registry = bridge.new_registry()
registry.register('ns_save', function(ctx, args)
  reaper.Main_SaveProject(0, false)
  ctx.event('NS_SAVED', args[1] or '')
end)
bridge.run(session, registry)
local ready = assert(io.open(session .. SEP .. 'ready', 'wb'))
ready:write('ready\n')
ready:close()
