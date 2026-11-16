-- Input monitoring for the Booth's lane: arm_lane with `monitor` and monitor_restore (narration_monitor.lua). Monitoring is turned on only where
-- a lane has it off, and only that is put back: a track the narrator monitors stays monitored, a value the narrator changed meanwhile is kept.

local H = require('harness')

local function new_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local narrator = s.fake:add_track('Narrator')
  local veyra = s.fake:add_track('Veyra')
  local drone = s.fake:add_track('Drone')
  return s, narrator, veyra, drone
end

local function monitors(s)
  local out = {}
  for _, track in ipairs(s.fake.tracks) do
    out[#out + 1] = track.rec_mon or 0
  end
  return out
end

local function ledger(s)
  return H.read_text(s:path('narration_monitor_ledger.txt'))
end

-- arm_lane with monitor ------------------------------------------------------------------------------------------

H.test('arm_lane with monitor arms the lane and turns its monitoring on when it was off, with no undo point and no change', function()
  local s, narrator, veyra = new_session()
  narrator.armed = true
  local changes = s.fake.change_count
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  H.eq(s:events(), { { 'ARMED', 'a1', veyra.guid, '1', '1', '1' } })
  H.eq(monitors(s), { 0, 1, 0 })
  H.eq(#s.fake.undo, 0)
  H.eq(s.fake.change_count, changes, 'monitoring is not project state the change count follows')
end)

H.test('arm_lane without monitor does not touch monitoring and answers the five fields it always did', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid)
  H.eq(s:events(), { { 'ARMED', 'a1', veyra.guid, '0', '1' } })
  H.eq(monitors(s), { 0, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('a lane the narrator already monitors is left as it is, in either monitoring mode', function()
  for _, mode in ipairs({ 1, 2 }) do
    local s, _, veyra = new_session()
    veyra.rec_mon = mode
    s:send('arm_lane', 'a1', veyra.guid, 'monitor')
    H.eq(s:events(), { { 'ARMED', 'a1', veyra.guid, '0', '1', '0' } })
    H.eq(monitors(s), { 0, mode, 0 })
    s:send('monitor_restore', 'm1')
    H.eq(s:events(), { { 'MONITOR_RESTORED', 'm1', '0', '0', '0' } })
    H.eq(monitors(s), { 0, mode, 0 }, 'monitoring that was on stays on')
  end
end)

H.test('arm_lane with monitor twice for one lane turns it on once and still puts it back', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s:send('arm_lane', 'a2', veyra.guid, 'monitor')
  H.eq(s:events()[2], { 'ARMED', 'a2', veyra.guid, '0', '0', '0' })
  s:send('monitor_restore', 'm1')
  H.eq(s:events(), { { 'MONITOR_RESTORED', 'm1', '1', '0', '0' } })
  H.eq(monitors(s), { 0, 0, 0 })
end)

H.test('changing the lane puts the earlier lane back and monitors the new one', function()
  local s, narrator, veyra = new_session()
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  s:send('arm_lane', 'a2', veyra.guid, 'monitor')
  H.eq(monitors(s), { 0, 1, 0 })
  s:send('monitor_restore', 'm1')
  H.eq(s:events()[3], { 'MONITOR_RESTORED', 'm1', '1', '0', '0' })
  H.eq(monitors(s), { 0, 0, 0 })
end)

H.test('changing the lane keeps an earlier lane the narrator switched off, and one they changed to auto', function()
  local s, narrator, veyra, drone = new_session()
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  narrator.rec_mon = 2
  s:send('arm_lane', 'a2', veyra.guid, 'monitor')
  H.eq(monitors(s), { 2, 1, 0 }, "auto was the narrator's choice")
  veyra.rec_mon = 0
  s:send('arm_lane', 'a3', drone.guid, 'monitor')
  H.eq(monitors(s), { 2, 0, 1 }, 'off stays off')
end)

H.test('arm_lane with monitor is refused while REAPER records, and changes neither the arms nor the monitoring', function()
  local s, narrator, veyra = new_session()
  narrator.armed = true
  s.fake.play_state = 5
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  H.eq(s:events(), { { 'ERROR', 'a1', 'REAPER is recording. Stop recording first.' } })
  H.eq(monitors(s), { 0, 0, 0 })
  H.eq(narrator.armed, true)
end)

H.test('arm_lane with monitor on a track that is gone monitors nothing', function()
  local s = new_session()
  s:send('arm_lane', 'a1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}', 'monitor')
  H.eq(s:events(), { { 'TRACK_STALE', 'a1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
  H.eq(monitors(s), { 0, 0, 0 })
end)

-- monitor_restore ------------------------------------------------------------------------------------------------

H.test('monitor_restore with nothing turned on answers zero and changes nothing', function()
  local s, _, veyra = new_session()
  veyra.rec_mon = 1
  s:send('monitor_restore', 'm1')
  H.eq(s:events(), { { 'MONITOR_RESTORED', 'm1', '0', '0', '0' } })
  H.eq(monitors(s), { 0, 1, 0 })
end)

H.test('monitor_restore puts back only what was turned on, and keeps a value the narrator changed since', function()
  local s, narrator, veyra = new_session()
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  narrator.rec_mon = 0
  s:send('arm_lane', 'a2', veyra.guid, 'monitor')
  s:send('monitor_restore', 'm1')
  H.eq(s:events()[3], { 'MONITOR_RESTORED', 'm1', '1', '0', '0' })
  H.eq(monitors(s), { 0, 0, 0 })
  -- The narrator turned it off, then on again by hand: a second lane that was ours and was changed to auto is kept.
  s:send('arm_lane', 'a3', veyra.guid, 'monitor')
  veyra.rec_mon = 2
  s:send('monitor_restore', 'm2')
  H.eq(s:events(), { { 'ARMED', 'a3', veyra.guid, '0', '0', '1' }, { 'MONITOR_RESTORED', 'm2', '0', '1', '0' } })
  H.eq(monitors(s), { 0, 2, 0 })
end)

H.test('monitor_restore twice puts back once', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s:send('monitor_restore', 'm1')
  veyra.rec_mon = 1
  s:send('monitor_restore', 'm2')
  H.eq(s:events()[3], { 'MONITOR_RESTORED', 'm2', '0', '0', '0' })
  H.eq(monitors(s), { 0, 1, 0 }, 'a monitoring the narrator turned on after the restore is theirs')
end)

H.test('monitor_restore while REAPER records touches nothing, and puts the monitoring back on the first tick after the stop', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s.fake.play_state = 5
  s:send('monitor_restore', 'm1')
  H.eq(s:events()[2], { 'MONITOR_RESTORED', 'm1', '0', '0', '1' })
  H.eq(monitors(s), { 0, 1, 0 })
  s:tick()
  H.eq(monitors(s), { 0, 1, 0 }, 'still recording')
  s.fake.play_state = 0
  s:tick()
  H.eq(monitors(s), { 0, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('a restore that waited does nothing when there was nothing to put back', function()
  local s = new_session()
  s.fake.play_state = 5
  s:send('monitor_restore', 'm1')
  H.eq(s:events(), { { 'MONITOR_RESTORED', 'm1', '0', '0', '0' } })
end)

H.test('monitor_restore puts back a lane whose track moved to another project tab on a later restore', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  local tracks = s.fake.tracks
  s.fake.tracks = {}
  s:send('monitor_restore', 'm1')
  H.eq(s:events()[2], { 'MONITOR_RESTORED', 'm1', '0', '0', '0' })
  H.truthy(ledger(s), 'the row stays on the ledger')
  s.fake.tracks = tracks
  s:send('monitor_restore', 'm2')
  H.eq(s:events(), { { 'MONITOR_RESTORED', 'm2', '1', '0', '0' } })
  H.eq(monitors(s), { 0, 0, 0 })
end)

-- the ledger on disk ---------------------------------------------------------------------------------------------

H.test('the ledger is written while a lane is monitored and removed once it is put back', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  H.eq(ledger(s), veyra.guid .. '\t0\n')
  s:send('monitor_restore', 'm1')
  H.eq(ledger(s), nil)
end)

H.test("a REAPER that closed with a lane monitored is put right by the next bridge tick, and a narrator's change is kept", function()
  local s, narrator, veyra = new_session()
  H.write_file(s:path('narration_monitor_ledger.txt'), veyra.guid .. '\t0\n' .. narrator.guid .. '\t0\nnot a row\n')
  veyra.rec_mon, narrator.rec_mon = 1, 2
  s:tick()
  H.eq(monitors(s), { 2, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('a leftover whose track is not in the open project stays on the ledger until a restore finds it', function()
  local s, _, veyra = new_session()
  H.write_file(s:path('narration_monitor_ledger.txt'), '{FFFFFFFF-0000-4000-8000-00000000FFFF}\t0\n')
  s:tick()
  H.truthy(ledger(s))
  H.eq(monitors(s), { 0, 0, 0 })
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  H.eq(monitors(s), { 0, 1, 0 })
end)

H.test('the ledger a running bridge wrote is not read back as a leftover', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s:tick()
  s:tick()
  H.eq(monitors(s), { 0, 1, 0 })
end)
