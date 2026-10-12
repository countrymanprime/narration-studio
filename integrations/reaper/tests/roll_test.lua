-- roll (narration_roll.lua, ADR 0860 point 1): while a recording this bridge started runs on the named track, stop it,
-- move the edit cursor to `at` and record again from there, so the new pass overlaps the earlier one and REAPER keeps
-- the earlier audio as a take. It refuses unless REAPER's overlapping-recording option keeps the earlier audio, and it
-- never changes a preference, a project setting or a track. It opens no undo block of its own.

local H = require('harness')

-- REAPER's autoxfade config variable: bits 4 and 8 hold "New recording that overlaps existing media items" (0 splits
-- existing items and creates new takes, 4 trims behind them (tape mode), 8 creates new items in separate lanes).
-- 1 is auto-crossfade on, which a roll ignores.
local TAKES, TAPE, LANES = 1, 1 + 4, 1 + 8

-- A session recording on the chapter track, started through record_start the way the host starts it.
local function recording_session(overlap)
  local registry
  local s = H.session({
    project_path = H.join(host.tmpdir(), 'Book.rpp'),
    setup = function(r)
      registry = r
    end,
  })
  s.registry = registry
  local chapter = s.fake:add_track('Chapter 1')
  local other = s.fake:add_track('Chapter 2')
  s.fake:add_item(chapter, { position = 0, length = 30, source = 'earlier.wav' })
  s.fake.config.autoxfade = tostring(overlap or TAKES)
  chapter.armed = true
  s.fake.cursor = 30
  s:send('record_start', 'r1', chapter.guid)
  H.eq(s:events(), { { 'RECORD_STARTED', 'r1', chapter.guid, '30.000000' } })
  s.fake.play_position = 75
  s.fake.calls = {}
  return s, chapter, other
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

