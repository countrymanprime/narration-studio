-- Narration Studio's REAPER startup script. The app installs the bridge into <resource path>/Scripts/NarrationStudio and adds one
-- guarded line to Scripts/__startup.lua that runs this file, so REAPER starts the bridge each time it opens and the narrator never
-- runs an action for the app to see REAPER (apps/desktop/internal/reaperinstall). It starts no app and shows no dialog: REAPER may
-- be opened for anything, and the app finds this bridge by its heartbeat when it opens. It also puts the launcher in the action
-- list, so the narrator can open the app from REAPER.

-- This file is run by dofile from Scripts/__startup.lua, so the action context names __startup.lua, not this file: the chunk's own
-- source names the folder.
local function script_dir()
  local source = debug and debug.getinfo and debug.getinfo(1, 'S').source or ''
  local path = source:match('^@(.+)$')
  if not path then
    local _, action_path = reaper.get_action_context()
    path = action_path
  end
  return (path or ''):match('^(.*)[\\/][^\\/]-$') or '.'
end

local SHARED = script_dir()
local SEP = package.config:sub(1, 1)
local ok_bridge, bridge = pcall(dofile, SHARED .. SEP .. 'narration_ui_bridge.lua')
if not ok_bridge then
  -- At REAPER startup nothing may wait for a click; the app reports a bridge it cannot reach.
  return
end

if reaper.APIExists('AddRemoveReaScript') then
  -- Adding a path already in the action list answers its existing command id and adds nothing (seen in REAPER 7.82).
  reaper.AddRemoveReaScript(true, 0, SHARED .. SEP .. 'NarrationStudio_Launcher.lua', true)
end

if bridge.live_session() then
  return
end
bridge.run(bridge.new_session_dir())
