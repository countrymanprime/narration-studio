-- Selecting a chapter's track in REAPER (narration_track_select.lua):
-- from the chapter track slide-over, "Select in REAPER" brings the narrator's attention to the linked track without
-- changing anything else. It deselects every other track and selects the named one; a GUID that no longer resolves
-- is TRACK_STALE, exactly as chapter_track_state reports it, and nothing is selected in that case.

local H = require('harness')

local CH1 = '{00000001-0000-4000-8000-000000000001}'

local function new_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local chapter = s.fake:add_track('Chapter 1')
  local pickups = s.fake:add_track('Pickups')
  return s, chapter, pickups
end

H.test('select_track selects the named track and reports it', function()
  local s, chapter = new_session()
  s:send('select_track', 't1', chapter.guid)
  H.eq(s:events(), { { 'TRACK_SELECTED', 't1', CH1 } })
  H.eq(chapter.selected, true)
end)

H.test('select_track deselects every other track, leaving only the named one selected', function()
  local s, chapter, pickups = new_session()
  pickups.selected = true
  chapter.selected = false
  s:send('select_track', 't1', chapter.guid)
  H.eq(chapter.selected, true)
  H.eq(pickups.selected, false)
end)

H.test('select_track on an already-selected track changes nothing and still reports it', function()
  local s, chapter = new_session()
  chapter.selected = true
  s:send('select_track', 't1', chapter.guid)
  H.eq(s:events(), { { 'TRACK_SELECTED', 't1', CH1 } })
  H.eq(chapter.selected, true)
end)

H.test('select_track matches the track GUID without braces or case, and answers it normalised', function()
  local s, chapter = new_session()
  s:send('select_track', 't1', (chapter.guid:lower():gsub('[{}]', '')))
  H.eq(s:events(), { { 'TRACK_SELECTED', 't1', CH1 } })
end)