-- Every call that changes a preference, a project setting, a track or an item: a roll makes none of them.
local function changing_calls(s)
  local out = {}
  for _, call in ipairs(s.fake.calls) do
    local setter = call.name == 'Main_OnCommand'
      or call.name == 'SetMediaTrackInfo_Value'
      or call.name == 'SetMediaItemInfo_Value'
      or call.name == 'SetMediaItemTakeInfo_Value'
      or call.name == 'SplitMediaItem'
      or call.name == 'SetActiveTake'
      or (call.name == 'GetSetProjectInfo' and call.set)
      or (call.name == 'GetSetProjectInfo_String' and call.set)
    if setter then
      out[#out + 1] = call.name
    end
  end
  return out
end

local function has(events, wanted)
  for _, event in ipairs(events) do
    if table.concat(event, '|') == table.concat(wanted, '|') then
      return true
    end
  end
  return false
end

local function items_of(track)
  local out = {}
  for _, item in ipairs(track.items) do
    out[#out + 1] = { item.guid, item.position, item.length }
  end
  return out
end

-- 1. roll-keeps-the-earlier-audio-as-a-take ----------------------------------------------------------------------

H.test('roll stops the recording, records again from at and answers ROLLED with no undo point of its own', function()
  local s, chapter = recording_session()
  local before = items_of(chapter)
  s:send('roll', 'o1', chapter.guid, '62.25')
  H.eq(s:events(), { { 'ROLLED', 'o1', chapter.guid, '62.250000', '0' } })
  H.eq(calls_named(s, 'OnStopButton'), 1)
  H.eq(calls_named(s, 'CSurf_OnRecord'), 1, 'record is pressed once, after REAPER was seen stopped')
  H.eq(s.fake.cursor, 62.25)
  H.eq(s.fake.cursor_moveview, true)
  H.eq(s.fake.cursor_seekplay, false)
  H.eq(s.fake.play_state, 5, 'REAPER records again')
  H.eq(#s.fake.undo, 0, 'the roll opens no undo block; the points for recorded media are REAPER own')
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(items_of(chapter), before, 'nothing on the track is removed or moved')
  H.eq(calls_named(s, 'DeleteTrackMediaItem'), 0)
  H.eq(changing_calls(s), {})
end)

H.test('the stop comes before the cursor move and the record press', function()
  local s, chapter = recording_session()
  local move = s.fake.reaper.SetEditCurPos
  s.fake.reaper.SetEditCurPos = function(...)
    s.fake.calls[#s.fake.calls + 1] = { name = 'SetEditCurPos' }
    return move(...)
  end
  s:send('roll', 'o1', chapter.guid, '40')
  local order = {}
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'OnStopButton' or call.name == 'CSurf_OnRecord' or call.name == 'SetEditCurPos' then
      order[#order + 1] = call.name
    end
  end
  H.eq(order, { 'OnStopButton', 'SetEditCurPos', 'CSurf_OnRecord' })
end)

H.test('after a roll the recording is still the one the app started: record_stop stops it and puts the arms back', function()
  local s, chapter, other = recording_session()
  s:send('roll', 'o1', chapter.guid, '40')
  s:events()
  s:tick()
  H.eq(s:events(), {}, 'the transport watch does not take the restart for the narrator stopping')
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'RECORD_STOPPED', 's1', '0', '0' } })
  H.eq(other.armed, false)
end)

-- The events of one defer cycle, in a fixed order: the roll's watch and the transport's run in the same cycle, and
-- which one REAPER runs first is not the bridge's to choose.
local function sorted(events)
  local out = {}
  for _, event in ipairs(events) do
    out[#out + 1] = table.concat(event, '|')
  end
  table.sort(out)
  return out
end

H.test('when REAPER reports the new recording a few cycles later, roll waits for it and answers then', function()
  local s, chapter = recording_session()
  s.fake.record_delay_ticks = 3
  s:send('roll', 'o1', chapter.guid, '40')
  H.eq(s:events(), {}, 'no answer before REAPER says it records again')
  for _ = 1, 3 do
    s:tick()
  end
  H.eq(sorted(s:events()), {
    'RECORD_STARTED|r1|' .. chapter.guid .. '|40.000000',
    'ROLLED|o1|' .. chapter.guid .. '|40.000000|0',
  }, 'the transport announces the restart on its own run, and the roll answers')
  H.eq(calls_named(s, 'CSurf_OnRecord'), 1)
  for _ = 1, 3 do
    s:tick()
  end
  H.eq(s:events(), {}, 'nothing more: no RECORD_ENDED, no second answer')
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'RECORD_STOPPED', 's1', '0', '0' } }, 'the restarted recording is still ours')
end)

H.test('when REAPER does not record again, roll says so and the earlier audio stays', function()
  local s, chapter = recording_session()
  local before = items_of(chapter)
  s.fake.record_fails = true
  s:send('roll', 'o1', chapter.guid, '40')
  for _ = 1, 40 do
    s:tick()
  end
  H.eq(sorted(s:events()), {
    'ERROR|o1|REAPER did not start recording again after the roll. The earlier audio is kept.',
    'ERROR|r1|REAPER did not start recording.',
  })
  H.eq(calls_named(s, 'CSurf_OnRecord'), 1, 'the toggle is pressed once and never again to "fix" it')
  H.eq(items_of(chapter), before)
  s:send('record_stop', 's1')
  H.eq(s:events(), { { 'RECORD_NOT_OURS', 's1' } }, 'the recording has ended, as after a record_start that never began')
end)

H.test('a record_stop while the roll waits ends the roll with its own answer, never ROLLED', function()
  local s, chapter = recording_session()
  s.fake.record_delay_ticks = 3
  s:send('roll', 'o1', chapter.guid, '40')
  s:send('record_stop', 's1')
  for _ = 1, 40 do
    s:tick()
  end
  H.eq(sorted(s:events()), {
    'ERROR|o1|The recording was stopped before REAPER recorded again after the roll. The earlier audio is kept.',
    'ERROR|r1|Recording was stopped before REAPER started it.',
    'RECORD_STOPPED|s1|0|0',
  })
  H.eq(s.fake.play_state, 0, 'a start that comes late is stopped, as after record_stop on a pending record_start')
end)

