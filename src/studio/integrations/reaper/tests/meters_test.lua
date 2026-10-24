-- daw_meters (narration_meters.lua): the levels REAPER's own meters show, read so the Booth's Levels menu shows the DAW's input and
-- output. The output is the master track; the input is the first record-armed track, which REAPER meters whether or not its
-- monitoring is on (REAPER 7.82, 2026-10-24). Peaks are dBFS to 0.1 dB, -100.0 for silence. It changes nothing.

local H = require('harness')

local CANNOT_READ = 'This REAPER version cannot read its meters.'

local function session()
  local s = H.session()
  s.fake.calls = {}
  return s
end

H.test('daw_meters reads the master and the armed track, the louder channel of each, in dBFS', function()
  local s = session()
  local track = s.fake:add_track('Chapter 1')
  track.armed = true
  track.peaks = { 0.25, 0.5 }
  s.fake.master.peaks = { 0.1, 0.05 }
  s:send('daw_meters', 'm1')
  H.eq(s:events(), { { 'METERS', 'm1', '-20.0', '-6.0', 'Chapter 1' } })
end)

H.test('daw_meters says no track is armed with an empty input, and still reads the output', function()
  local s = session()
  local track = s.fake:add_track('Chapter 1')
  track.peaks = { 0.5, 0.5 } -- playing back, not armed: not the input
  s.fake.master.peaks = { 0.5, 0.5 }
  s:send('daw_meters', 'm1')
  H.eq(s:events(), { { 'METERS', 'm1', '-6.0', '', '' } })
end)

H.test('daw_meters takes the first armed track in the track list', function()
  local s = session()
  s.fake:add_track('Notes').peaks = { 0.9, 0.9 }
  local first = s.fake:add_track('Chapter 2')
  first.armed = true
  first.peaks = { 0.01, 0 }
  local second = s.fake:add_track('Chapter 3')
  second.armed = true
  second.peaks = { 1, 1 }
  s:send('daw_meters', 'm1')
  H.eq(s:events()[1], { 'METERS', 'm1', '-100.0', '-40.0', 'Chapter 2' })
end)

H.test('daw_meters answers silence as -100.0 and a level over full scale as it is', function()
  local s = session()
  local track = s.fake:add_track('Loud')
  track.armed = true
  track.peaks = { 2, 0 }
  s.fake.master.peaks = { 1e-9, 0 }
  s:send('daw_meters', 'm1')
  H.eq(s:events()[1], { 'METERS', 'm1', '-100.0', '6.0', 'Loud' })
end)

H.test('daw_meters carries a track name with a separator, emoji and right-to-left text intact', function()
  local s = session()
  local track = s.fake:add_track('Ch 1 | “Alice” 🎙 فصل')
  track.armed = true
  s:send('daw_meters', 'm1')
  H.eq(s:events()[1][5], 'Ch 1 | “Alice” 🎙 فصل')
end)

H.test('daw_meters changes nothing, opens no undo block and ignores anything sent after the run', function()
  local s = session()
  local track = s.fake:add_track('Chapter 1')
  track.armed = true
  local changes = s.fake.change_count
  s:send('daw_meters', 'm1', 'arm', '1')
  H.eq(s:events()[1][1], 'METERS')
  H.eq(#s.fake.undo, 0, 'no undo point')
  H.eq(s.fake.change_count, changes, 'no project change')
  H.eq(s.fake.calls, {}, 'nothing set')
  H.eq(track.armed, true, 'the arm is left as it was')
end)

H.test('daw_meters reads while REAPER records', function()
  local s = session()
  s.fake.play_state = 5
  s:send('daw_meters', 'm1')
  H.eq(s:events()[1][1], 'METERS')
end)

H.test('daw_meters needs REAPER to report its meters', function()
  local s = session()
  s.fake:remove_api('Track_GetPeakInfo')
  s:send('daw_meters', 'm1')
  H.eq(s:events(), { { 'ERROR', 'm1', CANNOT_READ } })
end)
