-- Two-way transport sync for the Editing page (narration_transport.lua): set_cursor, play_from, stop_play and watch_transport.
-- The page puts REAPER's edit cursor on a clicked word, starts REAPER's transport from there and stops it again, and follows
-- REAPER's play position and edit cursor through TRANSPORT events while it holds a watch lease. None of them adds an undo point,
-- selects a track or touches a recording, and a lease that is not renewed runs out by itself.

local H = require('harness')

local function new_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  s.fake:add_track('Chapter 1')
  s.fake.clock_step = 0.05
  -- The fake keeps only the last cursor move; the order of moves and button presses is what these tests read.
  local move = s.fake.reaper.SetEditCurPos
  s.fake.reaper.SetEditCurPos = function(...)
    s.fake.calls[#s.fake.calls + 1] = { name = 'SetEditCurPos' }
    return move(...)
  end
  return s
end

local function calls_named(s, name)
  local out = {}
  for _, call in ipairs(s.fake.calls) do
    if call.name == name then
      out[#out + 1] = call
    end
  end
  return out
end

local function names(s)
  local out = {}
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'SetEditCurPos' or call.name == 'OnPlayButton' or call.name == 'OnStopButton' then
      out[#out + 1] = call.name
    end
  end
  return out
end

local function transport_events(s)
  local out = {}
  for _, event in ipairs(s:events()) do
    if event[1] == 'TRANSPORT' then
      out[#out + 1] = event
    end
  end
  return out
end

-- set_cursor -----------------------------------------------------------------------------------------------------

H.test('set_cursor puts the edit cursor at the time, scrolls the view, never seeks playback and makes no undo point', function()
  local s = new_session()
  s:send('set_cursor', 'c1', '12.5')
  H.eq(s:events(), { { 'CURSOR_SET', 'c1', '12.500000' } })
  H.eq(s.fake.cursor, 12.5)
  H.eq(s.fake.cursor_moveview, true)
  H.eq(s.fake.cursor_seekplay, false)
  H.eq(#s.fake.undo, 0, 'moving the cursor is not an edit')
  H.eq(#calls_named(s, 'SetOnlyTrackSelected'), 0, 'no track is selected')
  H.eq(#calls_named(s, 'OnPlayButton'), 0)
end)

H.test('set_cursor while REAPER plays moves the cursor and leaves the playhead alone', function()
  local s = new_session()
  s.fake.play_state = 1
  s:send('set_cursor', 'c1', '3')
  H.eq(s:events(), { { 'CURSOR_SET', 'c1', '3.000000' } })
  H.eq(s.fake.cursor_seekplay, false)
  H.eq(s.fake.play_state, 1)
end)

for _, bad in ipairs({ '', 'abc', '-1', 'nan', 'inf', '1e12', '0x10', '1,5' }) do
  H.test('set_cursor refuses ' .. string.format('%q', bad) .. ' and moves nothing', function()
    local s = new_session()
    s.fake.cursor = 7
    s:send('set_cursor', 'c1', bad)
    H.eq(s:events(), { { 'ERROR', 'c1', 'The place to put the cursor is not a usable number of seconds.' } })
    H.eq(s.fake.cursor, 7)
  end)
end

H.test('set_cursor is refused while REAPER is recording, and the cursor stays', function()
  local s = new_session()
  s.fake.play_state = 5
  s.fake.cursor = 7
  s:send('set_cursor', 'c1', '3')
  H.eq(s:events(), { { 'ERROR', 'c1', 'REAPER is recording. Stop recording first.' } })
  H.eq(s.fake.cursor, 7)
end)

-- play_from ------------------------------------------------------------------------------------------------------

H.test('play_from on a stopped REAPER puts the cursor there, presses Play once and answers the position', function()
  local s = new_session()
  s:send('play_from', 'p1', '40.25')
  H.eq(s:events(), { { 'TRANSPORT_PLAYING', 'p1', '40.250000' } })
  H.eq(names(s), { 'SetEditCurPos', 'OnPlayButton' }, 'the cursor first, then Play')
  H.eq(s.fake.cursor, 40.25)
  H.eq(s.fake.play_state, 1)
  H.eq(#s.fake.undo, 0)
end)

H.test('play_from while REAPER plays seeks the playhead and does not press Play again', function()
  local s = new_session()
  s.fake.play_state = 1
  s:send('play_from', 'p1', '8')
  H.eq(s:events(), { { 'TRANSPORT_PLAYING', 'p1', '8.000000' } })
  H.eq(s.fake.cursor_seekplay, true)
  H.eq(#calls_named(s, 'OnPlayButton'), 0)
end)

H.test('play_from on a paused REAPER stops first, so Play starts from the time and not from where it paused', function()
  local s = new_session()
  s.fake.play_state = 2
  s:send('play_from', 'p1', '8')
  H.eq(names(s), { 'OnStopButton', 'SetEditCurPos', 'OnPlayButton' })
  H.eq(s.fake.play_state, 1)
end)

H.test('play_from is refused while REAPER is recording: nothing moves and nothing is pressed', function()
  local s = new_session()
  s.fake.play_state = 5
  s.fake.cursor = 7
  s:send('play_from', 'p1', '8')
  H.eq(s:events(), { { 'ERROR', 'p1', 'REAPER is recording. Stop recording first.' } })
  H.eq(names(s), {})
  H.eq(s.fake.cursor, 7)
end)

for _, bad in ipairs({ '', 'abc', '-0.5', 'nan', 'inf' }) do
  H.test('play_from refuses ' .. string.format('%q', bad) .. ' and presses nothing', function()
    local s = new_session()
    s:send('play_from', 'p1', bad)
    H.eq(s:events(), { { 'ERROR', 'p1', 'The place to play from is not a usable number of seconds.' } })
    H.eq(names(s), {})
  end)
end

-- stop_play ------------------------------------------------------------------------------------------------------

H.test('stop_play stops a playing REAPER and answers where the edit cursor is', function()
  local s = new_session()
  s.fake.play_state = 1
  s.fake.cursor = 5
  s:send('stop_play', 's1')
  H.eq(s:events(), { { 'TRANSPORT_STOPPED', 's1', '5.000000' } })
  H.eq(names(s), { 'OnStopButton' })
  H.eq(s.fake.play_state, 0)
end)

H.test('stop_play on a stopped REAPER presses nothing and says so the same way', function()
  local s = new_session()
  s:send('stop_play', 's1')
  H.eq(s:events(), { { 'TRANSPORT_STOPPED', 's1', '0.000000' } })
  H.eq(names(s), {})
end)

H.test('stop_play never stops a recording', function()
  local s = new_session()
  s.fake.play_state = 5
  s:send('stop_play', 's1')
  H.eq(s:events(), { { 'ERROR', 's1', 'REAPER is recording. Stop recording first.' } })
  H.eq(s.fake.play_state, 5)
  H.eq(names(s), {})
end)

-- watch_transport ------------------------------------------------------------------------------------------------

H.test('watch_transport answers the lease and sends one TRANSPORT event with the play state, position and cursor', function()
  local s = new_session()
  s.fake.cursor, s.fake.play_position = 4, 0
  s:send('watch_transport', 'w1', '5')
  local events = s:events()
  H.eq(events[1], { 'TRANSPORT_WATCHING', 'w1', '5' })
  H.eq(events[2], { 'TRANSPORT', '', '0', '0.000000', '4.000000' }, 'a broadcast: the run field is empty, like the heartbeat')
  H.eq(#events, 2)
end)

H.test('a watched REAPER that is stopped and unchanged sends nothing more', function()
  local s = new_session()
  s:send('watch_transport', 'w1', '5')
  s:events()
  for _ = 1, 20 do
    s:tick()
  end
  H.eq(transport_events(s), {})
end)

H.test('an edit cursor moved in REAPER is sent at once, and only once', function()
  local s = new_session()
  s:send('watch_transport', 'w1', '5')
  s:events()
  s.fake.cursor = 9.5
  s:tick()
  s:tick()
  H.eq(transport_events(s), { { 'TRANSPORT', '', '0', '0.000000', '9.500000' } })
end)

H.test('a cursor wobble under a millisecond is not a move', function()
  local s = new_session()
  s.fake.cursor = 9
  s:send('watch_transport', 'w1', '5')
  s:events()
  s.fake.cursor = 9.0004
  s:tick()
  H.eq(transport_events(s), {})
end)

H.test('a play state change is sent at once', function()
  local s = new_session()
  s:send('watch_transport', 'w1', '5')
  s:events()
  s.fake.play_state, s.fake.play_position = 1, 2
  s:tick()
  H.eq(transport_events(s), { { 'TRANSPORT', '', '1', '2.000000', '0.000000' } })
  s.fake.play_state = 0
  s:tick()
  H.eq(transport_events(s), { { 'TRANSPORT', '', '0', '2.000000', '0.000000' } })
end)

H.test('while REAPER plays the position is sent about four times a second, not on every tick', function()
  local s = new_session()
  s.fake.play_state = 1
  s:send('watch_transport', 'w1', '10')
  s:events()
  local sent = 0
  for step = 1, 40 do
    s.fake.play_position = step * 0.05
    s:tick()
    sent = sent + #transport_events(s)
  end
  -- Each tick moves the fake clock 0.1 s (the heartbeat and the watch each read it), so 40 ticks are 4 s: about 16 events.
  H.truthy(sent >= 12 and sent <= 20, 'about 4 a second over the 4 seconds the fake clock ran, got ' .. sent)
end)

H.test('a lease that is not renewed runs out: the events stop', function()
  local s = new_session()
  s:send('watch_transport', 'w1', '1')
  s:events()
  for _ = 1, 60 do
    s:tick()
  end
  s.fake.cursor = 77
  s:tick()
  H.eq(transport_events(s), {}, 'after the lease no event is sent, however REAPER moves')
end)

H.test('renewing the lease keeps the events coming and does not repeat the opening event', function()
  local s = new_session()
  s:send('watch_transport', 'w1', '2')
  s:events()
  for _ = 1, 8 do
    s:tick()
  end
  s:send('watch_transport', 'w2', '2')
  H.eq(s:events(), { { 'TRANSPORT_WATCHING', 'w2', '2' } })
  s.fake.cursor = 3
  s:tick()
  H.eq(#transport_events(s), 1)
end)

H.test('the lease is clamped to ten seconds and refused when it is not a number of seconds', function()
  local s = new_session()
  s:send('watch_transport', 'w1', '600')
  H.eq(s:events()[1], { 'TRANSPORT_WATCHING', 'w1', '10' })
  for _, bad in ipairs({ '', '0', '-3', 'abc', 'nan' }) do
    s:send('watch_transport', 'w2', bad)
    H.eq(s:events(), { { 'ERROR', 'w2', 'The watch lease is not a usable number of seconds.' } }, bad)
  end
end)

H.test('watching while REAPER records sends the state, so the app can see a take is running', function()
  local s = new_session()
  s.fake.play_state = 5
  s:send('watch_transport', 'w1', '5')
  H.eq(s:events()[2], { 'TRANSPORT', '', '5', '0.000000', '0.000000' })
end)

H.test('a bridge that was never asked to watch sends no TRANSPORT event', function()
  local s = new_session()
  s.fake.play_state = 1
  for _ = 1, 20 do
    s:tick()
  end
  H.eq(transport_events(s), {})
end)

-- play_range -----------------------------------------------------------------------------------------------------
-- The DAW plays one stretch and stops itself at its end, so a play of a word or a note ends where the app planned it, not when a position
-- stream and a stop round trip get there. The play is REAPER's own transport, so the project's FX chain is what the narrator hears.

local function presses(s)
  local out = {}
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'OnPlayButton' or call.name == 'OnStopButton' then
      out[#out + 1] = call.name
    end
  end
  return out
end

H.test('play_range puts the cursor at the start, presses Play once and answers the stretch', function()
  local s = new_session()
  s:send('play_range', 'r1', '40.25', '41.5')
  H.eq(s:events(), { { 'RANGE_PLAYING', 'r1', '40.250000', '41.500000' } })
  H.eq(names(s), { 'SetEditCurPos', 'OnPlayButton' }, 'the cursor first, then Play')
  H.eq(s.fake.cursor, 40.25)
  H.eq(s.fake.play_state, 1)
  H.eq(#s.fake.undo, 0, 'playing is not an edit')
end)

H.test('play_range stops REAPER by itself once the play head reaches the end, and presses Stop only once', function()
  local s = new_session()
  s:send('play_range', 'r1', '40', '41')
  s:events()
  s.fake.play_position = 40.4
  s:tick()
  H.eq(s.fake.play_state, 1, 'still inside the stretch')
  s.fake.play_position = 41.02
  s:tick()
  H.eq(s.fake.play_state, 0)
  H.eq(presses(s), { 'OnPlayButton', 'OnStopButton' })
  for _ = 1, 10 do
    s:tick()
  end
  H.eq(presses(s), { 'OnPlayButton', 'OnStopButton' }, 'a second tick presses nothing')
end)

H.test('play_range does not stop on the old play head REAPER still reports just after a seek', function()
  local s = new_session()
  s.fake.play_state = 1
  s.fake.play_position = 100
  s:send('play_range', 'r1', '40', '41')
  s:events()
  for _ = 1, 3 do
    s:tick()
  end
  H.eq(s.fake.play_state, 1, 'a play head of 100 s is not this stretch')
  s.fake.play_position = 40.5
  s:tick()
  s.fake.play_position = 41.1
  s:tick()
  H.eq(s.fake.play_state, 0)
end)

H.test('play_range does not take a head from before the stretch for its arrival', function()
  local s = new_session()
  s.fake.play_state = 1
  s.fake.play_position = 10
  s:send('play_range', 'r1', '40', '41')
  s:tick()
  s.fake.play_position = 41.1
  s:tick()
  H.eq(s.fake.play_state, 1, 'a head of 10 s was not in the stretch, and 41.1 is the first reading in it: no arrival')
end)

H.test('play_range stops anyway when the play head never reaches the stretch', function()
  local s = new_session()
  s:send('play_range', 'r1', '40', '41')
  s.fake.play_position = 500
  for _ = 1, 80 do
    s:tick()
  end
  H.eq(s.fake.play_state, 0, 'the deadline is the length of the stretch and a margin')
  H.eq(presses(s), { 'OnPlayButton', 'OnStopButton' })
end)

H.test('play_range does not trust a first reading at or past the end: that is the head of the play before, so it waits for the head to arrive', function()
  local s = new_session()
  s:send('play_range', 'r1', '40', '41')
  s.fake.play_position = 41.3
  s:tick()
  s:tick()
  H.eq(s.fake.play_state, 1)
  s.fake.play_position = 40.4
  s:tick()
  s.fake.play_position = 41.02
  s:tick()
  H.eq(s.fake.play_state, 0)
end)

H.test('playing the same stretch again is not stopped by the head the first play left behind', function()
  local s = new_session()
  s:send('play_range', 'r1', '40', '41')
  s.fake.play_position = 40.5
  s:tick()
  s.fake.play_position = 41.02
  s:tick()
  H.eq(s.fake.play_state, 0)
  s:send('play_range', 'r2', '40', '41')
  H.eq(s.fake.play_state, 1)
  -- REAPER still reports where the first play stopped.
  for _ = 1, 3 do
    s:tick()
  end
  H.eq(s.fake.play_state, 1, 'the old head is past the end of the new stretch and is not its arrival')
  s.fake.play_position = 40.2
  s:tick()
  s.fake.play_position = 41.01
  s:tick()
  H.eq(s.fake.play_state, 0)
end)

H.test('a play another feature starts (the cursor goes elsewhere) is not cut short by the stretch that was set', function()
  local s = new_session()
  s:send('play_range', 'r1', '40', '41')
  -- Compare's pass or a navigation play: the cursor is set to its own start and Play is pressed.
  s.fake.cursor, s.fake.play_state, s.fake.play_position = 500, 1, 500.2
  for _ = 1, 80 do
    s:tick()
  end
  s.fake.play_position = 40.5
  s:tick()
  s.fake.play_position = 41.5
  s:tick()
  H.eq(s.fake.play_state, 1, 'neither the deadline nor a head that passes through the old stretch stops it')
  H.eq(presses(s), { 'OnPlayButton' })
end)

H.test('REAPER paused or recording during the stretch drops it, so the play that follows is not stopped at the old end', function()
  for _, state in ipairs({ 2, 5 }) do
    local s = new_session()
    s:send('play_range', 'r1', '40', '41')
    s.fake.play_position = 40.3
    s:tick()
    s.fake.play_state = state
    s:tick()
    s.fake.play_state, s.fake.play_position = 1, 40.6
    s:tick()
    s.fake.play_position = 41.5
    s:tick()
    H.eq(s.fake.play_state, 1, 'state ' .. state .. ' ended the stretch')
  end
end)

H.test('play_range while REAPER plays seeks the playhead and does not press Play again', function()
  local s = new_session()
  s.fake.play_state = 1
  s:send('play_range', 'r1', '8', '9')
  H.eq(s:events(), { { 'RANGE_PLAYING', 'r1', '8.000000', '9.000000' } })
  H.eq(s.fake.cursor_seekplay, true)
  H.eq(#calls_named(s, 'OnPlayButton'), 0)
end)

H.test('play_range on a paused REAPER stops first, so Play starts from the start and not from where it paused', function()
  local s = new_session()
  s.fake.play_state = 2
  s:send('play_range', 'r1', '8', '9')
  H.eq(names(s), { 'OnStopButton', 'SetEditCurPos', 'OnPlayButton' })
end)

H.test('a narrator who stops REAPER during the stretch ends it: a later play is not stopped at the old end', function()
  local s = new_session()
  s:send('play_range', 'r1', '40', '41')
  s.fake.play_position = 40.3
  s:tick()
  s.fake.play_state = 0
  s:tick()
  s.fake.play_state, s.fake.play_position = 1, 60
  s:tick()
  s:tick()
  H.eq(s.fake.play_state, 1, "the narrator's own play goes on")
  H.eq(presses(s), { 'OnPlayButton' })
end)

H.test('play_from, stop_play and a newer play_range each end the stretch that was set', function()
  local s = new_session()
  s:send('play_range', 'r1', '40', '41')
  -- The head is inside the old stretch when the open play is asked for, as when REAPER reads late after a seek.
  s.fake.play_position = 40.3
  s:tick()
  s:send('play_from', 'p1', '70')
  s.fake.play_position = 40.4
  -- The play head passes through the old stretch (a seek that reads late), then beyond its end: the old end must not stop an open play.
  s.fake.play_position = 40.5
  s:tick()
  s.fake.play_position = 41.5
  s:tick()
  H.eq(s.fake.play_state, 1, 'play_from is an open play: the old end does not stop it')

  local t = new_session()
  t:send('play_range', 'r1', '40', '41')
  t:send('stop_play', 's1')
  t.fake.play_state, t.fake.play_position = 1, 40.5
  t:tick()
  t.fake.play_position = 42
  t:tick()
  H.eq(t.fake.play_state, 1, 'stop_play dropped the stretch')

  local u = new_session()
  u:send('play_range', 'r1', '40', '41')
  u:send('play_range', 'r2', '90', '95')
  u.fake.play_position = 91
  u:tick()
  u.fake.play_position = 94
  u:tick()
  H.eq(u.fake.play_state, 1, 'the newer stretch ends at 95, not at the older 41')
  u.fake.play_position = 95.1
  u:tick()
  H.eq(u.fake.play_state, 0)
end)

H.test('play_range is refused while REAPER is recording: nothing moves and nothing is pressed', function()
  local s = new_session()
  s.fake.play_state = 5
  s.fake.cursor = 7
  s:send('play_range', 'r1', '8', '9')
  H.eq(s:events(), { { 'ERROR', 'r1', 'REAPER is recording. Stop recording first.' } })
  H.eq(names(s), {})
  H.eq(s.fake.cursor, 7)
end)

for _, pair in ipairs({
  { '', '5' },
  { '5', '' },
  { 'abc', '5' },
  { '1', 'nan' },
  { '-1', '5' },
  { '5', '5' },
  { '6', '5' },
  { '1', 'inf' },
  { '0', '601' },
}) do
  H.test('play_range refuses ' .. string.format('%q to %q', pair[1], pair[2]) .. ' and presses nothing', function()
    local s = new_session()
    s:send('play_range', 'r1', pair[1], pair[2])
    H.eq(s:events(), { { 'ERROR', 'r1', 'The stretch to play is not a usable pair of times.' } })
    H.eq(names(s), {})
  end)
end

H.test('a play_range stretch with no end argument is refused, not played open-ended', function()
  local s = new_session()
  s:send('play_range', 'r1', '5')
  H.eq(s:events(), { { 'ERROR', 'r1', 'The stretch to play is not a usable pair of times.' } })
  H.eq(names(s), {})
end)

-- Playing only the chapter's track ------------------------------------------------------------------------------------
-- A play that names a track GUID selects that track, solos it in place so nothing else is heard, and puts the narrator's selection, solos and the
-- track's mute back when the play ends in any way. Owner report: the page played whichever track was selected in REAPER, which was another chapter.

local function isolated_session()
  local s = new_session()
  s.fake.resource_path = host.tmpdir()
  os.remove(H.join(host.tmpdir(), 'narration_play_isolation.txt'))
  local fake = s.fake
  local chapter1 = fake.tracks[1]
  local chapter2 = fake:add_track('Chapter 2')
  local folder = fake:add_track('Folder')
  local child = fake:add_track('Child of folder')
  fake:add_item(chapter1, { position = 0, length = 100, source = 'c1.wav' })
  fake:add_item(chapter2, { position = 0, length = 100, source = 'c2.wav' })
  fake:add_item(child, { position = 200, length = 50, source = 'c3.wav' })
  return s, { c1 = chapter1, c2 = chapter2, folder = folder, child = child }
end

local function states(s)
  local out = {}
  for _, track in ipairs(s.fake.tracks) do
    out[#out + 1] = { solo = track.solo or 0, selected = track.selected, muted = track.muted }
  end
  return out
end

H.test('play_range with a track solos it in place, selects only it, and plays', function()
  local s, t = isolated_session()
  t.c2.selected = true -- the narrator had another chapter selected
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  H.eq(s:events(), { { 'RANGE_PLAYING', 'r1', '10.000000', '12.000000' } })
  H.eq(t.c1.solo, 2, 'the linked track is soloed in place')
  H.eq(t.c1.selected, true)
  H.eq(t.c2.selected, false, 'the track that was selected is not the one played')
  H.eq(t.c2.solo or 0, 0)
  H.eq(s.fake.play_state, 1)
  H.eq(#s.fake.undo, 0)
end)

H.test('play_range puts the selection, solos and mute back when the stretch ends', function()
  local s, t = isolated_session()
  t.c2.selected, t.c2.solo, t.folder.muted, t.child.solo = true, 1, true, 2
  t.c1.muted = true -- the narrator muted the linked track itself
  local before = states(s)
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  H.eq(t.c1.muted, false, 'a muted linked track is heard while it plays')
  s.fake.play_position = 10.5
  s:tick()
  s.fake.play_position = 12.1
  s:tick()
  s:tick()
  H.eq(s.fake.play_state, 0)
  H.eq(states(s), before, 'every selection, solo and mute is as the narrator left it')
end)

H.test('play_range with no track plays the project as it is and touches no track', function()
  local s, t = isolated_session()
  t.c2.selected = true
  local before = states(s)
  s:send('play_range', 'r1', '10', '12')
  H.eq(states(s), before)
end)

H.test('play_range refuses a track that is not in the project, changing nothing', function()
  local s, t = isolated_session()
  t.c2.selected = true
  local before = states(s)
  s:send('play_range', 'r1', '10', '12', '{00000000-0000-0000-0000-00000000DEAD}')
  H.eq(s:events(), { { 'ERROR', 'r1', "The chapter's track is not in the REAPER project." } })
  H.eq(states(s), before)
  H.eq(names(s), {})
end)

H.test('play_range refuses a time the linked track has no audio at, so another chapter is never played in its place', function()
  local s, t = isolated_session()
  t.c2.selected = true
  local before = states(s)
  s:send('play_range', 'r1', '150', '152', t.c1.guid)
  H.eq(s:events(), { { 'ERROR', 'r1', "The chapter's track has no audio at that time in the REAPER project." } })
  H.eq(states(s), before)
  H.eq(names(s), {})
end)

H.test('play_range plays a track that is a folder child by itself', function()
  local s, t = isolated_session()
  s:send('play_range', 'r1', '210', '212', t.child.guid)
  H.eq(s:events(), { { 'RANGE_PLAYING', 'r1', '210.000000', '212.000000' } })
  H.eq(t.child.solo, 2)
  H.eq(t.folder.solo or 0, 0, 'REAPER keeps the folder parent audible when its child is soloed, so it is not soloed itself')
end)

H.test('stop_play puts everything back', function()
  local s, t = isolated_session()
  t.c2.selected, t.c2.solo = true, 1
  local before = states(s)
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  s:events()
  s:send('stop_play', 'r2')
  H.eq(states(s), before)
end)

H.test('the narrator stopping REAPER puts everything back', function()
  local s, t = isolated_session()
  t.c2.selected, t.c2.solo = true, 1
  local before = states(s)
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  s.fake.play_state = 0
  s:tick()
  H.eq(states(s), before)
end)

H.test('the deadline stop puts everything back when the play head never arrives', function()
  local s, t = isolated_session()
  t.c2.selected = true
  local before = states(s)
  s:send('play_range', 'r1', '10', '11', t.c1.guid)
  s.fake.play_position = 500
  for _ = 1, 100 do
    s:tick()
  end
  H.eq(s.fake.play_state, 0)
  H.eq(states(s), before)
end)

H.test('a second play_range for another track replaces the isolation and still restores the original state', function()
  local s, t = isolated_session()
  t.c2.selected, t.c1.solo = true, 1
  local before = states(s)
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  s:send('play_range', 'r2', '20', '22', t.c2.guid)
  H.eq(t.c1.solo, 0)
  H.eq(t.c2.solo, 2)
  s:send('stop_play', 'r3')
  H.eq(states(s), before, 'the original state, not the state the first isolation left')
end)

H.test('a change the narrator makes during the play is kept when it ends', function()
  local s, t = isolated_session()
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  t.folder.solo = 1 -- the narrator soloed another track meanwhile
  t.c1.solo = 0 -- and took the solo off the played one
  s:send('stop_play', 'r2')
  H.eq(t.folder.solo, 1)
  H.eq(t.c1.solo, 0)
end)

H.test('play_from with a track isolates it until REAPER stops', function()
  local s, t = isolated_session()
  t.c2.selected = true
  local before = states(s)
  s:send('play_from', 'r1', '10', t.c1.guid)
  H.eq(t.c1.solo, 2)
  H.eq(t.c2.selected, false)
  s.fake.play_state = 0
  s:tick()
  H.eq(states(s), before)
end)

H.test('a state left by a REAPER that closed mid-play is put right by the next bridge', function()
  local s, t = isolated_session()
  t.c2.selected, t.c2.solo = true, 1
  local before = states(s)
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  local file = H.read_file(H.join(s.fake.resource_path, 'narration_play_isolation.txt'))
  -- REAPER closed with the project as the isolation left it (saved that way); the next REAPER starts with the same tracks and the file on disk.
  local after = states(s)
  local again, u = isolated_session()
  again.fake.resource_path = s.fake.resource_path
  u.c1.solo, u.c1.selected, u.c2.selected, u.c2.solo = 2, true, false, 0
  H.eq(states(again), after)
  again:tick()
  H.eq(states(again), before, 'the narrator\'s selection and solos are back')
  H.eq(file ~= nil and #file > 0, true)
end)

H.test('play_from refuses a track that is not in the project or has no audio at the time, changing nothing', function()
  local s, t = isolated_session()
  t.c2.selected = true
  local before = states(s)
  s:send('play_from', 'r1', '10', '{00000000-0000-0000-0000-00000000DEAD}')
  s:send('play_from', 'r2', '150', t.c1.guid)
  H.eq(s:events(), {
    { 'ERROR', 'r1', "The chapter's track is not in the REAPER project." },
    { 'ERROR', 'r2', "The chapter's track has no audio at that time in the REAPER project." },
  })
  H.eq(states(s), before)
  H.eq(names(s), {})
end)

H.test('a play that names a track while REAPER records is refused and touches no track', function()
  local s, t = isolated_session()
  t.c2.selected = true
  local before = states(s)
  s.fake.play_state = 5
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  s:send('play_from', 'r2', '10', t.c1.guid)
  H.eq(s:events(), { { 'ERROR', 'r1', 'REAPER is recording. Stop recording first.' }, { 'ERROR', 'r2', 'REAPER is recording. Stop recording first.' } })
  H.eq(states(s), before)
end)

H.test('the same play_range twice restores the narrator\'s state, not the state the first isolation left', function()
  local s, t = isolated_session()
  t.c2.selected, t.c2.solo = true, 1
  local before = states(s)
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  s:send('play_range', 'r2', '10', '12', t.c1.guid)
  s:send('stop_play', 'r3')
  H.eq(states(s), before)
end)

H.test('a plain play_from or play_range after an isolated play puts everything back', function()
  for _, command in ipairs({ 'play_from', 'play_range' }) do
    local s, t = isolated_session()
    t.c2.selected, t.c2.solo = true, 1
    local before = states(s)
    s:send('play_range', 'r1', '10', '12', t.c1.guid)
    if command == 'play_from' then
      s:send('play_from', 'r2', '20')
    else
      s:send('play_range', 'r2', '20', '22')
    end
    H.eq(states(s), before, command)
  end
end)

H.test('a refused play leaves the isolation of the play that is running as it was', function()
  local s, t = isolated_session()
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  s:send('play_from', 'r2', 'abc')
  s:send('play_range', 'r3', '10', '12', t.c2.guid .. 'x')
  H.eq(t.c1.solo, 2, 'the narrator still hears only the chapter that plays')
end)

H.test('the isolation is written to disk before any track changes, and the file is gone once everything is back', function()
  local s, t = isolated_session()
  local path = H.join(s.fake.resource_path, 'narration_play_isolation.txt')
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  H.eq(H.read_file(path) ~= nil and #H.read_file(path) > 0, true)
  s:send('stop_play', 'r2')
  H.eq(H.read_file(path), nil)
end)

H.test('a leftover file is not allowed to undo an isolation that is in place', function()
  local s, t = isolated_session()
  t.c2.selected = true
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  s:tick()
  s:tick()
  H.eq(t.c1.solo, 2, 'the first tick after the play did not restore it')
end)

H.test('a play is refused, changing nothing, when the isolation cannot be written', function()
  local s, t = isolated_session()
  s.fake.resource_path = H.join(host.tmpdir(), 'no', 'such', 'folder')
  t.c2.selected = true
  local before = states(s)
  s:send('play_range', 'r1', '10', '12', t.c1.guid)
  H.eq(s:events(), { { 'ERROR', 'r1', "The chapter's track could not be soloed because REAPER's resource folder is not writable, so nothing was played." } })
  H.eq(states(s), before)
  H.eq(names(s), {})
end)
