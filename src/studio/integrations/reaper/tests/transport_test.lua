-- Recording in REAPER for the Read Aloud control bar: arm_only, record_start and record_stop (narration_transport.lua).
-- Arming the chapter's track disarms every other track and remembers the arms the narrator had; they come back when a
-- recording the app started stops, whoever stops it. The app only ever stops a recording it started.

local H = require('harness')

local function new_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local chapter = s.fake:add_track('Chapter 1')
  local other = s.fake:add_track('Chapter 2')
  local pickups = s.fake:add_track('Pickups')
  return s, chapter, other, pickups
end

local function arms(s)
  local out = {}
  for _, track in ipairs(s.fake.tracks) do
    out[#out + 1] = track.armed and 1 or 0
  end
  return out
end

local function calls_named(s, name)
  local count = 0
  for _, call in ipairs(s.fake.calls) do
    if call.name == name then
      count = count + 1
    end
  end
  return count
end

-- arm_only -------------------------------------------------------------------------------------------------------

H.test('arm_only arms the named track, disarms every other one and makes no undo point', function()
  local s, chapter, other, pickups = new_session()
  other.armed, pickups.armed = true, true
  s:send('arm_only', 'a1', chapter.guid)
  H.eq(s:events(), { { 'ARMED', 'a1', chapter.guid, '2', '1' } })
  H.eq(arms(s), { 1, 0, 0 })
  H.eq(#s.fake.undo, 0, 'a track arm is not in REAPER undo history, so no empty undo point either')
end)

H.test('arm_only changes nothing when only the named track is armed already', function()
  local s, chapter = new_session()
  chapter.armed = true
  s:send('arm_only', 'a1', chapter.guid)
  H.eq(s:events(), { { 'ARMED', 'a1', chapter.guid, '0', '0' } })
  H.eq(calls_named(s, 'SetMediaTrackInfo_Value'), 0)
end)

H.test('arm_only is refused while REAPER is recording, and nothing changes', function()
  local s, chapter, other = new_session()
  other.armed = true
  s.fake.play_state = 5
  s:send('arm_only', 'a1', chapter.guid)
  H.eq(s:events(), { { 'ERROR', 'a1', 'REAPER is recording. Stop recording first.' } })
  H.eq(arms(s), { 0, 1, 0 })
end)

H.test('arm_only reports a track that is gone and arms nothing in its place', function()
  local s, _, other = new_session()
  other.armed = true
  s:send('arm_only', 'a1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}')
  H.eq(s:events(), { { 'TRACK_STALE', 'a1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
  H.eq(arms(s), { 0, 1, 0 })
end)

H.test('arm_only needs the track APIs', function()
  local s, chapter = new_session()
  s.fake:remove_api('SetMediaTrackInfo_Value')
  s:send('arm_only', 'a1', chapter.guid)
  H.eq(s:events(), { { 'ERROR', 'a1', 'This REAPER version cannot arm tracks.' } })
end)

-- arm_lane -------------------------------------------------------------------------------------------------------
-- The Booth's lane choice while no take runs: the same arming as arm_only, but the arms are the narrator's from then on
-- (nothing is remembered to put back), so the DAW keeps agreeing with the Booth after a take (#3429).

H.test('arm_lane arms the named track, disarms every other one and makes no undo point', function()
  local s, chapter, other, pickups = new_session()
  other.armed, pickups.armed = true, true
  s:send('arm_lane', 'a1', chapter.guid)
  H.eq(s:events(), { { 'ARMED', 'a1', chapter.guid, '2', '1' } })
  H.eq(arms(s), { 1, 0, 0 })
  H.eq(#s.fake.undo, 0)
end)

H.test('arm_lane changes nothing when the named track is the one armed already', function()
  local s, chapter = new_session()
  chapter.armed = true
  s:send('arm_lane', 'a1', chapter.guid)
  H.eq(s:events(), { { 'ARMED', 'a1', chapter.guid, '0', '0' } })
  H.eq(calls_named(s, 'SetMediaTrackInfo_Value'), 0)
end)

H.test('arm_lane is refused while REAPER is recording, and nothing changes', function()
  local s, chapter, other = new_session()
  other.armed = true
  s.fake.play_state = 5
  s:send('arm_lane', 'a1', chapter.guid)
  H.eq(s:events(), { { 'ERROR', 'a1', 'REAPER is recording. Stop recording first.' } })
  H.eq(arms(s), { 0, 1, 0 })
end)

H.test('arm_lane reports a track that is gone and arms nothing in its place', function()
  local s, _, other = new_session()
  other.armed = true
  s:send('arm_lane', 'a1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}')
  H.eq(s:events(), { { 'TRACK_STALE', 'a1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
  H.eq(arms(s), { 0, 1, 0 })
end)

H.test('arm_lane needs the track APIs', function()
  local s, chapter = new_session()
  s.fake:remove_api('SetMediaTrackInfo_Value')
  s:send('arm_lane', 'a1', chapter.guid)
  H.eq(s:events(), { { 'ERROR', 'a1', 'This REAPER version cannot arm tracks.' } })
end)

H.test('arm_lane keeps the lane armed after a take: a stop puts back nothing the Booth chose', function()
  local s, chapter, other = new_session()
  other.armed = true
  s:send('arm_lane', 'a1', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  H.eq(arms(s), { 1, 0, 0 })
end)

H.test('arm_lane forgets the arms an earlier arm_only remembered', function()
  local s, chapter, other, pickups = new_session()
  pickups.armed = true
  s:send('arm_only', 'a1', other.guid)
  s:send('arm_lane', 'a2', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  H.eq(arms(s), { 1, 0, 0 })
end)

-- record_start ---------------------------------------------------------------------------------------------------

H.test('record_start records when the one armed track is the named one, and says where', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.cursor = 42.5
  s:send('record_start', 'r1', chapter.guid)
  H.eq(s:events(), { { 'RECORD_STARTED', 'r1', chapter.guid, '42.500000' } })
  H.eq(calls_named(s, 'CSurf_OnRecord'), 1)
  H.eq(s.fake.play_state, 5)
end)

H.test('record_start without the start rule records from the cursor', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake:add_item(chapter, { position = 10, length = 30 })
  s.fake.cursor = 5
  s:send('record_start', 'r1', chapter.guid)
  H.eq(s:events(), { { 'RECORD_STARTED', 'r1', chapter.guid, '5.000000' } })
  H.eq(s.fake.cursor, 5)
end)

H.test('record_start with end moves the cursor to the end of the last item and records there', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake:add_item(chapter, { position = 10, length = 30 })
  s.fake:add_item(chapter, { position = 80, length = 15 })
  s.fake.cursor = 5
  s:send('record_start', 'r1', chapter.guid, 'end')
  H.eq(s:events(), { { 'RECORD_STARTED', 'r1', chapter.guid, '95.000000' } })
  H.eq(s.fake.cursor, 95)
  H.eq(calls_named(s, 'CSurf_OnRecord'), 1)
end)

H.test('record_start with end reads only the named track and uses item end, not start', function()
  local s, chapter, other = new_session()
  chapter.armed = true
  s.fake:add_item(chapter, { position = 10, length = 30 })
  s.fake:add_item(other, { position = 200, length = 50 })
  s:send('record_start', 'r1', chapter.guid, 'end')
  H.eq(s:events(), { { 'RECORD_STARTED', 'r1', chapter.guid, '40.000000' } })
end)

H.test('record_start with end on an empty track starts at the project start', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.cursor = 12
  s:send('record_start', 'r1', chapter.guid, 'end')
  H.eq(s:events(), { { 'RECORD_STARTED', 'r1', chapter.guid, '0.000000' } })
  H.eq(s.fake.cursor, 0)
end)

-- chapter_end: a chapter linked to a folder of voices continues after the latest item of the WHOLE folder (#3025).
local function voices_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local folder = s.fake:add_track('Chapter 1')
  local narrator = s.fake:add_track('Narrator')
  local hero = s.fake:add_track('Hero')
  local after = s.fake:add_track('Chapter 2')
  folder.folder_depth = 1
  hero.folder_depth = -1
  return s, folder, narrator, hero, after
end

H.test('record_start with chapter_end continues after the latest item on any voice of the folder', function()
  local s, folder, narrator, hero = voices_session()
  narrator.armed = true
  s.fake:add_item(narrator, { position = 10, length = 30 })
  s.fake:add_item(hero, { position = 50, length = 20 })
  s:send('record_start', 'r1', narrator.guid, 'chapter_end', folder.guid)
  H.eq(s:events(), { { 'RECORD_STARTED', 'r1', narrator.guid, '70.000000' } })
  H.eq(s.fake.cursor, 70)
end)

H.test('record_start with chapter_end ignores tracks outside the folder and counts muted tracks', function()
  local s, folder, narrator, hero, after = voices_session()
  narrator.armed = true
  s.fake:add_item(after, { position = 500, length = 5 })
  s.fake:add_item(hero, { position = 20, length = 10 })
  hero.muted = true
  s:send('record_start', 'r1', narrator.guid, 'chapter_end', folder.guid)
  H.eq(s:events(), { { 'RECORD_STARTED', 'r1', narrator.guid, '30.000000' } })
end)

H.test('record_start with chapter_end on an empty folder starts at the project start', function()
  local s, folder, narrator = voices_session()
  narrator.armed = true
  s.fake.cursor = 12
  s:send('record_start', 'r1', narrator.guid, 'chapter_end', folder.guid)
  H.eq(s:events(), { { 'RECORD_STARTED', 'r1', narrator.guid, '0.000000' } })
end)

H.test('record_start with chapter_end refuses a target that is not inside the folder and moves nothing', function()
  local s, folder, _, _, after = voices_session()
  after.armed = true
  s.fake.cursor = 12
  s:send('record_start', 'r1', after.guid, 'chapter_end', folder.guid)
  H.eq(s:events()[1][1], 'ERROR')
  H.eq(s.fake.cursor, 12)
  H.eq(calls_named(s, 'CSurf_OnRecord'), 0)
end)

H.test('record_start with chapter_end refuses a folder that is not there', function()
  local s, _, narrator = voices_session()
  narrator.armed = true
  s:send('record_start', 'r1', narrator.guid, 'chapter_end', '{FFFFFFFF-0000-4000-8000-00000000FFFF}')
  H.eq(s:events()[1][1], 'TRACK_STALE')
end)

H.test('a refused record_start with end leaves the cursor where it was', function()
  local cases = {
    {
      name = 'playing',
      setup = function(s, chapter)
        chapter.armed = true
        s.fake.play_state = 1
      end,
    },
    {
      name = 'recording',
      setup = function(s, chapter)
        chapter.armed = true
        s.fake.play_state = 5
      end,
    },
    { name = 'none armed', setup = function() end },
    {
      name = 'another armed',
      setup = function(s)
        s.fake.tracks[2].armed = true
      end,
    },
    {
      name = 'several armed',
      setup = function(s, chapter)
        chapter.armed = true
        s.fake.tracks[2].armed = true
      end,
    },
  }
  for _, case in ipairs(cases) do
    local s, chapter = new_session()
    s.fake:add_item(chapter, { position = 10, length = 30 })
    case.setup(s, chapter)
    s.fake.cursor = 7
    s:send('record_start', 'r1', chapter.guid, 'end')
    H.eq(s.fake.cursor, 7, case.name)
    H.eq(calls_named(s, 'CSurf_OnRecord'), 0, case.name)
  end
end)

H.test('the cursor move of record_start end adds no undo point and scrolls the view', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake:add_item(chapter, { position = 10, length = 30 })
  s:send('record_start', 'r1', chapter.guid, 'end')
  H.eq(#s.fake.undo, 0)
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(s.fake.cursor_moveview, true)
  H.eq(s.fake.cursor_seekplay, false)
end)

H.test('an unknown start rule is an error and changes nothing', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake:add_item(chapter, { position = 10, length = 30 })
  s.fake.cursor = 3
  s:send('record_start', 'r1', chapter.guid, 'start')
  H.eq(s:events(), { { 'ERROR', 'r1', 'Unknown start rule: start.' } })
  H.eq(s.fake.cursor, 3)
  H.eq(calls_named(s, 'CSurf_OnRecord'), 0)
end)

H.test('record_start refuses unless exactly the named track is armed', function()
  local cases = {
    { armed = {}, message = 'No track is armed.' },
    { armed = { 1, 2 }, message = 'More than one track is armed.' },
    { armed = { 2 }, message = 'Another track is armed.' },
  }
  for _, case in ipairs(cases) do
    local s = new_session()
    for _, index in ipairs(case.armed) do
      s.fake.tracks[index].armed = true
    end
    s:send('record_start', 'r1', s.fake.tracks[1].guid)
    H.eq(s:events(), { { 'ERROR', 'r1', case.message } }, case.message)
    H.eq(calls_named(s, 'CSurf_OnRecord'), 0, case.message)
  end
end)

H.test('record_start refuses while REAPER plays, is paused or records', function()
  for _, state in ipairs({ { 1, 'REAPER is playing. Stop it first.' }, { 2, 'REAPER is playing. Stop it first.' }, { 5, 'REAPER is already recording.' } }) do
    local s, chapter = new_session()
    chapter.armed = true
    s.fake.play_state = state[1]
    s:send('record_start', 'r1', chapter.guid)
    H.eq(s:events(), { { 'ERROR', 'r1', state[2] } })
    H.eq(calls_named(s, 'CSurf_OnRecord'), 0)
  end
end)

H.test('record_start reports a track that is gone', function()
  local s, chapter = new_session()
  chapter.armed = true
  s:send('record_start', 'r1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}')
  H.eq(s:events(), { { 'TRACK_STALE', 'r1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
  H.eq(calls_named(s, 'CSurf_OnRecord'), 0)
end)

H.test('record_start waits a few defer cycles for REAPER to report recording, then answers', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.record_delay_ticks = 3
  s:send('record_start', 'r1', chapter.guid)
  H.eq(s:events(), {}, 'no answer before REAPER says it records')
  for _ = 1, 3 do
    s:tick()
  end
  H.eq(s:events(), { { 'RECORD_STARTED', 'r1', chapter.guid, '0.000000' } })
  H.eq(calls_named(s, 'CSurf_OnRecord'), 1)
end)

H.test('record_start says so when REAPER does not start recording, and claims no recording', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.record_fails = true
  s:send('record_start', 'r1', chapter.guid)
  for _ = 1, 40 do
    s:tick()
  end
  H.eq(s:events(), { { 'ERROR', 'r1', 'REAPER did not start recording.' } })
  H.eq(calls_named(s, 'CSurf_OnRecord'), 1, 'the toggle is pressed once and never again to "fix" it')
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'RECORD_NOT_OURS', 's1' } })
end)

H.test('record_start needs the record API', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake:remove_api('CSurf_OnRecord')
  s:send('record_start', 'r1', chapter.guid)
  H.eq(s:events(), { { 'ERROR', 'r1', 'This REAPER version cannot start recording.' } })
end)

-- record_stop ----------------------------------------------------------------------------------------------------

H.test('record_stop stops the recording the app started and puts back the arms the narrator had', function()
  local s, chapter, other, pickups = new_session()
  other.armed, pickups.armed = true, true
  s:send('arm_only', 'a1', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  s:events()
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'RECORD_STOPPED', 's1', '3', '0', '1' } })
  H.eq(s.fake.play_state, 0)
  H.eq(calls_named(s, 'OnStopButton'), 1)
  H.eq(arms(s), { 0, 1, 1 })
  s:tick()
  H.eq(s:events(), {}, 'the watch ends with the recording, so no second end is reported')
end)

H.test('record_stop never stops a recording the app did not start', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.play_state = 5
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'RECORD_NOT_OURS', 's1' } })
  H.eq(s.fake.play_state, 5)
  H.eq(calls_named(s, 'OnStopButton'), 0)
end)

H.test('record_stop without arm_only stops the recording and has no arms to put back', function()
  local s, chapter = new_session()
  chapter.armed = true
  s:send('record_start', 'r1', chapter.guid)
  s:events()
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'RECORD_STOPPED', 's1', '0', '0', '1' } })
  H.eq(arms(s), { 1, 0, 0 })
end)

H.test('a recording the narrator stops in REAPER ends the app one, puts the arms back, and is not stopped again', function()
  local s, chapter, other = new_session()
  other.armed = true
  s:send('arm_only', 'a1', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  s:events()
  s:tick()
  H.eq(s:events(), {}, 'still recording: nothing to report')
  s.fake.play_state = 0 -- the narrator pressed Stop in REAPER
  s:tick()
  H.eq(s:events(), { { 'RECORD_ENDED', 'r1', '2', '0', '0' } })
  H.eq(arms(s), { 0, 1, 0 })
  s.fake.play_state = 5 -- and then started a recording of their own
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'RECORD_NOT_OURS', 's1' } })
  H.eq(s.fake.play_state, 5)
end)

H.test('an arm the narrator changes during the take is theirs: it is kept, the rest is put back', function()
  local s, chapter, other, pickups = new_session()
  other.armed = true
  s:send('arm_only', 'a1', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  pickups.armed = true -- armed by hand during the take; it was not armed before
  s:events()
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'RECORD_STOPPED', 's1', '2', '1', '1' } })
  H.eq(arms(s), { 0, 1, 1 })
end)

H.test('a second arm_only keeps the arms the narrator had before the first one', function()
  local s, chapter, other, pickups = new_session()
  pickups.armed = true
  s:send('arm_only', 'a1', other.guid)
  s:send('arm_only', 'a2', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  H.eq(arms(s), { 0, 0, 1 })
end)

H.test('arms are put back once: a later recording without arm_only leaves them alone', function()
  local s, chapter, other = new_session()
  other.armed = true
  s:send('arm_only', 'a1', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  H.eq(arms(s), { 0, 1, 0 })
  other.armed = false
  chapter.armed = true
  s:send('record_start', 'r2', chapter.guid)
  s:send('record_stop', 's2')
  s:events()
  H.eq(arms(s), { 1, 0, 0 })
end)

H.test('a track deleted during the take is skipped when the arms are put back', function()
  local s, chapter, other, pickups = new_session()
  other.armed, pickups.armed = true, true
  s:send('arm_only', 'a1', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  table.remove(s.fake.tracks, 2)
  s:events()
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'RECORD_STOPPED', 's1', '2', '0', '1' } })
  H.eq(arms(s), { 0, 1 })
end)

H.test('record_stop while REAPER is still starting the app recording stops it and ends the start', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.record_delay_ticks = 5
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'ERROR', 'r1', 'Recording was stopped before REAPER started it.' }, { 'RECORD_STOPPED', 's1', '0', '0', '0' } })
  for _ = 1, 10 do
    s:tick()
  end
  H.eq(s.fake.play_state, 0, 'a late start is stopped, never left running')
  H.eq(s:events(), {})
