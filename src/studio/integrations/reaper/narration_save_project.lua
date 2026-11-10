-- Saves the open REAPER project to its own file, when the narrator asks the app to: save_project (docs/architecture/reaper-bridge.md).
-- Editing reads the saved .rpp, so a take recorded since the last save is not there until REAPER saves.
-- Loaded by narration_ui_bridge.lua, which passes the shared helpers as the chunk argument.
--
-- save_project(run, expected_path) saves the project when it is the one the app is linked to, and answers
-- SAVED|run|tracks|items, the counts in the project it just wrote, so the app can show what it saved. It never saves as: a
-- project that was never saved has no file, and Main_SaveProject would open REAPER's file dialog and wait for the narrator,
-- which stops the bridge, so that is refused before the call. It refuses (ERROR, nothing written):
--   * while REAPER records, since the take is not whole yet;
--   * when expected_path is not the open project's file (the narrator opened another project: saving would write to a
--     project the app does not read), compared with slashes and case folded;
--   * when the project has never been saved;
--   * when REAPER still reports the project as needing a save after the call.
-- A file REAPER cannot write is the host's check, before it sends this: REAPER 7.82 waits on its own error dialog and answers no
-- command until the narrator dismisses it, which this script cannot see or avoid.
-- It adds no undo point: a save is not an edit.
--
-- Seen in REAPER 7.82 on Linux, 2026-11-10 (scenarios save_project_writes_the_take and save_project_refusals in
-- scripts/ci/real-reaper): Main_SaveProject(0, false) wrote a take recorded onto a new voice track into the .rpp, and the refusals above
-- each left REAPER answering (docs/reference/daw/reaper.md).

local core = ...
local event = core.event

local RECORDING = 'REAPER is recording. Stop recording first.'
local NEVER_SAVED =
  'This REAPER project has never been saved, and saving it would open a file dialog in REAPER. Save it once in REAPER (File > Save project), then read again.'
local OTHER_PROJECT = 'REAPER has a different project open than the one this app is linked to, so nothing was saved.'
local NOT_SAVED = 'REAPER could not save the project. Its file may be read-only or its folder may be missing.'
local CANNOT = 'This REAPER version cannot save the project from the app.'
local NO_PATH = 'The app did not say which project to save.'

local function same_path(a, b)
  local function fold(path)
    return (path:gsub('\\', '/'):lower())
  end
  return fold(a) == fold(b)
end

local function recording()
  return math.floor(reaper.GetPlayState() / 4) % 2 == 1
end

local function save_project(session_dir, run_id, expected)
  if not reaper.APIExists('Main_SaveProject') then
    event(session_dir, 'ERROR', run_id, CANNOT)
    return
  end
  if type(expected) ~= 'string' or expected == '' then
    event(session_dir, 'ERROR', run_id, NO_PATH)
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local _, path = reaper.EnumProjects(-1, '')
  if not path or path == '' then
    event(session_dir, 'ERROR', run_id, NEVER_SAVED)
    return
  end
  if not same_path(path, expected) then
    event(session_dir, 'ERROR', run_id, OTHER_PROJECT)
    return
  end
  reaper.Main_SaveProject(0, false)
  if reaper.APIExists('IsProjectDirty') and reaper.IsProjectDirty(0) ~= 0 then
    event(session_dir, 'ERROR', run_id, NOT_SAVED)
    return
  end
  event(session_dir, 'SAVED', run_id, reaper.CountTracks(0), reaper.CountMediaItems(0))
end

return function(registry)
  registry.register('save_project', function(ctx, args)
    save_project(ctx.session_dir, args[1] or '', args[2])
  end)
end
