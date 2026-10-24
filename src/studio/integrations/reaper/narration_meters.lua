-- The levels REAPER's own meters show, read over the bridge: the DAW port's daw_meters capability. Loaded by narration_ui_bridge.lua,
-- which passes the shared helpers as the chunk argument.
--
-- daw_meters(run) answers METERS|run|output|input|inputTrack. output is the master track's meter; input is the first record-armed
-- track's, with that track's name, both empty when no track is armed. Each is the louder of the track's two channels in dBFS to
-- 0.1 dB, -100.0 for silence; a level over full scale is answered as it is. It reads only: nothing is armed, set or undone.
--
-- Seen in REAPER 7.82 on Linux, 2026-10-24 (docs/research/reaper-meters-2026-10-24.md): Track_GetPeakInfo is the meter's own value,
-- which falls away within about half a second of silence; an armed track meters its input whether its monitoring is off or on; an
-- unarmed, silent track answers 0; the master carries the input only with monitoring on.

local core = ...
local event = core.event

local FLOOR_DB = -100
local CANNOT_READ = 'This REAPER version cannot read its meters.'

local function level(track)
  local peak = 0
  for channel = 0, 1 do
    local value = reaper.Track_GetPeakInfo(track, channel)
    if type(value) == 'number' and value > peak then
      peak = value
    end
  end
  local db = FLOOR_DB
  if peak > 0 then
    db = math.max(FLOOR_DB, 20 * math.log(peak, 10))
  end
  return string.format('%.1f', math.floor(db * 10 + 0.5) / 10)
end

local function first_armed()
  for index = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, index)
    if reaper.GetMediaTrackInfo_Value(track, 'I_RECARM') ~= 0 then
      return track
    end
  end
  return nil
end

local function daw_meters(session_dir, run_id)
  if not reaper.APIExists('Track_GetPeakInfo') then
    event(session_dir, 'ERROR', run_id, CANNOT_READ)
    return
  end
  local output = level(reaper.GetMasterTrack(0))
  local armed = first_armed()
  if not armed then
    event(session_dir, 'METERS', run_id, output, '', '')
    return
  end
  local _, name = reaper.GetTrackName(armed)
  event(session_dir, 'METERS', run_id, output, level(armed), name or '')
end

return function(registry)
  registry.register('daw_meters', function(ctx, args)
    daw_meters(ctx.session_dir, args[1] or '')
  end)
end
