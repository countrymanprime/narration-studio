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

-- One ledger line as the bridge writes it: the track and the value it had.
local function row(_, track)
  return track.guid .. '\t0\n'
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

H.test('a restore that waited does not take back a lane monitored after the recording stopped', function()
  local s, narrator, veyra = new_session()
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  s.fake.play_state = 5
  s:send('monitor_restore', 'm1')
  s.fake.play_state = 0
  s:send('arm_lane', 'a2', veyra.guid, 'monitor')
  s:tick()
  H.eq(monitors(s), { 0, 1, 0 }, 'the Booth was entered again, so its lane stays monitored')
end)

H.test('a restore that waited does nothing when there was nothing to put back', function()
  local s = new_session()
  s.fake.play_state = 5
  s:send('monitor_restore', 'm1')
  H.eq(s:events(), { { 'MONITOR_RESTORED', 'm1', '0', '0', '0' } })
end)

H.test('a lane whose track is not in the project in front is kept as a ghost and put back once that project is in front again', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  local tracks, book = s.fake.tracks, s.fake.project_path
  s.fake.tracks, s.fake.project_path = {}, '/elsewhere/Other.rpp'
  s:send('monitor_restore', 'm1')
  H.eq(s:events()[2], { 'MONITOR_RESTORED', 'm1', '0', '0', '0' })
  H.eq(ledger(s), row(s, veyra), 'the row stays on the ledger')
  s.fake.tracks, s.fake.project_path = tracks, book
  s:tick()
  H.eq(monitors(s), { 0, 0, 0 }, 'the next tick with the project in front puts it back')
  H.eq(ledger(s), nil)
end)

H.test('a Save as during the take keeps the lane findable: the row is the track, not the file', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s.fake.project_path = H.join(host.tmpdir(), 'Book2.rpp')
  s:send('monitor_restore', 'm1')
  H.eq(s:events()[2], { 'MONITOR_RESTORED', 'm1', '1', '0', '0' })
  H.eq(monitors(s), { 0, 0, 0 })
end)

H.test('a project that was never saved and is saved before the Booth is left still gets its monitoring put back', function()
  local s, _, veyra = new_session()
  s.fake.project_path = ''
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s.fake.project_path = H.join(host.tmpdir(), 'Saved.rpp')
  s:send('monitor_restore', 'm1')
  H.eq(s:events()[2], { 'MONITOR_RESTORED', 'm1', '1', '0', '0' })
  H.eq(monitors(s), { 0, 0, 0 })
end)

H.test('a ghost whose track resolves but no longer reads what the app left is dropped and the track kept', function()
  local s, narrator, veyra = new_session()
  H.write_file(s:path('narration_monitor_ledger.txt'), row(s, veyra))
  veyra.rec_mon = 2
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  H.eq(monitors(s), { 1, 2, 0 }, "the narrator's own value is not touched")
  H.eq(ledger(s), row(s, narrator), 'the row is gone')
end)