H.test('a record_start that takes over while the roll waits ends the roll with an error, never ROLLED', function()
  local s, chapter = recording_session()
  s.fake.record_delay_ticks = 2
  s:send('roll', 'o1', chapter.guid, '40')
  s:send('record_start', 'r2', chapter.guid)
  for _ = 1, 5 do
    s:tick()
  end
  local events = s:events()
  H.truthy(has(events, { 'ERROR', 'o1', 'REAPER did not start recording again after the roll. The earlier audio is kept.' }), 'roll error')
  for _, event in ipairs(events) do
    H.truthy(event[1] ~= 'ROLLED', 'no ROLLED for a recording that is no longer the one rolled')
  end
end)

H.test('a second roll while REAPER has not reported the first one yet is refused, and presses nothing', function()
  local s, chapter = recording_session()
  s.fake.record_delay_ticks = 5
  s:send('roll', 'o1', chapter.guid, '40')
  s.fake.calls = {}
  s:send('roll', 'o2', chapter.guid, '30')
  H.eq(s:events(), { { 'ERROR', 'o2', 'REAPER has not reported the recording yet. Roll again in a moment.' } })
  H.eq(calls_named(s, 'OnStopButton'), 0)
  H.eq(calls_named(s, 'CSurf_OnRecord'), 0)
end)