end)

H.test('the transport commands make no undo point and never call Main_OnCommand', function()
  local s, chapter, other = new_session()
  other.armed = true
  s:send('arm_only', 'a1', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  H.eq(s.fake:undo_labels(), { 'Recorded media' }, "the one point is REAPER's own, for the recorded media")
  H.eq(calls_named(s, 'Main_OnCommand'), 0)
end)

-- The undo points a recording leaves ------------------------------------------------------------------------------

H.test('record_stop reports the undo points the recording left in REAPER', function()
  local s, chapter = new_session()
  s:send('arm_only', 'a1', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  s:events()
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'RECORD_STOPPED', 's1', '1', '0', '1' } })
end)

H.test('a recording the narrator stops in REAPER reports its undo points too', function()
  local s, chapter = new_session()
  s:send('arm_only', 'a1', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  s:events()
  s.fake:stop_recording() -- the narrator pressed Stop in REAPER
  s:tick()
  H.eq(s:events(), { { 'RECORD_ENDED', 'r1', '1', '0', '1' } })
end)

H.test('a recording stopped before REAPER started it left no undo point', function()
  local s, chapter = new_session()
  s.fake.record_delay_ticks = 3
  s:send('arm_only', 'a1', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  H.eq(s:events(), {
    { 'ARMED', 'a1', chapter.guid, '0', '1' },
    { 'ERROR', 'r1', 'Recording was stopped before REAPER started it.' },
    { 'RECORD_STOPPED', 's1', '1', '0', '0' },
  })
end)

H.test('the undo points count only what changed since the start: an earlier edit is not the recording', function()
  local s, chapter = new_session()
  s.fake.change_count = 40 -- edits the narrator made before
  s:send('arm_only', 'a1', chapter.guid)
  s:send('record_start', 'r1', chapter.guid)
  s:events()
  s:send('record_stop', 's1')
  H.eq(s:events()[1][5], '1')
end)

-- Where Stop leaves the edit cursor -----------------------------------------------------------------------------
-- REAPER's own Stop leaves the edit cursor where recording began, so the next look, play or take would start back
-- there. A recording the app started ends with the cursor at the end of what was just recorded (the end of the item
-- REAPER made from the recording start), in view and without seeking playback, whoever pressed Stop. Going back is a
-- choice the narrator makes (punch_to, set_cursor, roll), never a side effect of Stop. No REAPER preference is read or set.

H.test('record_stop leaves the edit cursor at the end of what was just recorded, in view, not seeking', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.cursor, s.fake.record_seconds = 2, 5
  s:send('record_start', 'r1', chapter.guid)
  s:events()
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'RECORD_STOPPED', 's1', '0', '0', '1' } })
  H.eq(s.fake.cursor, 7, 'the cursor is where recording stopped, not where it began')
  H.eq(s.fake.cursor_moveview, true)
  H.eq(s.fake.cursor_seekplay, false)
  H.eq(#s.fake.undo, 1, 'moving the cursor adds no undo point of its own')
end)

