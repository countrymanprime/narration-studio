-- The bridge timing diagnostic (narration_ui_bridge.lua, #2251): off unless the ExtState key is set, then one summary
-- line of tick and command timings every report interval, to <session>/bridge-timing.log and REAPER's console. It holds
-- counts, milliseconds and command names only, never a path or project text (threat model row 7a's rule).

local H = require('harness')

local function timing_on(s, value)
  local bridge = s.bridge
  reaper.SetExtState(bridge.SESSION_SECTION, bridge.TIMING_KEY, value or '1', false)
end

local function ticks(s, count)
  for _ = 1, count do
    s:tick()
  end
end

H.test('timing is off by default: no file, no console output, however long the bridge runs', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  s:send('ping', 'r1')
  ticks(s, 50)
  H.eq(H.read_file(s:path('bridge-timing.log')), nil)
  H.eq(s.fake.console, nil)
end)

H.test('timing on: a summary line every report interval with ticks, the listing and each command by name', function()
  local project = H.join(host.tmpdir(), 'Secret Book.rpp')
  local s = H.session({ project_path = project })
  s.fake.clock_step = 0.01
  timing_on(s)
  ticks(s, 5)
  local track = s.fake:add_track('Chapter 1')
  s:send('chapter_track_state', 't1', track.guid)
  s:send('ping', 'r1')
  s:send('ping', 'r2')
  local before = H.read_file(s:path('bridge-timing.log'))
  for _ = 1, 400 do
    s:tick()
    if H.read_file(s:path('bridge-timing.log')) ~= before then
      break
    end
  end
  local lines = H.lines(H.read_text(s:path('bridge-timing.log')))
  H.eq(#lines >= 1, true, 'no summary line was written')
  local line = lines[#lines]
  H.contains(line, 'ticks=')
  H.contains(line, 'tick_ms p50=')
  H.contains(line, 'listing_ms')
  H.contains(line, 'chapter_track_state n=1')
  H.contains(line, 'ping n=2')
  H.eq(line:find(project, 1, true), nil, 'the project path must not be written')
  H.eq(line:find('Secret', 1, true), nil, 'the project name must not be written')
  H.contains(s.fake.console, line)
end)

H.test('timing turned off again writes nothing more', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  s.fake.clock_step = 0.01
  timing_on(s)
  ticks(s, 1500)
  H.eq(H.read_file(s:path('bridge-timing.log')) ~= nil, true, 'timing on wrote nothing')
  reaper.DeleteExtState(s.bridge.SESSION_SECTION, s.bridge.TIMING_KEY, false)
  -- The switch is read about once a second, so a report already due may still land before it is.
  ticks(s, 100)
  local written = H.read_file(s:path('bridge-timing.log'))
  ticks(s, 1500)
  H.eq(H.read_file(s:path('bridge-timing.log')), written)
end)

H.test('timing off asks REAPER for the switch about once a second, not on every tick', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  s.fake.clock_step = 0.01
  local real, asked = reaper.GetExtState, 0
  reaper.GetExtState = function(section, key)
    if key == s.bridge.TIMING_KEY then
      asked = asked + 1
    end
    return real(section, key)
  end
  ticks(s, 300)
  reaper.GetExtState = real
  -- 300 ticks at a few clock reads each is several seconds of fake time: a handful of reads, far fewer than ticks.
  H.eq(asked >= 1 and asked <= 30, true, 'asked ' .. asked .. ' times in 300 ticks')
end)