H.test('select_track on a GUID that no longer resolves reports TRACK_STALE and selects nothing', function()
  local s, chapter, pickups = new_session()
  pickups.selected = true
  s:send('select_track', 't1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}')
  H.eq(s:events(), { { 'TRACK_STALE', 't1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
  H.eq(chapter.selected, false)
  H.eq(pickups.selected, true, 'a stale request changes no other track selection')
end)

H.test('select_track opens no undo block: selection is not project data', function()
  local s, chapter = new_session()
  s:send('select_track', 't1', chapter.guid)
  H.eq(#s.fake.undo, 0)
end)

-- Where the narrator is (read_place) and taking them somewhere (go_to): the DAW-neutral "follow the narrator" pair the Booth uses to open
-- on the track REAPER is on, and to move REAPER to the chapter and word the Booth was opened at.

local function place_session()
  local s, chapter, pickups = new_session()
  s.fake:add_item(chapter, { position = 0, length = 30 })
  s.fake:add_item(chapter, { position = 40, length = 20 })
  return s, chapter, pickups
end

H.test('read_place reports the one selected track, how many are selected and the edit cursor', function()
  local s, chapter = place_session()
  chapter.selected = true
  s.fake.cursor = 12.5
  s:send('read_place', 'p1')
  H.eq(s:events(), { { 'PLACE', 'p1', CH1, '1', '12.5' } })
end)

H.test('read_place with no track selected names none', function()
  local s = place_session()
  s:send('read_place', 'p1')
  H.eq(s:events(), { { 'PLACE', 'p1', '', '0', '0' } })
end)

H.test('read_place with several tracks selected names none, so the caller never guesses which', function()
  local s, chapter, pickups = place_session()
  chapter.selected, pickups.selected = true, true
  s.fake.cursor = 3
  s:send('read_place', 'p1')
  H.eq(s:events(), { { 'PLACE', 'p1', '', '2', '3' } })
end)

H.test('read_place changes nothing and opens no undo block', function()
  local s, chapter = place_session()
  chapter.selected = true
  s:send('read_place', 'p1')
  H.eq(#s.fake.undo, 0)
  H.eq(s.fake.cursor or 0, 0)
end)

H.test('go_to end selects the track and puts the cursor at the end of its last item', function()
  local s, chapter, pickups = place_session()
  pickups.selected = true
  s:send('go_to', 'g1', chapter.guid, 'end', '')
  H.eq(s:events(), { { 'PLACE_SET', 'g1', CH1, '60' } })
  H.eq(chapter.selected, true)
  H.eq(pickups.selected, false)
  H.eq(s.fake.cursor, 60)
end)

H.test('go_to end on a track with no items puts the cursor at zero', function()
  local s, chapter = new_session()
  s:send('go_to', 'g1', chapter.guid, 'end', '')
  H.eq(s:events(), { { 'PLACE_SET', 'g1', CH1, '0' } })
end)

H.test('go_to a time puts the cursor there without playing and without scrolling it away', function()
  local s, chapter = place_session()
  s:send('go_to', 'g1', chapter.guid, 'at', '17.25')
  H.eq(s:events(), { { 'PLACE_SET', 'g1', CH1, '17.25' } })
  H.eq(s.fake.cursor, 17.25)
  H.eq(s.fake.cursor_seekplay, false, 'moving the cursor does not start or seek playback')
end)

H.test('go_to with a time that is not a number refuses and moves nothing', function()
  local s, chapter = place_session()
  s:send('go_to', 'g1', chapter.guid, 'at', 'soon')
  H.eq(s:events(), { { 'ERROR', 'g1', 'The place to go to is not a usable number of seconds.' } })
  H.eq(s.fake.cursor or 0, 0)
  H.eq(chapter.selected, false)
end)

H.test('go_to with a negative time refuses', function()
  local s, chapter = place_session()
  s:send('go_to', 'g1', chapter.guid, 'at', '-1')
  H.eq(s:events(), { { 'ERROR', 'g1', 'The place to go to is not a usable number of seconds.' } })
end)

H.test('go_to with an unknown mode refuses', function()
  local s, chapter = place_session()
  s:send('go_to', 'g1', chapter.guid, 'sideways', '')
  H.eq(s:events(), { { 'ERROR', 'g1', 'Unknown place: sideways.' } })
end)

H.test('go_to on a track that no longer resolves reports TRACK_STALE and moves nothing', function()
  local s, chapter, pickups = place_session()
  pickups.selected = true
  s:send('go_to', 'g1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}', 'end', '')
  H.eq(s:events(), { { 'TRACK_STALE', 'g1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
  H.eq(pickups.selected, true)
  H.eq(s.fake.cursor or 0, 0)
end)

H.test('go_to opens no undo block: a cursor move is not project data', function()
  local s, chapter = place_session()
  s:send('go_to', 'g1', chapter.guid, 'end', '')
  H.eq(#s.fake.undo, 0)
end)

-- A chapter folder and its voices (#3427) ---------------------------------------------------------------------------

-- Chapter 1 (a folder) holds Narrator and Queen; a nested folder "Crowd" holds Guard; Chapter 2 is a plain track after it.
local function folder_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local t = {}
  t.chapter = s.fake:add_track('Chapter 1')
  t.narrator = s.fake:add_track('Narrator')
  t.queen = s.fake:add_track('Queen')
  t.crowd = s.fake:add_track('Crowd')
  t.guard = s.fake:add_track('Guard')
  t.next = s.fake:add_track('Chapter 2')
  t.chapter.folder_depth, t.crowd.folder_depth, t.guard.folder_depth = 1, 1, -2
  s.fake:add_item(t.chapter, { position = 0, length = 30 })
  return s, t
end

local function selection(t)
  local out = {}
  for _, track in ipairs({ t.chapter, t.narrator, t.queen, t.crowd, t.guard, t.next }) do
    out[#out + 1] = track.selected and 1 or 0
  end
  return out
end

H.test('go_to a folder selects it and every track inside it, nested folders included, and no other', function()
  local s, t = folder_session()
  t.next.selected = true
  s:send('go_to', 'g1', t.chapter.guid, 'end', '')
  H.eq(s:events(), { { 'PLACE_SET', 'g1', '{00000001-0000-4000-8000-000000000001}', '30' } })
  H.eq(selection(t), { 1, 1, 1, 1, 1, 0 })
end)

H.test('go_to a track that is not a folder selects only that track', function()
  local s, t = folder_session()
  s:send('go_to', 'g1', t.narrator.guid, 'at', '4')
  H.eq(selection(t), { 0, 1, 0, 0, 0, 0 })
end)

H.test('go_to a nested folder selects it and its own tracks only', function()
  local s, t = folder_session()
  s:send('go_to', 'g1', t.crowd.guid, 'end', '')
  H.eq(selection(t), { 0, 0, 0, 1, 1, 0 })
end)

H.test('go_to a folder that is gone selects nothing in its place', function()
  local s, t = folder_session()
  t.queen.selected = true
  s:send('go_to', 'g1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}', 'end', '')
  H.eq(selection(t), { 0, 0, 1, 0, 0, 0 })
end)

H.test('read_place names the folder when exactly it and everything inside it is selected', function()
  local s, t = folder_session()
  s:send('go_to', 'g1', t.chapter.guid, 'end', '')
  s:send('read_place', 'p1')
  H.eq(s:events()[2], { 'PLACE', 'p1', '{00000001-0000-4000-8000-000000000001}', '5', '30' })
end)

H.test('read_place names none when the selection is the folder and only some of its tracks', function()
  local s, t = folder_session()
  t.chapter.selected, t.narrator.selected = true, true
  s:send('read_place', 'p1')
  H.eq(s:events(), { { 'PLACE', 'p1', '', '2', '0' } })
end)

H.test('read_place names none when the selection is the folder, all its tracks and one track outside', function()
  local s, t = folder_session()
  t.chapter.selected, t.narrator.selected, t.queen.selected, t.crowd.selected, t.guard.selected, t.next.selected = true, true, true, true, true, true
  s:send('read_place', 'p1')
  H.eq(s:events(), { { 'PLACE', 'p1', '', '6', '0' } })
end)

H.test('read_place names none for two unrelated tracks, as before', function()
  local s, t = folder_session()
  t.narrator.selected, t.next.selected = true, true
  s:send('read_place', 'p1')
  H.eq(s:events(), { { 'PLACE', 'p1', '', '2', '0' } })
end)