H.test('a recording the narrator stops in REAPER also leaves the edit cursor where it stopped', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.cursor, s.fake.record_seconds = 4, 3
  s:send('record_start', 'r1', chapter.guid)
  s:events()
  s.fake:stop_recording() -- the narrator pressed Stop in REAPER, which left the cursor at 4
  s:tick()
  H.eq(s:events(), { { 'RECORD_ENDED', 'r1', '0', '0', '1' } })
  H.eq(s.fake.cursor, 7)
end)

H.test('a recording over earlier audio stops with the cursor at the end of the new pass, not the earlier item', function()
  local s, chapter = new_session()
  s.fake:add_item(chapter, { position = 0, length = 20, source = 'earlier.wav' })
  chapter.armed = true
  s.fake.cursor, s.fake.record_seconds = 5, 3
  s:send('record_start', 'r1', chapter.guid)
  s:events()
  s:send('record_stop', 's1')
  s:events()
  H.eq(s.fake.cursor, 8)
end)

H.test('with no item at the recording start, Stop leaves the cursor at the last position REAPER recorded', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.cursor, s.fake.record_seconds = 0, 2
  s:send('record_start', 'r1', chapter.guid)
  s:events()
  -- Auto-punch: REAPER records only the time selection, so the item does not begin at the cursor.
  s.fake.recording_from.position = 3
  s.fake.play_position = 9.5
  s:tick()
  s:send('record_stop', 's1')
  s:events()
  H.eq(s.fake.cursor, 9.5)
end)

