-- Release-gate check 9.7 (REAPER play-state timing), scripted. Loads the REAL narration_ui_bridge.lua against a scratch session
-- folder, then presses Play, Stop, Record, Pause (during Record), Pause again, Stop through REAPER's own transport ACTIONS
-- (Main_OnCommand with the action ID, checked by its text first) and, on every defer tick after each press, samples
-- GetPlayState() and GetPlayPosition() and watches events.log for the first PROJECT_STATUS heartbeat that carries the new state.
-- It writes transport-timing-report.txt (and report.txt last, for run-reaper.ps1's -Done) with, per press: the ms until
-- GetPlayState showed the change, the ms until the heartbeat did, the number of defer ticks that took, and the positions read.
--
-- What this does NOT prove: a physical mouse click or keyboard shortcut on REAPER's transport (a different input path than an
-- action called from a script) and anything with a real audio device. Those stay with the owner (docs/operations/windows-qa-checklist.md 9.7).
-- Unlike the other spikes this one starts the transport, so it is for a disposable CI runner with no audio hardware, never an
-- owner's machine; it still runs only in the isolated -cfgfile and writes only under REAPER_SPIKE_OUT.
-- Nothing is faked: if REAPER will not enter a state (no audio device, no armed input), the row says what GetPlayState returned.

do
  local BACKSLASH = string.char(92)
  local wanted = os.getenv('REAPER_SPIKE_CFG')
  local actual = reaper.GetResourcePath()
  assert(wanted and wanted ~= '', 'REAPER_SPIKE_CFG is not set: start this script with run-reaper.ps1')
  assert(actual:gsub(BACKSLASH, '/'):lower() == wanted:gsub(BACKSLASH, '/'):lower(), 'REAPER is not using the isolated -cfgfile: ' .. actual)
end

local BS = string.char(92)
local OUT = assert(os.getenv('REAPER_SPIKE_OUT'), 'set REAPER_SPIKE_OUT (run-reaper.ps1 does)'):gsub(BS, '/')
local REPO_REAPER = assert(os.getenv('REAPER_SPIKE_BRIDGE_DIR'), 'set REAPER_SPIKE_BRIDGE_DIR (run-reaper.ps1 does)'):gsub(BS, '/')
local function native(path)
  return (path:gsub('/', BS))
end

