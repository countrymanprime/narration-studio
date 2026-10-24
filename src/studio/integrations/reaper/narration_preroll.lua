-- REAPER's own pre-roll, read over the bridge: the DAW port's punch_preroll capability. Loaded by narration_ui_bridge.lua, which passes
-- the shared helpers as the chunk argument.
--
-- The Booth punches with REAPER's pre-roll, not one of the app's own: with "Pre-roll: Toggle pre-roll on record" (action 41819) on,
-- REAPER plays from the bar line at or before the edit cursor minus that many measures and records from the cursor itself. REAPER
-- 7.82 on Linux kept the two in its configuration: `preroll`, a bit field (1 on play, 2 on record, the bit the action toggles), and
-- `prerollmeas`, the length in measures (2 by default). Seen 2026-10-24 (docs/research/reaper-preroll-2026-10-24.md).
--
-- punch_preroll(run) reads both, and never writes either: a REAPER preference is the narrator's to change in REAPER (SECURITY.md).
-- It works while REAPER records and opens no undo block.
--
-- Answers PUNCH_PREROLL|run|onRecord|measures|measureSeconds: onRecord 0 or 1, the length in measures, and how long one measure
-- lasts at the tempo and time signature under the edit cursor (TimeMap_GetTimeSigAtTime), so the host can speak in seconds.

local core = ...
local event = core.event

local RECORD_BIT = 2

local CANNOT_READ = 'This REAPER version cannot read its pre-roll.'
local NOT_REPORTED = 'REAPER did not report its pre-roll.'

local function number_var(name)
  local ok, value = reaper.get_config_var_string(name)
  if not ok then
    return nil
  end
  return tonumber(value)
end

local function seconds(value)
  return string.format('%.6f', value)
end

-- How long one measure lasts at the edit cursor: numerator beats of the denominator's note, the tempo in quarter notes a minute.
local function measure_seconds()
  local numerator, denominator, tempo = reaper.TimeMap_GetTimeSigAtTime(0, reaper.GetCursorPosition())
  return numerator * (60 / tempo) * (4 / denominator)
end

local function punch_preroll(session_dir, run_id)
  if not reaper.APIExists('get_config_var_string') or not reaper.APIExists('TimeMap_GetTimeSigAtTime') then
    event(session_dir, 'ERROR', run_id, CANNOT_READ)
    return
  end
  local bits, length = number_var('preroll'), number_var('prerollmeas')
  if not bits or not length then
    event(session_dir, 'ERROR', run_id, NOT_REPORTED)
    return
  end
  local on = math.floor(bits / RECORD_BIT) % 2 == 1
  event(session_dir, 'PUNCH_PREROLL', run_id, on and '1' or '0', seconds(length), seconds(measure_seconds()))
end

return function(registry)
  registry.register('punch_preroll', function(ctx, args)
    punch_preroll(ctx.session_dir, args[1] or '')
  end)
end