H.test('a start record_stop cancelled before REAPER recorded leaves the cursor where it was', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.cursor, s.fake.record_delay_ticks = 6, 3
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  s:events()
  H.eq(s.fake.cursor, 6)
end)

H.test('the next take starts where the last one stopped; going back is only the narrator choosing a place', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.record_seconds = 4
  s:send('record_start', 'r1', chapter.guid, 'end')
  H.eq(s:events(), { { 'RECORD_STARTED', 'r1', chapter.guid, '0.000000' } })
  s:send('record_stop', 's1')
  s:events()
  H.eq(s.fake.cursor, 4, 'take A stopped at its end')
  s:send('record_start', 'r2', chapter.guid)
  H.eq(s:events(), { { 'RECORD_STARTED', 'r2', chapter.guid, '4.000000' } }, 'take B starts where A stopped, with no start rule')
  s.fake.record_seconds = 3
  s:send('record_stop', 's2')
  s:events()
  H.eq(s.fake.cursor, 7, 'take B stopped at its end')
  s:send('punch_to', 'p1', '2.5', '0')
  H.eq(s:events()[1][1], 'PUNCHED')
  H.eq(s.fake.cursor, 2.5, 'the narrator chose to go back')
  s.fake.record_seconds = 1
  s:send('record_start', 'r3', chapter.guid)
  H.eq(s:events(), { { 'RECORD_STARTED', 'r3', chapter.guid, '2.500000' } })
  s:send('record_stop', 's3')
  s:events()
  H.eq(s.fake.cursor, 3.5, 'the pickup stopped at its own end, not back at the punch')
end)