local report = {}
local function log(text)
  report[#report + 1] = text
end
local function write_file(name, contents)
  local handle = assert(io.open(OUT .. '/' .. name, 'wb'))
  handle:write(contents)
  handle:close()
end
local function flush(final)
  write_file('transport-timing-report.txt', table.concat(report, '\n') .. '\n')
  if final then
    write_file('report.txt', 'transport timing done\n')
  end
end

log('REAPER ' .. reaper.GetAppVersion())
log('Audio_IsRunning at start=' .. tostring(reaper.Audio_IsRunning()))

-- An armed track so Record has something to record; no input hardware exists on the runner, so what REAPER does is recorded as seen.
reaper.InsertTrackAtIndex(0, false)
local track = reaper.GetTrack(0, 0)
reaper.SetMediaTrackInfo_Value(track, 'I_RECARM', 1)
log('track armed, I_RECARM=' .. tostring(reaper.GetMediaTrackInfo_Value(track, 'I_RECARM')))

local session_dir = native(OUT .. '/session')
reaper.RecursiveCreateDirectory(session_dir .. BS .. 'commands', 0)
local bridge = dofile(REPO_REAPER .. '/narration_ui_bridge.lua')
bridge.run(session_dir)
local events_path = session_dir .. BS .. 'events.log'
local events_offset = 0
local function new_heartbeats()
  local handle = io.open(events_path, 'rb')
  if not handle then
    return {}
  end
  handle:seek('set', events_offset)
  local chunk = handle:read('a') or ''
  events_offset = events_offset + #chunk
  handle:close()
  local found = {}
  for line in chunk:gmatch('[^\r\n]+') do
    if line:match('^PROJECT_STATUS|') then
      local fields = {}
      for field in (line .. '|'):gmatch('([^|]*)|') do
        fields[#fields + 1] = field
      end
      found[#found + 1] = { state = tonumber(fields[#fields - 1]), position = tonumber(fields[#fields]), line = line }
    end
  end
  return found
end

-- Each step: the action, its exact text (the run stops on a mismatch, so a renumbered action cannot run something else), and the
-- GetPlayState value(s) that count as "changed". A step may be a no-op for REAPER; the row then says the state never changed.
local steps = {
  { name = 'Play', id = 1007, text = 'Transport: Play', expect = { [1] = true } },
  { name = 'Stop', id = 1016, text = 'Transport: Stop', expect = { [0] = true } },
  { name = 'Record', id = 1013, text = 'Transport: Record', expect = { [5] = true } },
  { name = 'Pause during Record', id = 1008, text = 'Transport: Pause', expect = { [6] = true, [2] = true, [0] = true } },
  { name = 'Pause again (resume)', id = 1008, text = 'Transport: Pause', expect = { [5] = true, [1] = true } },
  { name = 'Stop', id = 1016, text = 'Transport: Stop', expect = { [0] = true } },
}
local SETTLE_SECONDS = 2.0 -- how long each press is watched; the 1.5 s heartbeat interval fits inside it, so a late heartbeat shows
local index, current, last_state = 0, nil, reaper.GetPlayState()
new_heartbeats()

local function begin_step()
  index = index + 1
  local step = steps[index]
  if not step then
    log('')
    log('done')
    flush(true)
    reaper.Main_OnCommand(40004, 0) -- File: Quit REAPER
    return false
  end
  local text = reaper.kbd_getTextFromCmd(step.id, reaper.SectionFromUniqueID(0))
  if text ~= step.text then
    log(string.format('STOP: action %d is %q, expected %q', step.id, text, step.text))
    flush(true)
    reaper.Main_OnCommand(40004, 0)
    return false
  end
  current = { step = step, before = reaper.GetPlayState(), ticks = 0, positions = {} }
  current.t0 = reaper.time_precise()
  reaper.Main_OnCommand(step.id, 0)
  current.after_call = reaper.GetPlayState() -- read in the same call stack, like OSARA
  return true
end

local function sample()
  local now = reaper.time_precise()
  current.ticks = current.ticks + 1
  local state = reaper.GetPlayState()
  local position = reaper.GetPlayPosition()
  if #current.positions < 40 then
    current.positions[#current.positions + 1] = string.format('%.3f', position)
  end
  if not current.state_ms and current.step.expect[state] and state ~= current.before then
    current.state_ms, current.state_value, current.state_ticks = (now - current.t0) * 1000, state, current.ticks
  end
  for _, beat in ipairs(new_heartbeats()) do
    if not current.heartbeat_ms and beat.state ~= current.before and current.step.expect[beat.state] then
      current.heartbeat_ms, current.heartbeat_value, current.heartbeat_ticks = (now - current.t0) * 1000, beat.state, current.ticks
    end
    current.last_beat = beat.line
  end
  current.last_state = state
  return now - current.t0 >= SETTLE_SECONDS
end

local function finish_step()
  local step = current.step
  local moved = false
  if #current.positions >= 2 then
    moved = current.positions[#current.positions] ~= current.positions[1]
  end
  log(
    string.format(
      '%s (action %d): GetPlayState before=%s, in the call stack right after=%s, final=%s',
      step.name,
      step.id,
      tostring(current.before),
      tostring(current.after_call),
      tostring(current.last_state)
    )
  )
  log(
    string.format(
      '  GetPlayState changed to %s after %s ms (%s defer ticks)',
      tostring(current.state_value),
      current.state_ms and string.format('%.1f', current.state_ms) or 'NEVER',
      tostring(current.state_ticks)
    )
  )
  log(
    string.format(
      '  heartbeat carried %s after %s ms (%s defer ticks); last heartbeat: %s',
      tostring(current.heartbeat_value),
      current.heartbeat_ms and string.format('%.1f', current.heartbeat_ms) or 'NEVER',
      tostring(current.heartbeat_ticks),
      tostring(current.last_beat)
    )
  )
  log(
    string.format(
      '  GetPlayPosition moved during the step: %s (first %s, last %s, %d samples)',
      tostring(moved),
      tostring(current.positions[1]),
      tostring(current.positions[#current.positions]),
      #current.positions
    )
  )
  log(string.format('  Audio_IsRunning=%s', tostring(reaper.Audio_IsRunning())))
  flush(false)
end

local started = false
local function loop()
  if not started then
    started = true
    if not begin_step() then
      return
    end
  end
  if sample() then
    finish_step()
    if not begin_step() then
      return
    end
  end
  reaper.defer(loop)
end
reaper.defer(loop)
