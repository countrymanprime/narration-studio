-- monitor_level (narration_levels.lua): read or set the monitor level, the volume of the master track's first hardware output
-- send, as the app's 0 to 100 whole number. 70 is unity (0 dB); above it 0.2 dB a step up to +6 dB at 100; below it 60/70 dB
-- a step down; 0 is silence. The faders are not touched (they are rendered into the delivery files). It opens no undo block.

local H = require('harness')

local NO_OUTPUT = 'The master track has no hardware output to set the monitor level on.'
local BAD_LEVEL = 'The monitor level must be a whole number from 0 to 100.'
local NOT_SET = 'REAPER did not accept the monitor level.'

local function project(volume)
  local s = H.session()
  local send = s.fake:add_hw_output(volume)
  s.fake.calls = {}
  return s, send
end

local function level_of(events)
  H.eq(#events, 1, 'one event')
  H.eq(events[1][1], 'MONITOR_LEVEL')
  return events[1][3]
end

local function sets(s)
  local count = 0
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'SetTrackSendInfo_Value' then
      count = count + 1
    end
  end
  return count
end

local function near(actual, expected, label)
  H.truthy(math.abs(actual - expected) < 1e-9, (label or 'gain') .. ': ' .. tostring(actual) .. ' vs ' .. tostring(expected))
end

H.test('monitor_level reads unity as 70 and changes nothing', function()
  local s, send = project(1.0)
  s:send('monitor_level', 'm1', '')
  H.eq(s:events(), { { 'MONITOR_LEVEL', 'm1', '70' } })
  H.eq(sets(s), 0, 'a read writes nothing')
  H.eq(send.vol, 1.0)
end)

H.test('monitor_level with no level argument at all reads', function()
  local s = project(1.0)
  s:send('monitor_level', 'm1')
  H.eq(s:events(), { { 'MONITOR_LEVEL', 'm1', '70' } })
end)

H.test('monitor_level sets the first hardware output send and answers the level read back', function()
  local s, send = project(1.0)
  s:send('monitor_level', 'm1', '100')
  H.eq(s:events(), { { 'MONITOR_LEVEL', 'm1', '100' } })
  near(send.vol, 10 ^ (6 / 20))
  s:send('monitor_level', 'm2', '0')
  H.eq(s:events(), { { 'MONITOR_LEVEL', 'm2', '0' } })
  H.eq(send.vol, 0)
  s:send('monitor_level', 'm3', '70')
  H.eq(s:events(), { { 'MONITOR_LEVEL', 'm3', '70' } })
  near(send.vol, 1.0)
end)

H.test('monitor_level maps 35 to -30 dB and 85 to +3 dB', function()
  local s, send = project(1.0)
  s:send('monitor_level', 'm1', '35')
  s:events()
  near(send.vol, 10 ^ (-30 / 20))
  s:send('monitor_level', 'm2', '85')
  s:events()
  near(send.vol, 10 ^ (3 / 20))
end)

H.test('monitor_level: every whole level 0 to 100 reads back as the level that was set', function()
  local s = project(1.0)
  for level = 0, 100 do
    s:send('monitor_level', 'set', tostring(level))
    H.eq(level_of(s:events()), tostring(level), 'set ' .. level)
    s:send('monitor_level', 'get', '')
    H.eq(level_of(s:events()), tostring(level), 'read ' .. level)
  end
end)

H.test('monitor_level reads a gain between two steps as the nearest level', function()
  local s, send = project(10 ^ (0.04 / 20))
  s:send('monitor_level', 'm1', '')
  H.eq(s:events(), { { 'MONITOR_LEVEL', 'm1', '70' } }, '0.04 dB is under half a step')
  send.vol = 10 ^ (0.12 / 20)
  s:send('monitor_level', 'm2', '')
  H.eq(s:events(), { { 'MONITOR_LEVEL', 'm2', '71' } })
  send.vol = 10 ^ (20 / 20)
  s:send('monitor_level', 'm3', '')
  H.eq(s:events(), { { 'MONITOR_LEVEL', 'm3', '100' } }, 'above +6 dB reads as 100')
  send.vol = 0.0001
  s:send('monitor_level', 'm4', '')
  H.eq(s:events(), { { 'MONITOR_LEVEL', 'm4', '0' } }, 'far below reads as 0')
  send.vol = -1
  s:send('monitor_level', 'm5', '')
  H.eq(s:events(), { { 'MONITOR_LEVEL', 'm5', '0' } }, 'a negative gain reads as 0')
end)

H.test('monitor_level refuses a level outside 0 to 100 and a text that is not a whole number, touching nothing', function()
  local s, send = project(0.5)
  for _, bad in ipairs({ '101', '-1', '70.5', '7e1', 'abc', ' 70', '70 ', '+70', '0x46', '1000000000000000000000' }) do
    s:send('monitor_level', 'b', bad)
    H.eq(s:events(), { { 'ERROR', 'b', BAD_LEVEL } }, 'refused: ' .. bad)
  end
  H.eq(sets(s), 0)
  H.eq(send.vol, 0.5)
end)

H.test('monitor_level says so when the master has no hardware output, for a read and a set', function()
  local s = H.session()
  s:send('monitor_level', 'm1', '')
  H.eq(s:events(), { { 'ERROR', 'm1', NO_OUTPUT } })
  s:send('monitor_level', 'm2', '50')
  H.eq(s:events(), { { 'ERROR', 'm2', NO_OUTPUT } })
  H.eq(sets(s), 0)
end)

H.test('monitor_level answers what the send holds after the set, not what was asked for', function()
  local s, send = project(1.0)
  local set = s.fake.reaper.SetTrackSendInfo_Value
  s.fake.reaper.SetTrackSendInfo_Value = function(track, category, index, param, value)
    return set(track, category, index, param, value * 1.3) -- a send that lands somewhere else (+2.28 dB)
  end
  s:send('monitor_level', 'm1', '70')
  H.eq(s:events(), { { 'MONITOR_LEVEL', 'm1', '81' } })
  near(send.vol, 1.3)
end)

H.test('monitor_level uses only the first hardware output, and only the master track', function()
  local s, first = project(1.0)
  local second = s.fake:add_hw_output(0.25)
  local track = s.fake:add_track('Chapter 1')
  local other = s.fake:add_hw_output(0.3, track)
  s:send('monitor_level', 'm1', '100')
  s:events()
  near(first.vol, 10 ^ (6 / 20))
  H.eq(second.vol, 0.25)
  H.eq(other.vol, 0.3)
end)

H.test('monitor_level answers ERROR when REAPER does not accept the set, and a read still works', function()
  local s, send = project(1.0)
  s.fake.send_set_fails = true
  s:send('monitor_level', 'm1', '50')
  H.eq(s:events(), { { 'ERROR', 'm1', NOT_SET } })
  H.eq(send.vol, 1.0)
  s:send('monitor_level', 'm2', '')
  H.eq(s:events(), { { 'MONITOR_LEVEL', 'm2', '70' } })
end)

H.test('monitor_level says so when REAPER has no master track', function()
  local s = project(1.0)
  s.fake.master = nil
  s:send('monitor_level', 'm1', '50')
  H.eq(s:events(), { { 'ERROR', 'm1', NO_OUTPUT } })
end)

H.test('monitor_level is idempotent: the same set twice leaves the same gain and the same answer', function()
  local s, send = project(1.0)
  s:send('monitor_level', 'a', '42')
  local first = s:events()
  local gain = send.vol
  s:send('monitor_level', 'b', '42')
  local second = s:events()
  H.eq(first[1][3], '42')
  H.eq(second[1][3], '42')
  H.eq(send.vol, gain)
end)

H.test('monitor_level opens no undo block and leaves the undo history and the project alone', function()
  local s = project(1.0)
  local begins = 0
  local begin = s.fake.reaper.Undo_BeginBlock2
  s.fake.reaper.Undo_BeginBlock2 = function(...)
    begins = begins + 1
    return begin(...)
  end
  local tracks = #s.fake.tracks
  s:send('monitor_level', 'm1', '12')
  s:send('monitor_level', 'm2', '')
  s:events()
  H.eq(begins, 0)
  H.eq(#s.fake.undo, 0)
  H.eq(#s.fake.tracks, tracks)
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('monitor_level echoes the run id it was sent', function()
  local s = project(1.0)
  s:send('monitor_level', 'run-xyz-7', '60')
  H.eq(s:events()[1][2], 'run-xyz-7')
  s:send('monitor_level', 'run-xyz-8', 'bad')
  H.eq(s:events()[1][2], 'run-xyz-8')
end)