H.test('the end rule starts at the stop position when the cursor is still where the last take stopped, even with later audio', function()
  local s, chapter = new_session()
  s.fake:add_item(chapter, { position = 0, length = 20, source = 'earlier.wav' })
  chapter.armed = true
  s.fake.cursor, s.fake.record_seconds = 5, 3
  s:send('record_start', 'r1', chapter.guid) -- a pickup at 5 s
  s:send('record_stop', 's1')
  s:events()
  H.eq(s.fake.cursor, 8)
  s:send('record_start', 'r2', chapter.guid, 'end')
  H.eq(s:events(), { { 'RECORD_STARTED', 'r2', chapter.guid, '8.000000' } }, 'where the narrator stopped, not the end of the 20 s item')
end)

H.test('the end rule starts at the end of the track when the cursor is no longer where the last take stopped', function()
  local s, chapter = new_session()
  s.fake:add_item(chapter, { position = 0, length = 20, source = 'earlier.wav' })
  chapter.armed = true
  s.fake.cursor, s.fake.record_seconds = 5, 3
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  s:events()
  s.fake.cursor = 12 -- moved in REAPER to listen back
  s:send('record_start', 'r2', chapter.guid, 'end')
  H.eq(s:events(), { { 'RECORD_STARTED', 'r2', chapter.guid, '20.000000' } }, 'an unknown place never records over later audio')
end)

