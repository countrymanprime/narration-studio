-- punch_preroll (narration_preroll.lua): REAPER's own pre-roll, the length (measures) and whether REAPER plays it before it records,
-- read so the Booth shows the pre-roll REAPER punches with. It answers the length of one measure at the edit cursor so the host can
-- speak in seconds. It never writes a REAPER preference: changing them is the narrator's, in REAPER.

local H = require('harness')

-- REAPER 7.82's own values on a fresh configuration: no pre-roll on play or record, two measures, 4/4 at 120 BPM.
local function session(config)
  local s = H.session()
  s.fake.config.preroll = '0'
  s.fake.config.prerollmeas = '2.00000000000000'
  for key, value in pairs(config or {}) do
    s.fake.config[key] = value
  end
  return s
end

H.test('punch_preroll reads the length, whether REAPER plays it on record, and one measure in seconds at the cursor', function()
  local s = session()
  s:send('punch_preroll', 'p1')
  H.eq(s:events(), { { 'PUNCH_PREROLL', 'p1', '0', '2.000000', '2.000000' } })
  H.eq(#s.fake.undo, 0, 'a read makes no undo point')
end)

H.test('punch_preroll reads the record bit alone: play only is off, record and both are on', function()
  for bits, on in pairs({ ['1'] = '0', ['2'] = '1', ['3'] = '1', ['0'] = '0' }) do
    local s = session({ preroll = bits })
    s:send('punch_preroll', 'p1')
    H.eq(s:events()[1][3], on, 'preroll bits ' .. bits)
  end
end)

H.test('punch_preroll reads a fractional length as REAPER holds it', function()
  local s = session({ prerollmeas = '1.50000000000000' })
  s:send('punch_preroll', 'p1')
  H.eq(s:events()[1][4], '1.500000')
end)

H.test('punch_preroll measures one measure at the tempo and time signature under the edit cursor', function()
  local s = session()
  s.fake.timesig = { 3, 4, 100 }
  s:send('punch_preroll', 'p1')
  H.eq(s:events()[1][5], '1.800000', '3/4 at 100 BPM')
  s.fake.timesig = { 6, 8, 90 }
  s:send('punch_preroll', 'p2')
  H.eq(s:events()[1][5], '2.000000', '6/8 at 90 quarter notes a minute')
end)

H.test('punch_preroll reads while REAPER records', function()
  local s = session()
  s.fake.play_state = 5
  s:send('punch_preroll', 'p1')
  H.eq(s:events()[1][1], 'PUNCH_PREROLL')
end)

H.test('punch_preroll ignores anything sent after the run: it has nothing to set', function()
  local s = session()
  s:send('punch_preroll', 'p1', '1', '1')
  H.eq(s:events(), { { 'PUNCH_PREROLL', 'p1', '0', '2.000000', '2.000000' } })
  H.eq(s.fake.config, { preroll = '0', prerollmeas = '2.00000000000000' }, 'no preference changed')
end)

H.test('punch_preroll needs REAPER to report its configuration', function()
  local s = session()
  s.fake:remove_api('get_config_var_string')
  s:send('punch_preroll', 'p1')
  H.eq(s:events(), { { 'ERROR', 'p1', 'This REAPER version cannot read its pre-roll.' } })
end)

H.test('punch_preroll says so when REAPER has no pre-roll setting to read', function()
  local s = session()
  s.fake.config.prerollmeas = nil
  s:send('punch_preroll', 'p1')
  H.eq(s:events(), { { 'ERROR', 'p1', 'REAPER did not report its pre-roll.' } })
end)
