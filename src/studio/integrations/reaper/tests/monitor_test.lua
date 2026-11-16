-- Input monitoring for the Booth's lane: arm_lane with `monitor` and monitor_restore (narration_monitor.lua). Monitoring is turned on only where
-- a lane has it off, and only that is put back: a track the narrator monitors stays monitored, a value the narrator changed meanwhile is kept.

local H = require('harness')

local OTHER = '/elsewhere/Other.rpp'

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

-- One ledger line as the bridge writes it: the track, the value it had and the project file it was written in.
local function row(s, track, project)
  return track.guid .. '\t0\t' .. (project or s.fake.project_path) .. '\n'
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

H.test("a lane of another project's tab is left alone, and put back when that project is in front again", function()
  local s, _, veyra = new_session()
  local book = s.fake.project_path
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  s.fake.project_path = OTHER
  s:send('monitor_restore', 'm1')
  H.eq(s:events()[2], { 'MONITOR_RESTORED', 'm1', '0', '0', '0' })
  H.eq(monitors(s), { 0, 1, 0 })
  H.truthy(ledger(s), 'the row stays on the ledger')
  s.fake.project_path = book
  s:send('monitor_restore', 'm2')
  H.eq(s:events(), { { 'MONITOR_RESTORED', 'm2', '1', '0', '0' } })
  H.eq(monitors(s), { 0, 0, 0 })
end)

H.test('a row of this project whose track is gone is dropped, and the file goes with it', function()
  local s, _, veyra = new_session()
  s:send('arm_lane', 'a1', veyra.guid, 'monitor')
  table.remove(s.fake.tracks, 2)
  s:send('monitor_restore', 'm1')
  H.eq(s:events()[2], { 'MONITOR_RESTORED', 'm1', '0', '0', '0' })
  H.eq(ledger(s), nil)
end)

H.test('a ghost row of another project is not applied to a track of the same GUID the narrator set by hand', function()
  local s, narrator, veyra = new_session()
  H.write_file(s:path('narration_monitor_ledger.txt'), row(s, veyra, OTHER))
  veyra.rec_mon = 1
  s:send('arm_lane', 'a1', narrator.guid, 'monitor')
  H.eq(monitors(s), { 1, 1, 0 }, "the other project's row did not turn the narrator's own monitoring off")
  H.truthy(ledger(s):find('Other.rpp', 1, true), 'the other project keeps its row')
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

H.test('a leftover of another project stays on the ledger, and one of a track that is gone is dropped', function()
  local s, _, veyra = new_session()
  H.write_file(s:path('narration_monitor_ledger.txt'), row(s, veyra, OTHER) .. '{FFFFFFFF-0000-4000-8000-00000000FFFF}\t0\t' .. s.fake.project_path .. '\n')
  s:tick()
  H.eq(ledger(s), row(s, veyra, OTHER))
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
  H.write_file(s:path('narration_monitor_ledger.txt'), bare .. '\t0\t' .. s.fake.project_path .. '\n')
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