H.test('chapter_end goes on from where the chapter last stopped, on any voice of the folder', function()
  local s, folder, narrator, hero = voices_session()
  s.fake:add_item(narrator, { position = 0, length = 60, source = 'earlier.wav' })
  hero.armed = true
  s.fake.cursor, s.fake.record_seconds = 5, 3
  s:send('record_start', 'r1', hero.guid)
  s:send('record_stop', 's1')
  s:events()
  narrator.armed, hero.armed = true, false
  s:send('record_start', 'r2', narrator.guid, 'chapter_end', folder.guid)
  H.eq(s:events(), { { 'RECORD_STARTED', 'r2', narrator.guid, '8.000000' } }, 'where the hero stopped, as the narrator picks up')
end)

H.test('chapter_end ignores a stop outside the folder and goes to the end of the whole folder', function()
  local s, folder, narrator, hero, after = voices_session()
  s.fake:add_item(hero, { position = 0, length = 40, source = 'earlier.wav' })
  after.armed = true
  s.fake.cursor, s.fake.record_seconds = 5, 3
  s:send('record_start', 'r1', after.guid)
  s:send('record_stop', 's1')
  s:events()
  after.armed, narrator.armed = false, true
  s:send('record_start', 'r2', narrator.guid, 'chapter_end', folder.guid)
  H.eq(s:events(), { { 'RECORD_STARTED', 'r2', narrator.guid, '40.000000' } })
end)

H.test('the end rule ignores a stop on another track', function()
  local s, chapter, other = new_session()
  s.fake:add_item(chapter, { position = 0, length = 20, source = 'earlier.wav' })
  other.armed = true
  s.fake.cursor, s.fake.record_seconds = 5, 3
  s:send('record_start', 'r1', other.guid)
  s:send('record_stop', 's1')
  other.armed, chapter.armed = false, true
  s:events()
  s:send('record_start', 'r2', chapter.guid, 'end')
  H.eq(s:events(), { { 'RECORD_STARTED', 'r2', chapter.guid, '20.000000' } })
end)

H.test('a seek REAPER makes back to the recording start after the stop is undone; a move of the narrator is kept', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.cursor, s.fake.record_seconds = 2, 5
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  s:events()
  H.eq(s.fake.cursor, 7)
  s.fake.cursor = 2 -- REAPER seeks back to where recording began, a moment after the stop
  s:tick()
  H.eq(s.fake.cursor, 7, 'put back at the stop position')
  s.fake.cursor = 3.3 -- the narrator clicks somewhere
  s:tick()
  H.eq(s.fake.cursor, 3.3, 'a place the narrator chose is never overridden')
  s.fake.cursor = 2
  s:tick()
  H.eq(s.fake.cursor, 2, 'the guard ends once the narrator has moved the cursor')
end)

H.test('the guard after a stop lasts about half a second and then leaves the cursor alone', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.cursor, s.fake.record_seconds = 2, 5
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  s:events()
  for _ = 1, 20 do
    s:tick()
  end
  s.fake.cursor = 2
  s:tick()
  H.eq(s.fake.cursor, 2)
end)

-- The stop guard and the app's own cursor moves (docs/research/2026-10-30-booth-sub-track-recording.md, section 6b) -----

