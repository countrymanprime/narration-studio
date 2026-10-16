-- The monitor level over the bridge: the DAW port's monitor_level capability.
-- Loaded by narration_ui_bridge.lua, which passes the shared helpers as the chunk argument.
--
-- The monitor level is the volume of the master track's first hardware output send (category 1), not a fader: the faders are
-- rendered into the delivery files and a hardware output send is not. monitor_level(run, level) reads it when level is empty
-- or missing, and sets it when level is a whole number from 0 to 100 written as plain digits. Either way it answers
-- MONITOR_LEVEL|run|level, the level the send now holds, read back after a set. It opens no undo block (like arm_only), changes
-- nothing else, and a repeated set changes nothing more. With no hardware output on the master, a level that is not a whole
-- number from 0 to 100, or a set REAPER refuses, it answers ERROR and writes nothing.
--
-- The app's scale: 70 is unity (0 dB). From 70 to 100 it is 0.2 dB a step (100 is +6 dB); below 70 it is 60/70 dB a step
-- (35 is -30 dB); 0 is silence (gain 0). Reading inverts that and rounds to the nearest whole level, clamped to 0 to 100.
--
-- Not run in REAPER (pending the QA pass, #1495): that GetTrackNumSends(master, 1) counts the hardware outputs and
-- Get/SetTrackSendInfo_Value(master, 1, 0, 'D_VOL') is their linear gain, that a set answers true, what a set does to the
-- hardware output's mute, and whether the master's first hardware output is the one the narrator monitors on.

local core = ...
local event = core.event

local UNITY = 70
local MAX_LEVEL = 100
local NO_OUTPUT = 'The master track has no hardware output to set the monitor level on.'
local BAD_LEVEL = 'The monitor level must be a whole number from 0 to 100.'
local NOT_SET = 'REAPER did not accept the monitor level.'

-- A whole number from 0 to MAX_LEVEL written as plain digits, or nil.
local function level_from(text)
  if type(text) ~= 'string' or not text:match('^%d+$') or #text > 6 then
    return nil
  end
  local level = tonumber(text)
  if level > MAX_LEVEL then
    return nil
  end
  return level
end

local function level_to_gain(level)
  if level <= 0 then
    return 0.0
  end
  local db
  if level >= UNITY then
    db = (level - UNITY) * 0.2
  else
    db = -(UNITY - level) * (60 / 70)
  end
  return 10 ^ (db / 20)
end

local function gain_to_level(gain)
  if type(gain) ~= 'number' or gain <= 0 then
    return 0
  end
  local db = 20 * math.log(gain, 10)
  local level
  if db >= 0 then
    level = UNITY + db / 0.2
  else
    level = UNITY + db * (70 / 60)
  end
  level = math.floor(level + 0.5)
  return math.max(0, math.min(MAX_LEVEL, level))
end

-- The master track when it has a hardware output, else nil.
local function master_with_output()
  local master = reaper.GetMasterTrack(0)
  if not master or reaper.GetTrackNumSends(master, 1) < 1 then
    return nil
  end
  return master
end

local function monitor_level(session_dir, run_id, level_text)
  local wanted = nil
  if level_text ~= nil and level_text ~= '' then
    wanted = level_from(level_text)
    if not wanted then
      event(session_dir, 'ERROR', run_id, BAD_LEVEL)
      return
    end
  end
  local master = master_with_output()
  if not master then
    event(session_dir, 'ERROR', run_id, NO_OUTPUT)
    return
  end
  if wanted and not reaper.SetTrackSendInfo_Value(master, 1, 0, 'D_VOL', level_to_gain(wanted)) then
    event(session_dir, 'ERROR', run_id, NOT_SET)
    return
  end
  event(session_dir, 'MONITOR_LEVEL', run_id, gain_to_level(reaper.GetTrackSendInfo_Value(master, 1, 0, 'D_VOL')))
end

return function(registry)
  registry.register('monitor_level', function(ctx, args)
    monitor_level(ctx.session_dir, args[1] or '', args[2])
  end)
end