H.test('the ledger holds at most 64 rows and drops the oldest', function()
  local s = new_session()
  local lines = {}
  for index = 1, 70 do
    lines[#lines + 1] = string.format('{FFFFFFFF-0000-4000-8000-%012X}\t0\n', index)
  end
  H.write_file(s:path('narration_monitor_ledger.txt'), table.concat(lines))
  s:tick()
  local kept = H.lines(ledger(s))
  H.eq(#kept, 64)
  H.eq(kept[1], string.format('{FFFFFFFF-0000-4000-8000-%012X}\t0', 7), 'the six oldest are gone')
end)

H.test('a leftover of a project opened after the bridge started is put back on a tick once that project is in front', function()
  local s, narrator = new_session()
  local wanted = narrator.guid
  table.remove(s.fake.tracks, 1)
  H.write_file(s:path('narration_monitor_ledger.txt'), wanted .. '\t0\n')
  s:tick()
  H.eq(ledger(s), wanted .. '\t0\n', 'its project is not in front: the row waits')
  local opened = s.fake:add_track('Opened')
  opened.guid = wanted
  opened.rec_mon = 1
  s:tick()
  H.eq(opened.rec_mon, 0)
  H.eq(ledger(s), nil)
end)

-- the ledger on disk ---------------------------------------------------------------------------------------------

H.test('the ledger is written while a lane is monitored and removed once it is put back', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  H.eq(ledger(s), row(s, veyra))
  s:send('monitor_restore', 'm1')
  H.eq(ledger(s), nil)
end)

H.test("a REAPER that closed with a lane monitored is put right by the next bridge tick, and a narrator's change is kept", function()
  local s, narrator, veyra = new_session()
  H.write_file(s:path('narration_monitor_ledger.txt'), row(s, veyra) .. row(s, narrator) .. 'not a row\n')
  veyra.rec_mon, narrator.rec_mon = 1, 2
  s:tick()
  H.eq(monitors(s), { 2, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('a leftover whose track is not there stays on the ledger', function()
  local s = new_session()
  H.write_file(s:path('narration_monitor_ledger.txt'), '{FFFFFFFF-0000-4000-8000-00000000FFFF}\t0\n')
  s:tick()
  H.eq(ledger(s), '{FFFFFFFF-0000-4000-8000-00000000FFFF}\t0\n')
  H.eq(monitors(s), { 0, 0, 0 })
end)

H.test('a leftover ledger is put back when the first command is monitor_restore', function()
  local s, narrator = new_session()
  H.write_file(s:path('narration_monitor_ledger.txt'), row(s, narrator))
  narrator.rec_mon = 1
  s:send('monitor_restore', 'm1')
  H.eq(monitors(s), { 0, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('the ledger a running bridge wrote is not read back as a leftover', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s:tick()
  s:tick()
  H.eq(monitors(s), { 0, 1, 0 })
end)

H.test('a leftover ledger is put back even when a lane was monitored before the first tick', function()
  local s, narrator, veyra = new_session()
  H.write_file(s:path('narration_monitor_ledger.txt'), row(s, narrator))
  narrator.rec_mon = 1
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  H.eq(monitors(s), { 0, 1, 0 }, "the crashed REAPER's lane went back and the new lane is monitored")
  H.eq(ledger(s), row(s, veyra), "the file holds this bridge's lane only once the leftover is put back")
end)

H.test('monitor_restore while a record_start is pending waits, and puts the monitoring back once the take is over', function()
  local s, narrator = new_session()
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  s.fake.record_delay_ticks = 3
  s:send('record_start', 'r1', narrator.guid)
  s:send('monitor_restore', 'm1')
  H.eq(monitors(s), { 1, 0, 0 }, 'the take is starting: the monitoring is not cut')
  for _ = 1, 4 do
    s:tick()
  end
  H.eq(monitors(s), { 1, 0, 0 }, 'the take runs')
  s:send('record_stop', 's1')
  s:tick()
  H.eq(monitors(s), { 0, 0, 0 })
end)

H.test('monitor_restore while a record_start is pending answers waiting', function()
  local s, narrator = new_session()
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  s.fake.record_delay_ticks = 3
  s:send('record_start', 'r1', narrator.guid)
  s:events()
  s:send('monitor_restore', 'm1')
  H.eq(s:events(), { { 'MONITOR_RESTORED', 'm1', '0', '0', '1' } })
end)

H.test('the leftover ledger is not read while REAPER records, and is put back after the stop', function()
  local s, narrator = new_session()
  H.write_file(s:path('narration_monitor_ledger.txt'), row(s, narrator))
  narrator.rec_mon = 1
  s.fake.play_state = 5
  s:tick()
  H.eq(monitors(s), { 1, 0, 0 })
  H.truthy(ledger(s), 'the file is kept')
  s.fake.play_state = 0
  s:tick()
  H.eq(monitors(s), { 0, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('a damaged ledger row cannot write any value but the off a lane had', function()
  local s, narrator, veyra, drone = new_session()
  H.write_file(s:path('narration_monitor_ledger.txt'), narrator.guid .. '\t99\n' .. veyra.guid .. '\t1\n' .. drone.guid .. '\t-3\n')
  narrator.rec_mon, veyra.rec_mon, drone.rec_mon = 1, 1, 1
  s:tick()
  H.eq(monitors(s), { 1, 1, 1 })
end)

H.test('a restore that waits for a take is dropped when the Booth is entered again during it', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s.fake.play_state = 5
  s:send('monitor_restore', 'm1')
  s:events()
  s:send('monitor_restore', 'm2', 'cancel')
  H.eq(s:events(), { { 'MONITOR_RESTORED', 'm2', '0', '0', '0' } })
  s.fake.play_state = 0
  s:tick()
  H.eq(monitors(s), { 0, 1, 0 }, 'the narrator is back in the Booth, so the lane stays monitored')
  s:send('monitor_restore', 'm3')
  H.eq(monitors(s), { 0, 0, 0 }, 'a later leave still puts it back')
end)

H.test('cancel with no restore waiting changes nothing', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s:events()
  s:send('monitor_restore', 'm1', 'cancel')
  H.eq(s:events(), { { 'MONITOR_RESTORED', 'm1', '0', '0', '0' } })
  H.eq(monitors(s), { 0, 1, 0 })
end)

H.test('monitoring is not turned on when the ledger that puts it back cannot be written', function()
  local s, _, veyra = new_session()
  host.makedirs(s:path('narration_monitor_ledger.txt'))
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  H.eq(s:events(), { { 'ARMED', 'a1', veyra.guid, '0', '1', '0' } })
  H.eq(monitors(s), { 0, 0, 0 })
  s:send('monitor_restore', 'm1')
  H.eq(s:events(), { { 'MONITOR_RESTORED', 'm1', '0', '0', '0' } })
end)

-- The recorded run (docs/research/2026-11-16-booth-arms-and-monitors.md) read 1 on a track the CI helper inserted, while the fake answers 0 for a
-- track nobody set. A track that starts monitored is left on and never put back, whichever start REAPER has.
H.test('a track that starts monitored, as the recorded run found one, is left on and not put back', function()
  local s, narrator = new_session()
  narrator.rec_mon = 1
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  s:send('monitor_restore', 'm1')
  H.eq(s:events(), { { 'ARMED', 'a1', narrator.guid, '0', '1', '0' }, { 'MONITOR_RESTORED', 'm1', '0', '0', '0' } })
  H.eq(monitors(s), { 1, 0, 0 })
end)

H.test('a voice switched to during a take is not monitored then, and is monitored by the arm sent after the stop', function()
  local s, narrator, veyra = new_session()
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  s:send('record_start', 'r1', narrator.guid)
  s:send('switch_voice', 'v1', veyra.guid)
  H.eq(monitors(s), { 1, 0, 0 }, "the DAW's monitoring is not touched while it records")
  s:send('record_stop', 's1')
  s:events()
  s:send('arm_lane', 'a2', veyra.guid, 'monitor')
  H.eq(s:events()[1][6], '1', 'the voice the next take records on is monitored')
  H.eq(monitors(s), { 0, 1, 0 }, 'one voice at a time')
end)

H.test('a leftover ledger is put back when a bridge that started during a take gets monitor_restore as its first command', function()
  local s, narrator = new_session()
  H.write_file(s:path('narration_monitor_ledger.txt'), row(s, narrator))
  narrator.rec_mon = 1
  s.fake.play_state = 5
  s:tick()
  s.fake.play_state = 0
  s:send('monitor_restore', 'm1')
  H.eq(monitors(s), { 0, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('a lane already on the ledger is turned on again even when the ledger cannot be rewritten', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  veyra.rec_mon = 0
  os.remove(s:path('narration_monitor_ledger.txt'))
  host.makedirs(s:path('narration_monitor_ledger.txt'))
  s:events()
  s:send('arm_lane', 'a2', veyra.guid, 'monitor')
  H.eq(s:events(), { { 'ARMED', 'a2', veyra.guid, '0', '0', '1' } })
  H.eq(monitors(s), { 0, 1, 0 })
end)

H.test('an earlier lane is not switched off while the ledger that lists it cannot be rewritten', function()
  local s, narrator, veyra = new_session()
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  os.remove(s:path('narration_monitor_ledger.txt'))
  host.makedirs(s:path('narration_monitor_ledger.txt'))
  s:events()
  s:send('arm_lane', 'a2', veyra.guid, 'monitor')
  H.eq(s:events(), { { 'ARMED', 'a2', veyra.guid, '1', '1', '0' } })
  H.eq(monitors(s), { 1, 0, 0 }, 'the narrator-side state and the file still agree: nothing was switched')
end)

H.test('a leftover row with a lower case or brace-less GUID is read as the track it names', function()
  local s, narrator = new_session()
  local bare = narrator.guid:gsub('[{}]', ''):lower()
  H.write_file(s:path('narration_monitor_ledger.txt'), bare .. '\t0\n')
  narrator.rec_mon = 1
  s:tick()
  H.eq(monitors(s), { 0, 0, 0 })
end)

H.test('monitor_restore refuses a second argument it does not know and changes nothing', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s:events()
  s:send('monitor_restore', 'm1', 'everything')
  H.eq(s:events(), { { 'ERROR', 'm1', 'Unsupported monitor_restore argument.' } })
  H.eq(monitors(s), { 0, 1, 0 })
end)

H.test("choosing another voice puts the earlier voice's monitoring back at once, not on a later tick", function()
  local s, narrator, veyra = new_session()
  -- A ghost row has been tried already, so the tick has nothing new to try until the project or its track count changes.
  H.write_file(s:path('narration_monitor_ledger.txt'), '{FFFFFFFF-0000-4000-8000-00000000FFFF}\t0\n')
  s:tick()
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  s:send('arm_lane', 'a2', veyra.guid, 'monitor')
  H.eq(monitors(s), { 0, 1, 0 })
end)

-- A symlink to /dev/full opens for writing and fails when the buffer is flushed on close: a disk that is full.
local function full_disk_ledger(s)
  os.remove(s:path('narration_monitor_ledger.txt'))
  H.truthy(os.execute("ln -s /dev/full '" .. s:path('narration_monitor_ledger.txt') .. "'"), 'the harness can make a symlink')
end

H.test('monitoring is not turned on when the ledger write fails on close, as on a full disk', function()
  local s, _, veyra = new_session()
  full_disk_ledger(s)
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  H.eq(s:events(), { { 'ARMED', 'a1', veyra.guid, '0', '1', '0' } })
  H.eq(monitors(s), { 0, 0, 0 })
end)

H.test('a ledger that could not be written after a lane was put back is written again on a tick', function()
  local s, narrator, veyra = new_session()
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  s:send('arm_lane', 'a2', veyra.guid, 'monitor')
  full_disk_ledger(s)
  s:send('monitor_restore', 'm0', 'cancel')
  veyra.rec_mon = 1
  s:send('arm_lane', 'a3', veyra.guid, 'monitor')
  os.remove(s:path('narration_monitor_ledger.txt'))
  s:tick()
  H.eq(ledger(s), row(s, veyra), 'the file lists the lane that is still monitored, and no other')
end)

-- guards, tabs, ghosts and retries ------------------------------------------------------------------------------------

H.test('a leftover row beyond the first 64 KB of a ledger is not read', function()
  local s, narrator, veyra = new_session()
  local lines = { narrator.guid .. '\t0\n' }
  local size = #lines[1]
  while size < 70000 do
    local filler = 'x' .. string.rep('-', 78) .. '\n'
    lines[#lines + 1] = filler
    size = size + #filler
  end
  lines[#lines + 1] = veyra.guid .. '\t0\n'
  H.write_file(s:path('narration_monitor_ledger.txt'), table.concat(lines))
  narrator.rec_mon, veyra.rec_mon = 1, 1
  s:tick()
  H.eq(monitors(s), { 0, 1, 0 }, 'the first row is read, the one past the bound is not')
end)

H.test('a ghost is tried again in a second project that was never saved and holds as many tracks', function()
  local s, _, veyra = new_session()
  s.fake.project_path = ''
  local front = { pointer = {} }
  reaper.EnumProjects = function(index)
    if index == -1 then
      return front.pointer, ''
    end
    return nil, ''
  end
  local tab_a, pointer_a = s.fake.tracks, front.pointer
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s.fake.tracks = {}
  s.fake:add_track('Other 1')
  s.fake:add_track('Other 2')
  s.fake:add_track('Other 3')
  local tab_b = s.fake.tracks
  front.pointer = {}
  s:send('monitor_restore', 'm1')
  s:tick()
  H.eq(veyra.rec_mon, 1, 'tab B is in front: the lane of tab A waits as a ghost, tried once')
  H.truthy(ledger(s), 'the row stays on the ledger')
  s.fake.tracks, front.pointer = tab_a, pointer_a
  H.eq(#tab_a, #tab_b, 'both tabs hold the same number of tracks')
  s:tick()
  H.eq(veyra.rec_mon, 0, 'tab A is in front again and the ghost is tried again')
  H.eq(ledger(s), nil)
end)

local function ghost_of(s, veyra)
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  local tracks, book = s.fake.tracks, s.fake.project_path
  s.fake.tracks, s.fake.project_path = {}, '/elsewhere/Other.rpp'
  s:send('monitor_restore', 'm1')
  s.fake.tracks, s.fake.project_path = tracks, book
  s:events()
end

H.test('a lane that is a ghost and is armed with monitor again becomes the live row, and the next tick does not switch it off', function()
  for _, reads in ipairs({ 1, 0 }) do
    local s, _, veyra = new_session()
    ghost_of(s, veyra)
    veyra.rec_mon = reads
    s:send('arm_lane', 'a2', veyra.guid, 'monitor')
    H.eq(monitors(s), { 0, 1, 0 })
    s:tick()
    H.eq(monitors(s), { 0, 1, 0 }, 'the tick finds no ghost to put back (the lane read ' .. reads .. ')')
    H.eq(ledger(s), row(s, veyra), 'one row, not two')
    s:send('monitor_restore', 'm2')
    H.eq(monitors(s), { 0, 0, 0 })
    H.eq(ledger(s), nil)
  end
end)

H.test('a ledger that stays unwritable is not opened on every tick, and is written once it can be', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  os.remove(s:path('narration_monitor_ledger.txt'))
  host.makedirs(s:path('narration_monitor_ledger.txt'))
  local opened, real_open = 0, io.open
  io.open = function(path, mode, ...)
    if tostring(path):find('narration_monitor_ledger', 1, true) and mode == 'w' then
      opened = opened + 1
    end
    return real_open(path, mode, ...)
  end
  local ok, err = pcall(function()
    s:send('arm_lane', 'a2', veyra.guid, 'monitor')
    H.truthy(opened <= 2, 'the command that changes rows tries, and its own tick once more')
    for _ = 1, 300 do
      s:tick()
    end
  end)
  io.open = real_open
  assert(ok, err)
  H.truthy(
    opened >= 2 and opened <= 12,
    'tried again a few times, not on every tick (the spacing makes about 11 opens in 300 ticks; 12 leaves one of slack): ' .. opened
  )
  H.truthy(host.removedir(s:path('narration_monitor_ledger.txt')), 'the folder that stood for the ledger is gone')
  for _ = 1, 260 do
    s:tick()
  end
  H.eq(ledger(s), row(s, veyra), 'written once the folder let it')
end)

H.test('arm_lane refuses a third argument it does not know and changes nothing', function()
  local s, narrator, veyra = new_session()
  narrator.armed = true
  s:send('arm_lane', 'a1', veyra.guid, 'loud')
  H.eq(s:events(), { { 'ERROR', 'a1', 'Unsupported arm_lane argument.' } })
  H.eq(narrator.armed, true)
  H.eq(veyra.armed or false, false)
  H.eq(monitors(s), { 0, 0, 0 })
end)

H.test('arm_lane with monitor answers an error, not the five fields, when the bridge has no monitoring', function()
  local bare = H.session({
    project_path = H.join(host.tmpdir(), 'Book.rpp'),
    setup = function(registry)
      registry.monitor_lane = nil
    end,
  })
  local lane = bare.fake:add_track('Veyra')
  bare:send('arm_lane', 'a1', lane.guid, 'monitor')
  H.eq(bare:events(), { { 'ERROR', 'a1', 'This bridge cannot monitor a lane.' } })
  H.eq(lane.armed or false, false)
  bare:send('arm_lane', 'a2', lane.guid)
  H.eq(bare:events(), { { 'ARMED', 'a2', lane.guid, '0', '1' } })
end)

H.test('a leftover row with GUID letters in lower case is read as the track it names', function()
  local s, narrator = new_session()
  narrator.guid = '{ABCDEF01-ABCD-4BCD-8BCD-ABCDEF012345}'
  H.write_file(s:path('narration_monitor_ledger.txt'), narrator.guid:lower() .. '\t0\n')
  narrator.rec_mon = 1
  s:tick()
  H.eq(monitors(s), { 0, 0, 0 })
end)

H.test('a ledger with two rows for one lane leaves no second ghost to switch the lane off once it is armed again', function()
  local s, _, veyra = new_session()
  veyra.rec_mon = 1
  H.write_file(s:path('narration_monitor_ledger.txt'), row(s, veyra) .. row(s, veyra))
  local tracks, book = s.fake.tracks, s.fake.project_path
  s.fake.tracks, s.fake.project_path = {}, '/elsewhere/Other.rpp'
  s:tick()
  s.fake.tracks, s.fake.project_path = tracks, book
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s:tick()
  s:tick()
  H.eq(monitors(s), { 0, 1, 0 }, 'the lane stays monitored')
  H.eq(ledger(s), row(s, veyra), 'one row is left')
end)

H.test('a write inside a tick that fails does not reset the spacing of the retries', function()
  local s, _, veyra = new_session()
  -- A row for a track that is nowhere keeps the ledger non-empty, so the file is written (and fails) when the lane's ghost resolves.
  H.write_file(s:path('narration_monitor_ledger.txt'), '{FFFFFFFF-0000-4000-8000-00000000FFFF}\t0\n')
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  local tracks, book = s.fake.tracks, s.fake.project_path
  os.remove(s:path('narration_monitor_ledger.txt'))
  host.makedirs(s:path('narration_monitor_ledger.txt'))
  s.fake.tracks, s.fake.project_path = {}, '/elsewhere/Other.rpp'
  s:send('monitor_restore', 'm1')
  for _ = 1, 40 do
    s:tick()
  end
  local opened, real_open = 0, io.open
  io.open = function(path, mode, ...)
    if tostring(path):find('narration_monitor_ledger', 1, true) and mode == 'w' then
      opened = opened + 1
    end
    return real_open(path, mode, ...)
  end
  local ok, err = pcall(function()
    s.fake.tracks, s.fake.project_path = tracks, book
    for _ = 1, 8 do
      s:tick()
    end
  end)
  io.open = real_open
  assert(ok, err)
  H.truthy(opened <= 2, 'the ghost retry that fails is spaced like the others, not tried on each of the next ticks: ' .. opened)
end)

H.test('a ledger that cannot be written is opened once in the tick that recovers it, not twice', function()
  local s, narrator = new_session()
  -- One lane resolves and one track is nowhere, so the ledger is not empty after the recovery and the write is attempted (and refused).
  H.write_file(s:path('narration_monitor_ledger.txt'), row(s, narrator) .. '{FFFFFFFF-0000-4000-8000-00000000FFFF}\t0\n')
  narrator.rec_mon = 1
  local opened, real_open = 0, io.open
  io.open = function(path, mode, ...)
    if tostring(path):find('narration_monitor_ledger', 1, true) and mode == 'w' then
      opened = opened + 1
      return nil, 'denied'
    end
    return real_open(path, mode, ...)
  end
  local ok, err = pcall(function()
    s:tick()
  end)
  io.open = real_open
  assert(ok, err)
  H.eq(monitors(s), { 0, 0, 0 }, 'the leftover lane went back')
  H.eq(opened, 1, 'one write attempt in the first tick')
end)

H.test('a tick that retries the ledger and also runs a waited restore opens the ledger once', function()
  local s, _, veyra = new_session()
  local foreign = '{FFFFFFFF-0000-4000-8000-00000000FFFF}'
  -- A row for a track that is nowhere becomes a ghost, so the ledger is not empty after the lane is put back.
  H.write_file(s:path('narration_monitor_ledger.txt'), foreign .. '\t0\n')
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  local opened, refuse, real_open = 0, true, io.open
  io.open = function(path, mode, ...)
    if tostring(path):find('narration_monitor_ledger', 1, true) and mode == 'w' then
      opened = opened + 1
      if refuse then
        return nil, 'denied'
      end
    end
    return real_open(path, mode, ...)
  end
  local ok, err = pcall(function()
    s:send('arm_lane', 'a2', veyra.guid, 'monitor') -- the lane is on the ledger already: the write is refused and stays pending
    s.fake.play_state = 5
    s:send('monitor_restore', 'm1') -- a take: the restore waits
    s.fake.play_state = 0
    local later = s.fake:add_track('Later')
    later.guid, later.rec_mon = foreign, 1 -- the ghost's track appears, so the ghost is put back in the same tick
    opened = 0
    s:tick()
  end)
  io.open = real_open
  assert(ok, err)
  H.eq(opened, 1, 'one attempt in the tick, whichever path wrote first')
end)

H.test('the harness frees a folder it made, on every platform', function()
  local base = host.tmpdir()
  local dir = H.join(base, 'made_here')
  host.makedirs(dir)
  H.eq(host.listsubdirs(base)[1], 'made_here')
  H.eq(host.removedir(dir), true)
  H.eq(host.removedir(dir), false, 'a folder that is not there is not removed')
end)
