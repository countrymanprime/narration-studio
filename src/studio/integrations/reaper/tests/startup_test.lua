-- NarrationStudio_Startup.lua, the script REAPER runs at every start from Scripts/__startup.lua (the app adds that line,
-- src/studio/desktop/internal/reaperinstall). It runs the bridge without starting the app, so the app finds REAPER by the bridge's
-- heartbeat; the launcher action then reuses that bridge instead of starting a second one.

local H = require('harness')
local Fake = require('fake_reaper')

local SESSION_SECTION, SESSION_KEY = 'NarrationStudio', 'session'

local function copy_scripts(target)
  host.makedirs(target)
  for _, name in ipairs(host.listdir(host.reaper_dir)) do
    if name:match('%.lua$') then
      H.write_file(H.join(target, name), assert(H.read_file(H.join(host.reaper_dir, name))))
    end
  end
end

-- The installed layout: <resource>/Scripts/NarrationStudio/*.lua, with the app's path written beside the launcher.
local function installed(options)
  options = options or {}
  local root = host.tmpdir()
  local resource = H.join(root, 'REAPER')
  local scripts = H.join(H.join(resource, 'Scripts'), 'NarrationStudio')
  copy_scripts(scripts)
  local app = H.join(root, 'narration-utils')
  H.write_file(app, 'not really an executable')
  H.write_file(H.join(scripts, 'narration-utils-app-path.txt'), app .. '\n')
  local fake = Fake.new(host)
  fake.os_name = options.os_name or 'Linux64'
  fake.resource_path = resource
  -- __startup.lua runs the startup script by dofile, so the running action is __startup.lua, one folder up.
  fake.action_path = H.join(H.join(resource, 'Scripts'), '__startup.lua')
  fake.project_path = H.join(H.join(root, 'Projects'), 'Book.rpp')
  reaper = fake.reaper
  return fake, scripts, app
end

local function calls_named(fake, name)
  local out = {}
  for _, call in ipairs(fake.calls) do
    if call.name == name then
      out[#out + 1] = call
    end
  end
  return out
end

local function sessions_root(fake)
  return H.join(H.join(fake.resource_path, 'NarrationStudio'), 'sessions')
end

H.test('the startup script runs the bridge and starts no app', function()
  local fake, scripts = installed()
  dofile(H.join(scripts, 'NarrationStudio_Startup.lua'))
  H.eq(#calls_named(fake, 'ExecProcess'), 0, 'REAPER starting on its own does not open the app')
  H.eq(#calls_named(fake, 'ShowMessageBox'), 0, 'nothing waits for a click at REAPER startup')
  H.eq(#fake.deferred, 1, 'the bridge loop is running')
  local session = H.join(sessions_root(fake), 'hub_1001')
  H.eq(host.listdir(H.join(session, 'commands')), {}, 'the command folder exists')
  H.eq(fake.reaper.GetExtState(SESSION_SECTION, SESSION_KEY), session, 'the live session is published for the launcher')
  fake:pump()
  H.contains(H.read_text(H.join(session, 'events.log')), 'PROJECT_STATUS', 'the first tick sends the heartbeat the app looks for')
end)

H.test('the startup script adds the launcher to the action list, once', function()
  local fake, scripts = installed()
  dofile(H.join(scripts, 'NarrationStudio_Startup.lua'))
  local added = calls_named(fake, 'AddRemoveReaScript')
  H.eq(#added, 1)
  H.eq(added[1].add, true)
  H.eq(added[1].section, 0, 'the Main section')
  H.eq(added[1].path, H.join(scripts, 'NarrationStudio_Launcher.lua'))
  H.eq(added[1].commit, true, 'written to reaper-kb.ini')
end)

H.test('a REAPER without AddRemoveReaScript still runs the bridge', function()
  local fake, scripts = installed()
  fake:remove_api('AddRemoveReaScript')
  dofile(H.join(scripts, 'NarrationStudio_Startup.lua'))
  H.eq(#calls_named(fake, 'AddRemoveReaScript'), 0)
  H.eq(#fake.deferred, 1, 'the bridge loop is running')
end)

H.test('a second startup run in the same REAPER leaves the running bridge alone', function()
  local fake, scripts = installed()
  dofile(H.join(scripts, 'NarrationStudio_Startup.lua'))
  local first = fake.reaper.GetExtState(SESSION_SECTION, SESSION_KEY)
  dofile(H.join(scripts, 'NarrationStudio_Startup.lua'))
  H.eq(#fake.deferred, 1, 'still one bridge loop')
  H.eq(fake.reaper.GetExtState(SESSION_SECTION, SESSION_KEY), first)
end)

H.test('the launcher reuses the bridge the startup script started and opens the app on it', function()
  local fake, scripts, app = installed()
  dofile(H.join(scripts, 'NarrationStudio_Startup.lua'))
  local session = fake.reaper.GetExtState(SESSION_SECTION, SESSION_KEY)
  fake.action_path = H.join(scripts, 'NarrationStudio_Launcher.lua')
  dofile(H.join(scripts, 'NarrationStudio_Launcher.lua'))
  local launches = calls_named(fake, 'ExecProcess')
  H.eq(#launches, 1, 'the app was started')
  H.contains(launches[1].command, app, 'the app path the installer wrote beside the launcher')
  H.contains(launches[1].command, "--session-dir '" .. session .. "'", 'on the running bridge session')
  H.eq(#fake.deferred, 1, 'no second bridge loop')
end)

H.test('a published session whose folder is gone is not reused', function()
  local fake, scripts = installed()
  fake.reaper.SetExtState(SESSION_SECTION, SESSION_KEY, H.join(sessions_root(fake), 'hub_gone'), false)
  fake.action_path = H.join(scripts, 'NarrationStudio_Launcher.lua')
  dofile(H.join(scripts, 'NarrationStudio_Launcher.lua'))
  local command = calls_named(fake, 'ExecProcess')[1].command
  H.eq(command:find('hub_gone', 1, true), nil, 'a new session')
  H.eq(#fake.deferred, 1, 'and a bridge loop of its own')
  H.contains(fake.reaper.GetExtState(SESSION_SECTION, SESSION_KEY), 'hub_', 'the new session is published')
end)

H.test('a bridge that stops withdraws its session, so the launcher starts a new one', function()
  local fake, scripts = installed()
  dofile(H.join(scripts, 'NarrationStudio_Startup.lua'))
  local session = fake.reaper.GetExtState(SESSION_SECTION, SESSION_KEY)
  H.write_file(H.join(H.join(session, 'commands'), '00000001.cmd'), '1|close')
  fake:pump()
  H.eq(#fake.deferred, 0, 'the loop ended')
  H.eq(fake.reaper.GetExtState(SESSION_SECTION, SESSION_KEY), '', 'nothing to reuse')
end)

H.test('the startup script with a missing library starts nothing and asks nothing', function()
  local fake, scripts = installed()
  os.remove(H.join(scripts, 'narration_ui_bridge.lua'))
  dofile(H.join(scripts, 'NarrationStudio_Startup.lua'))
  H.eq(#calls_named(fake, 'ShowMessageBox'), 0, 'no dialog at REAPER startup')
  H.eq(#fake.deferred, 0)
  H.eq(fake.reaper.GetExtState(SESSION_SECTION, SESSION_KEY), '')
end)