H.test('when REAPER is still recording after Stop, roll does not press record and says so', function()
  local s, chapter = recording_session()
  local stop = s.fake.reaper.OnStopButton
  s.fake.reaper.OnStopButton = function()
    s.fake.calls[#s.fake.calls + 1] = { name = 'OnStopButton' }
  end
  s:send('roll', 'o1', chapter.guid, '40')
  H.eq(s:events(), {
    { 'ERROR', 'o1', 'REAPER did not stop recording at once, so the roll did not record again. The earlier audio is kept.' },
  })
  H.eq(calls_named(s, 'CSurf_OnRecord'), 0, 'record is a toggle: pressing it while recording would stop, not restart')
  s.fake.reaper.OnStopButton = stop
end)

H.test('roll finds the track by its GUID in any case, with or without braces', function()
  local s, chapter = recording_session()
  s:send('roll', 'o1', chapter.guid:lower():gsub('[{}]', ''), '40')
  H.eq(s:events(), { { 'ROLLED', 'o1', chapter.guid, '40.000000', '0' } })
end)

H.test('after a roll the transport records where the new pass began', function()
  local s, chapter = recording_session()
  s:send('roll', 'o1', chapter.guid, '40')
  s:events()
  H.eq(s.registry.transport_recording().position, 40)
end)

-- 2. roll-refuses-with-a-reason-instead-of-changing-preferences --------------------------------------------------

H.test('roll refuses in tape mode, names the setting and changes no preference', function()
  local s, chapter = recording_session(TAPE)
  s:send('roll', 'o1', chapter.guid, '40')
  H.eq(s:events(), {
    {
      'ERROR',
      'o1',
      'Roll keeps the earlier audio as a take only when REAPER\'s option "New recording that overlaps existing media items" '
        .. 'is set to "Splits existing items and creates new takes". It is set to "Trims existing items behind new recording '
        .. '(tape mode)". Change it in REAPER\'s Options menu; this app never changes it.',
    },
  })
  H.eq(calls_named(s, 'OnStopButton'), 0, 'the recording goes on')
  H.eq(calls_named(s, 'CSurf_OnRecord'), 0)
  H.eq(changing_calls(s), {})
  H.eq(s.fake.config.autoxfade, tostring(TAPE), 'the setting is read, never written')
  H.eq(s.fake.play_state, 5)
end)

H.test('roll refuses when new recordings go to separate lanes, and names that setting', function()
  local s, chapter = recording_session(LANES)
  s:send('roll', 'o1', chapter.guid, '40')
  H.eq(s:events(), {
    {
      'ERROR',
      'o1',
      'Roll keeps the earlier audio as a take only when REAPER\'s option "New recording that overlaps existing media items" '
        .. 'is set to "Splits existing items and creates new takes". It is set to "Creates new media items in separate '
        .. 'lanes". Change it in REAPER\'s Options menu; this app never changes it.',
    },
  })
  H.eq(calls_named(s, 'OnStopButton'), 0)
  H.eq(changing_calls(s), {})
end)

H.test('roll refuses a value with both overlap bits set, and ignores the other autoxfade bits', function()
  local s, chapter = recording_session(1 + 4 + 8)
  s:send('roll', 'o1', chapter.guid, '40')
  local events = s:events()
  H.contains(events[1][3], 'It is set to "an unknown value".')
  H.eq(calls_named(s, 'OnStopButton'), 0)
  local s2, chapter2 = recording_session(1 + 2 + 16 + 32)
  s2:send('roll', 'o1', chapter2.guid, '40')
  H.eq(s2:events(), { { 'ROLLED', 'o1', chapter2.guid, '40.000000', '0' } })
end)

H.test('roll refuses when REAPER does not report the setting, rather than guess it', function()
  local cases = {
    {
      name = 'missing',
      setup = function(s)
        s.fake.config.autoxfade = nil
      end,
    },
    {
      name = 'not a number',
      setup = function(s)
        s.fake.config.autoxfade = 'on'
      end,
    },
  }
  for _, case in ipairs(cases) do
    local s, chapter = recording_session()
    case.setup(s)
    s:send('roll', 'o1', chapter.guid, '40')
    H.eq(s:events(), {
      {
        'ERROR',
        'o1',
        'REAPER did not report its "New recording that overlaps existing media items" setting, so the roll did not stop ' .. 'recording.',
      },
    }, case.name)
    H.eq(calls_named(s, 'OnStopButton'), 0, case.name)
  end
end)

H.test('roll refuses on a fixed-lane track, where the new pass would be a lane and not a take', function()
  local s, chapter = recording_session()
  s.fake:set_fixed_lanes(chapter, 2)
  s:send('roll', 'o1', chapter.guid, '40')
  H.eq(s:events(), {
    {
      'ERROR',
      'o1',
      'This track uses fixed item lanes, so a roll would record a new lane rather than a take. Roll is not available on ' .. 'it.',
    },
  })
  H.eq(calls_named(s, 'OnStopButton'), 0)
  H.eq(changing_calls(s), {})
end)

-- 3. roll-needs-a-recording-of-ours ------------------------------------------------------------------------------

H.test('roll answers RECORD_NOT_OURS when REAPER is not recording', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local chapter = s.fake:add_track('Chapter 1')
  s.fake.config.autoxfade = tostring(TAKES)
  s:send('roll', 'o1', chapter.guid, '4')
  H.eq(s:events(), { { 'RECORD_NOT_OURS', 'o1' } })
  H.eq(calls_named(s, 'OnStopButton'), 0)
  H.eq(calls_named(s, 'CSurf_OnRecord'), 0)
end)

H.test('roll answers RECORD_NOT_OURS for a recording the narrator started in REAPER', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local chapter = s.fake:add_track('Chapter 1')
  s.fake.config.autoxfade = tostring(TAKES)
  chapter.armed = true
  s.fake.play_state = 5
  s.fake.play_position = 20
  s:send('roll', 'o1', chapter.guid, '4')
  H.eq(s:events(), { { 'RECORD_NOT_OURS', 'o1' } })
  H.eq(calls_named(s, 'OnStopButton'), 0, 'a recording the app did not start is never stopped')
  H.eq(s.fake.play_state, 5)
end)

H.test('roll answers RECORD_NOT_OURS for another track than the one the app records on', function()
  local s, _, other = recording_session()
  s:send('roll', 'o1', other.guid, '40')
  H.eq(s:events(), { { 'RECORD_NOT_OURS', 'o1' } })
  H.eq(calls_named(s, 'OnStopButton'), 0)
end)

H.test('roll answers RECORD_NOT_OURS once the narrator has stopped the recording in REAPER', function()
  local s, chapter = recording_session()
  s.fake.play_state = 0
  s:send('roll', 'o1', chapter.guid, '40')
  H.truthy(has(s:events(), { 'RECORD_NOT_OURS', 'o1' }), 'RECORD_NOT_OURS')
  H.eq(calls_named(s, 'CSurf_OnRecord'), 0)
end)

H.test('roll reports a track that is gone and changes nothing', function()
  local s = recording_session()
  s:send('roll', 'o1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}', '40')
  H.eq(s:events(), { { 'TRACK_STALE', 'o1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
  H.eq(calls_named(s, 'OnStopButton'), 0)
  H.eq(s.fake.play_state, 5)
end)

-- 4. roll-at-is-validated ----------------------------------------------------------------------------------------

H.test('roll refuses an at that is not a usable number of seconds, before any REAPER call', function()
  for _, at in ipairs({ '', 'soon', 'nan', 'inf', '-inf', '-0.5', '1e999' }) do
    local s, chapter = recording_session()
    local reads = {}
    for _, name in ipairs({ 'CountTracks', 'GetProjectLength', 'get_config_var_string', 'OnStopButton' }) do
      local real = s.fake.reaper[name]
      s.fake.reaper[name] = function(...)
        reads[#reads + 1] = name
        return real(...)
      end
    end
    s:send('roll', 'o1', chapter.guid, at)
    H.eq(s:events(), { { 'ERROR', 'o1', 'The roll time is not a usable number of seconds.' } }, at)
    H.eq(s.fake.calls, {}, at)
    H.eq(reads, {}, at)
  end
end)

H.test('roll refuses an at past the end of the project and of the recording so far', function()
  local s, chapter = recording_session()
  s:send('roll', 'o1', chapter.guid, '75.5')
  H.eq(s:events(), { { 'ERROR', 'o1', 'The roll time is past the end of the recording.' } })
  H.eq(calls_named(s, 'OnStopButton'), 0)
end)

H.test('roll accepts at up to where REAPER records now, past the last saved item', function()
  local s, chapter = recording_session()
  s:send('roll', 'o1', chapter.guid, '75')
  H.eq(s:events(), { { 'ROLLED', 'o1', chapter.guid, '75.000000', '0' } })
end)

H.test('roll takes the later of the two play positions as where REAPER records now', function()
  local s, chapter = recording_session()
  s.fake.play_position, s.fake.play_position2 = 70, 75.2
  s:send('roll', 'o1', chapter.guid, '75.1')
  H.eq(s:events(), { { 'ROLLED', 'o1', chapter.guid, '75.100000', '0' } })
end)

H.test('roll accepts the project start', function()
  local s, chapter = recording_session()
  s:send('roll', 'o1', chapter.guid, '0')
  H.eq(s:events(), { { 'ROLLED', 'o1', chapter.guid, '0.000000', '0' } })
  H.eq(s.fake.cursor, 0)
end)

-- 5. roll-is-one-undo-block-and-idempotent-per-call --------------------------------------------------------------

H.test('a second roll is a second roll, and neither adds an undo point', function()
  local s, chapter = recording_session()
  s:send('roll', 'o1', chapter.guid, '50')
  H.eq(s:events(), { { 'ROLLED', 'o1', chapter.guid, '50.000000', '0' } })
  H.eq(#s.fake.undo, 0)
  s.fake.play_position = 58
  s:send('roll', 'o2', chapter.guid, '52')
  H.eq(s:events(), { { 'ROLLED', 'o2', chapter.guid, '52.000000', '0' } })
  H.eq(#s.fake.undo, 0)
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(calls_named(s, 'OnStopButton'), 2)
  H.eq(calls_named(s, 'CSurf_OnRecord'), 2)
  H.eq(s.fake.cursor, 52)
end)

-- Versions -------------------------------------------------------------------------------------------------------

H.test('roll needs the record and config APIs', function()
  for _, name in ipairs({ 'CSurf_OnRecord', 'OnStopButton', 'get_config_var_string', 'GetProjectLength', 'GetPlayPosition2' }) do
    local s, chapter = recording_session()
    s.fake:remove_api(name)
    s:send('roll', 'o1', chapter.guid, '40')
    H.eq(s:events(), { { 'ERROR', 'o1', 'This REAPER version cannot roll a recording.' } }, name)
    H.eq(calls_named(s, 'OnStopButton'), 0, name)
  end
end)