H.test('set_cursor sent at once after a stop ends the guard, so a re-take from the same place holds', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.cursor, s.fake.record_seconds = 2, 5
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  s:send('set_cursor', 'c1', '2')
  s:events()
  for _ = 1, 3 do
    s:tick()
  end
  H.eq(s.fake.cursor, 2, 'the app asked for the take start; the guard is for REAPER seeking there, not the app')
end)

H.test('punch_to sent at once after a stop ends the guard too', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake.cursor, s.fake.record_seconds = 2, 5
  s:send('record_start', 'r1', chapter.guid)
  s:send('record_stop', 's1')
  s:send('punch_to', 'p1', '3', '1')
  s:events()
  for _ = 1, 3 do
    s:tick()
  end
  H.eq(s.fake.cursor, 2)
end)

H.test('go_to and play_from sent at once after a stop end the guard too', function()
  for _, send in ipairs({
    function(s, track)
      s:send('go_to', 'g1', track.guid, 'at', '2')
    end,
    function(s)
      s:send('play_from', 'p1', '2')
      s.fake.play_state = 0
    end,
  }) do
    local s, chapter = new_session()
    chapter.armed = true
    s.fake.cursor, s.fake.record_seconds = 2, 5
    s:send('record_start', 'r1', chapter.guid)
    s:send('record_stop', 's1')
    send(s, chapter)
    s:events()
    for _ = 1, 3 do
      s:tick()
    end
    H.eq(s.fake.cursor, 2)
  end
end)

-- switch_voice --------------------------------------------------------------------------------------------------

-- A chapter folder of voices: Narrator and Queen, with the narrator's own arms on Pickups before the app armed anything.
local function voice_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local narrator = s.fake:add_track('Narrator')
  local queen = s.fake:add_track('Queen')
  local pickups = s.fake:add_track('Pickups')
  pickups.armed = true
  s:send('arm_only', 'a1', narrator.guid)
  s.fake.cursor, s.fake.record_seconds = 2, 3
  s:send('record_start', 'r1', narrator.guid)
  s:events()
  return s, narrator, queen, pickups
end

H.test('switch_voice during a take arms the new voice and disarms the old one, and REAPER keeps recording', function()
  local s, narrator, queen = voice_session()
  s.fake.play_position = 3.6
  s:send('switch_voice', 'v1', queen.guid)
  H.eq(s:events(), { { 'VOICE_SWITCHED', 'v1', queen.guid, '3.600000' } })
  H.eq({ narrator.armed, queen.armed }, { false, true })
  H.eq(s.fake.play_state, 5)
  H.eq(#s.fake.undo, 0, 'an arm is not in the undo history; the take stays one point')
end)

H.test('a take with a switch stops as one undo point, one item per voice, the cursor at the end of the last voice', function()
  local s, narrator, queen, pickups = voice_session()
  s.fake.play_position = 3.6
  s:send('switch_voice', 'v1', queen.guid)
  s.fake.play_position = 4.9
  s:tick()
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'VOICE_SWITCHED', 'v1', queen.guid, '3.600000' }, { 'RECORD_STOPPED', 's1', '2', '0', '1' } })
  local spans = {}
  for _, item in ipairs(s.fake.items) do
    spans[#spans + 1] = { item.track.name, item.position, item.position + item.length }
  end
  H.eq(spans, { { 'Narrator', 2, 3.6 }, { 'Queen', 3.664, 5 } })
  H.eq(s.fake.cursor, 5, 'where the last voice stopped')
  H.eq({ narrator.armed, queen.armed, pickups.armed }, { false, false, true }, "the narrator's own arms are back")
end)

H.test('after a switch, the end rule goes on from where the last voice stopped, on that voice', function()
  local s, _, queen, pickups = voice_session()
  s.fake.play_position = 3.6
  s:send('switch_voice', 'v1', queen.guid)
  s:send('record_stop', 's1')
  s:events()
  queen.armed, pickups.armed = true, false
  s:send('record_start', 'r2', queen.guid, 'end')
  H.eq(s:events(), { { 'RECORD_STARTED', 'r2', queen.guid, '5.000000' } })
end)

H.test('a take with a switch the narrator stops in REAPER ends the same way', function()
  local s, narrator, queen, pickups = voice_session()
  s.fake.play_position = 3.6
  s:send('switch_voice', 'v1', queen.guid)
  s:events()
  s.fake:stop_recording()
  s:tick()
  H.eq(s:events(), { { 'RECORD_ENDED', 'r1', '2', '0', '1' } }, 'Queen back off, Pickups back on')
  H.eq({ narrator.armed, queen.armed, pickups.armed }, { false, false, true })
end)

H.test('switch_voice back to the voice already armed changes nothing and says so', function()
  local s, narrator = voice_session()
  s.fake.play_position = 3
  s:send('switch_voice', 'v1', narrator.guid)
  local before = calls_named(s, 'SetMediaTrackInfo_Value')
  s:send('switch_voice', 'v2', narrator.guid)
  H.eq(s:events(), { { 'VOICE_SWITCHED', 'v1', narrator.guid, '3.000000' }, { 'VOICE_SWITCHED', 'v2', narrator.guid, '3.000000' } })
  H.eq(calls_named(s, 'SetMediaTrackInfo_Value'), before, 'no arm written')
  H.eq(narrator.armed, true)
end)

H.test('two switches in one take make three items, each voice where it was armed', function()
  local s, narrator, queen, pickups = voice_session()
  s.fake.play_position = 2.5
  s:send('switch_voice', 'v1', queen.guid)
  s.fake.play_position = 3.5
  s:send('switch_voice', 'v2', narrator.guid)
  s:send('record_stop', 's1')
  s:events()
  local spans = {}
  for _, item in ipairs(s.fake.items) do
    spans[#spans + 1] = { item.track.name, item.position, item.position + item.length }
  end
  H.eq(spans, { { 'Narrator', 2, 2.5 }, { 'Queen', 2.564, 3.5 }, { 'Narrator', 3.564, 5 } })
  H.eq(s.fake.cursor, 5)
  H.eq({ narrator.armed, queen.armed, pickups.armed }, { false, false, true }, "the narrator's own arms are back")
end)

H.test('switch_voice after the narrator stopped REAPER, before the watch noticed, changes nothing', function()
  local registry
  local s = H.session({
    project_path = H.join(host.tmpdir(), 'Book.rpp'),
    setup = function(r)
      registry = r
    end,
  })
  local narrator, queen = s.fake:add_track('Narrator'), s.fake:add_track('Queen')
  s:send('arm_only', 'a1', narrator.guid)
  s:send('record_start', 'r1', narrator.guid)
  s:events()
  s.fake:stop_recording()
  -- The command runs in the same defer cycle as the stop, before the watch's tick sees it.
  registry.lookup('switch_voice')({ session_dir = s.dir }, { 'v1', queen.guid })
  H.eq(s:events(), { { 'RECORD_NOT_OURS', 'v1' } })
  H.eq({ narrator.armed, queen.armed }, { true, false })
end)

H.test('a switch in a take started without arm_only remembers the arms then, and puts them back at the stop', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local narrator, queen, pickups = s.fake:add_track('Narrator'), s.fake:add_track('Queen'), s.fake:add_track('Pickups')
  narrator.armed = true
  s.fake.cursor, s.fake.record_seconds = 2, 3
  s:send('record_start', 'r1', narrator.guid)
  s.fake.play_position = 3
  s:send('switch_voice', 'v1', queen.guid)
  s:send('record_stop', 's1')
  H.eq(s:events()[3], { 'RECORD_STOPPED', 's1', '2', '0', '1' })
  H.eq({ narrator.armed, queen.armed, pickups.armed }, { true, false, false }, 'as before the take')
end)

H.test('a voice track added after arm_only is put back to unarmed at the stop', function()
  local s, narrator, queen, pickups = voice_session()
  local crowd = s.fake:add_track('Crowd')
  s.fake.play_position = 3
  s:send('switch_voice', 'v1', crowd.guid)
  s:send('record_stop', 's1')
  s:events()
  H.eq({ narrator.armed, queen.armed, pickups.armed, crowd.armed }, { false, false, true, false })
end)

H.test('switch_voice is refused with no recording this bridge started, and nothing changes', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local narrator, queen = s.fake:add_track('Narrator'), s.fake:add_track('Queen')
  narrator.armed = true
  s.fake.play_state = 5 -- the narrator recording in REAPER on their own
  s:send('switch_voice', 'v1', queen.guid)
  H.eq(s:events(), { { 'RECORD_NOT_OURS', 'v1' } })
  H.eq({ narrator.armed, queen.armed }, { true, false })
end)

H.test('switch_voice is refused while REAPER has not started the recording yet', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local narrator, queen = s.fake:add_track('Narrator'), s.fake:add_track('Queen')
  narrator.armed = true
  s.fake.record_delay_ticks = 3
  s:send('record_start', 'r1', narrator.guid)
  s:send('switch_voice', 'v1', queen.guid)
  H.eq(s:events(), { { 'ERROR', 'v1', 'REAPER has not started recording yet.' } })
  H.eq({ narrator.armed, queen.armed }, { true, false })
end)

H.test('switch_voice to a track that is gone answers TRACK_STALE and keeps recording the voice it was', function()
  local s, narrator = voice_session()
  s:send('switch_voice', 'v1', '{00000000-0000-0000-0000-000000000000}')
  H.eq(s:events(), { { 'TRACK_STALE', 'v1', '{00000000-0000-0000-0000-000000000000}' } })
  H.eq(narrator.armed, true)
end)

H.test('after a switch, audio already on the new voice later in the project does not move where the take stopped', function()
  local s, _, queen = voice_session()
  s.fake:add_item(queen, { position = 10, length = 2, source = 'later.wav' })
  s.fake.play_position = 3.6
  s:send('switch_voice', 'v1', queen.guid)
  s:send('record_stop', 's1')
  s:events()
  H.eq(s.fake.cursor, 5, 'the end of the item the switch began, not of the later one')
end)
