-- Adding a chapter's track in REAPER (narration_track_create.lua): "Create a track for this chapter and link it" when the
-- chapter has no track to record on. It adds one track at the end of the track list, named as the host asks, in one undo
-- block, and answers the new track's GUID, index and name so the host can link the chapter to it. It never saves the project.

local H = require('harness')

-- The fake numbers GUIDs in creation order: the two existing tracks are 1 and 2, so the first new track is 3.
local NEW = '{00000003-0000-4000-8000-000000000003}'
local SECOND = '{00000004-0000-4000-8000-000000000004}'

local function new_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local first = s.fake:add_track('Chapter 1')
  local pickups = s.fake:add_track('Pickups')
  return s, first, pickups
end

H.test('track_create adds one named track at the end of the track list and answers its GUID, index and name', function()
  local s, first, pickups = new_session()
  s:send('track_create', 'c1', 'Chapter 2: The Storm')
  H.eq(s:events(), { { 'TRACK_CREATED', 'c1', NEW, '2', 'Chapter 2: The Storm' } })
  H.eq(#s.fake.tracks, 3)
  H.eq(s.fake.tracks[1], first)
  H.eq(s.fake.tracks[2], pickups)
  H.eq(s.fake.tracks[3].name, 'Chapter 2: The Storm')
  H.eq(s.fake.tracks[3].guid, NEW)
end)

H.test("track_create inserts at the current track count, never between the narrator's tracks", function()
  local s = new_session()
  s:send('track_create', 'c1', 'Chapter 2')
  local inserts = {}
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'InsertTrackAtIndex' then
      inserts[#inserts + 1] = call.index
    end
  end
  H.eq(inserts, { 2 })
end)

H.test('track_create makes one undo point named for the app and leaves no block open', function()
  local s = new_session()
  s:send('track_create', 'c1', 'Chapter 2')
  H.eq(#s.fake.undo, 1)
  H.eq(s.fake.undo[1].label, H.brand.name .. ': add track')
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('track_create trims the name and answers the name it set', function()
  local s = new_session()
  s:send('track_create', 'c1', '  Chapter 2  ')
  H.eq(s:events(), { { 'TRACK_CREATED', 'c1', NEW, '2', 'Chapter 2' } })
  H.eq(s.fake.tracks[3].name, 'Chapter 2')
end)

H.test('track_create refuses an empty or blank name and adds nothing', function()
  for _, name in ipairs({ '', '   ', '\n\t' }) do
    local s = new_session()
    s:send('track_create', 'c1', name)
    H.eq(s:events(), { { 'ERROR', 'c1', 'The new track needs a name.' } })
    H.eq(#s.fake.tracks, 2)
    H.eq(#s.fake.undo, 0)
  end
end)

H.test('track_create refuses while REAPER is recording, so no track appears in the middle of a take', function()
  local s = new_session()
  s.fake.play_state = 5
  s:send('track_create', 'c1', 'Chapter 2')
  H.eq(s:events(), { { 'ERROR', 'c1', 'REAPER is recording. Stop recording first.' } })
  H.eq(#s.fake.tracks, 2)
  H.eq(#s.fake.undo, 0)
end)

H.test('track_create works while REAPER plays: only a recording is refused', function()
  local s = new_session()
  s.fake.play_state = 1
  s:send('track_create', 'c1', 'Chapter 2')
  H.eq(s:events(), { { 'TRACK_CREATED', 'c1', NEW, '2', 'Chapter 2' } })
end)

H.test('track_create keeps emoji, right-to-left text and quotes in the name exactly', function()
  local s = new_session()
  local name = 'Chapter 7 \u{1F30A} "The Sea" \u{05D4}\u{05D9}\u{05DD} \u{0627}\u{0644}\u{0628}\u{062D}\u{0631} | 100%'
  s:send('track_create', 'c1', name)
  H.eq(s:events(), { { 'TRACK_CREATED', 'c1', NEW, '2', name } })
  H.eq(s.fake.tracks[3].name, name)
end)

H.test('track_create turns a line break inside the name into a space, and its answer stays one line of events.log', function()
  local s = new_session()
  s:send('track_create', 'c1', 'Chapter 2\nThe Storm\r\nPart\tOne')
  H.eq(s.fake.tracks[3].name, 'Chapter 2 The Storm Part One')
  local raw = H.read_text(s:path('events.log')) or ''
  local created = {}
  for _, line in ipairs(H.lines(raw)) do
    if line:match('^TRACK_CREATED|') then
      created[#created + 1] = line
    end
  end
  H.eq(#created, 1, 'one TRACK_CREATED line')
  H.eq(s:events(), { { 'TRACK_CREATED', 'c1', NEW, '2', 'Chapter 2 The Storm Part One' } })
end)

H.test('track_create is not idempotent: a second call with the same name adds a second track', function()
  local s = new_session()
  s:send('track_create', 'c1', 'Chapter 2')
  s:send('track_create', 'c2', 'Chapter 2')
  H.eq(s:events(), {
    { 'TRACK_CREATED', 'c1', NEW, '2', 'Chapter 2' },
    { 'TRACK_CREATED', 'c2', SECOND, '3', 'Chapter 2' },
  })
  H.eq(#s.fake.tracks, 4)
  H.eq(#s.fake.undo, 2)
end)

H.test('track_create in an empty project adds the first track at index 0', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  s:send('track_create', 'c1', 'Chapter 1')
  H.eq(s:events(), { { 'TRACK_CREATED', 'c1', '{00000001-0000-4000-8000-000000000001}', '0', 'Chapter 1' } })
end)

H.test('track_create changes no other track: selection, arms, mutes and names stay as they were', function()
  local s, first, pickups = new_session()
  first.selected, first.armed, pickups.muted = true, true, true
  s:send('track_create', 'c1', 'Chapter 2')
  H.eq({ first.name, first.selected, first.armed }, { 'Chapter 1', true, true })
  H.eq({ pickups.name, pickups.muted }, { 'Pickups', true })
end)

H.test('track_create never saves the project', function()
  local s = new_session()
  s:send('track_create', 'c1', 'Chapter 2')
  for _, call in ipairs(s.fake.calls) do
    H.truthy(call.name ~= 'Main_SaveProject' and call.name ~= 'Main_SaveProjectEx', 'the project was saved')
  end
end)

H.test('a failure that shows a non-ASCII name reads as ASCII, whatever the platform calls printable', function()
  -- Windows' %q left the Hebrew lead byte raw and escaped the next one, so the runner could not read the message (CI, quick-windows).
  local name = 'Chapter 7 \u{1F30A} \u{05D4}\u{05D9}\u{05DD} \u{0627}\u{0644}\u{0628}\u{062D}\u{0631}'
  local ok, message = pcall(H.eq, name, 'something else')
  H.eq(ok, false)
  H.eq(tostring(message):find('[\128-\255]'), nil)
  H.contains(tostring(message), '\\215\\157')
end)

-- A voice added inside a chapter's folder (docs/prds/booth-voice-tracks.prd.md, phase 3): track_create|run|name|parentGuid puts the new track after
-- the folder's last descendant as a direct child of the folder, and moves the folder depth changes so every folder still closes where it did
-- (REAPER 7.82, docs/research/2026-10-30-booth-sub-track-recording.md, section 6a, row 2). It records from the folder's first child's input.
local function depths(s)
  local out = {}
  for _, track in ipairs(s.fake.tracks) do
    out[#out + 1] = { track.name, track.folder_depth or 0 }
  end
  return out
end

local function folder_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local fake = s.fake
  local book = fake:add_track('Book')
  local folder = fake:add_track('Chapter 3')
  local narrator = fake:add_track('Narrator')
  local crowd = fake:add_track('Crowd')
  local guard = fake:add_track('Guard')
  local after = fake:add_track('After')
  book.folder_depth, folder.folder_depth, crowd.folder_depth, guard.folder_depth = 1, 1, 1, -3
  narrator.rec_input, narrator.rec_mode = 1024, 1
  return s, { book = book, folder = folder, narrator = narrator, crowd = crowd, guard = guard, after = after }
end

H.test('track_create with a parent adds a direct child after its last descendant and every folder still closes', function()
  local s, t = folder_session()
  s:send('track_create', 'c1', 'Veyra', t.folder.guid)
  local created = s:events()[1]
  H.eq({ created[1], created[4], created[5] }, { 'TRACK_CREATED', '5', 'Veyra' })
  H.eq(depths(s), {
    { 'Book', 1 },
    { 'Chapter 3', 1 },
    { 'Narrator', 0 },
    { 'Crowd', 1 },
    { 'Guard', -1 },
    { 'Veyra', -2 },
    { 'After', 0 },
  })
end)

H.test("track_create with a parent copies the record input and mode of the folder's first child", function()
  local s, t = folder_session()
  s:send('track_create', 'c1', 'Veyra', t.folder.guid)
  local added = s.fake.tracks[6]
  H.eq({ added.name, added.rec_input, added.rec_mode }, { 'Veyra', 1024, 1 })
end)

H.test('track_create with a parent that is not a folder makes it a folder with the new track as its one child', function()
  local s, t = folder_session()
  s:send('track_create', 'c1', 'Guard captain', t.narrator.guid)
  H.eq(depths(s), {
    { 'Book', 1 },
    { 'Chapter 3', 1 },
    { 'Narrator', 1 },
    { 'Guard captain', -1 },
    { 'Crowd', 1 },
    { 'Guard', -3 },
    { 'After', 0 },
  })
end)

H.test('track_create with a parent at the end of the project closes the folder on the new track', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local folder = s.fake:add_track('Chapter 1')
  local narrator = s.fake:add_track('Narrator')
  folder.folder_depth, narrator.folder_depth = 1, -1
  s:send('track_create', 'c1', 'Veyra', folder.guid)
  H.eq(depths(s), { { 'Chapter 1', 1 }, { 'Narrator', 0 }, { 'Veyra', -1 } })
end)

H.test("track_create with a parent is one undo point and changes no other track's name, arm or mute", function()
  local s, t = folder_session()
  t.after.armed, t.after.muted = true, true
  s:send('track_create', 'c1', 'Veyra', t.folder.guid)
  H.eq({ t.after.name, t.after.armed, t.after.muted }, { 'After', true, true })
  H.eq(#s.fake.undo, 1)
  H.eq(s.fake.undo[1].label, H.brand.name .. ': add track')
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('track_create with a parent that is gone answers TRACK_STALE and adds nothing', function()
  local s = folder_session()
  local before = #s.fake.tracks
  s:send('track_create', 'c1', 'Veyra', '{00000000-0000-4000-8000-0000000000DE}')
  H.eq(s:events(), { { 'TRACK_STALE', 'c1', '{00000000-0000-4000-8000-0000000000DE}' } })
  H.eq(#s.fake.tracks, before)
end)

H.test('track_create with a parent refuses while REAPER records and adds nothing', function()
  local s, t = folder_session()
  s.fake.play_state = 5
  local before = #s.fake.tracks
  s:send('track_create', 'c1', 'Veyra', t.folder.guid)
  H.eq(s:events(), { { 'ERROR', 'c1', 'REAPER is recording. Stop recording first.' } })
  H.eq(#s.fake.tracks, before)
end)

-- A chapter folder for a Voice folders project (#2840, part 2): track_create|run|name||childName appends, after every track, a folder named
-- name holding one child named childName (the Narrator), in one undo block, and answers TRACK_CREATED with the folder, then the child. A
-- folder left open at the end of the project is closed on its last track first, so the new folder is never nested inside the chapter before
-- it: that is the only depth change to a track that was there.
local FOLDER = '{00000003-0000-4000-8000-000000000003}'
local CHILD = '{00000004-0000-4000-8000-000000000004}'

local function snapshot(s)
  local out = {}
  for _, track in ipairs(s.fake.tracks) do
    out[#out + 1] = { track.guid, track.name, track.folder_depth or 0, track.selected or false, track.armed or false, track.muted or false }
  end
  return out
end

H.test('track_create with a child name appends a folder and its one child at the end and answers both', function()
  local s, first, pickups = new_session()
  s:send('track_create', 'c1', 'Chapter 2: The Storm', '', 'Narrator')
  H.eq(s:events(), { { 'TRACK_CREATED', 'c1', FOLDER, '2', 'Chapter 2: The Storm', CHILD, '3', 'Narrator' } })
  H.eq(s.fake.tracks[1], first)
  H.eq(s.fake.tracks[2], pickups)
  H.eq(depths(s), { { 'Chapter 1', 0 }, { 'Pickups', 0 }, { 'Chapter 2: The Storm', 1 }, { 'Narrator', -1 } })
end)

H.test('track_create of a folder inserts only after the last track', function()
  local s = new_session()
  s:send('track_create', 'c1', 'Chapter 2', '', 'Narrator')
  local inserts = {}
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'InsertTrackAtIndex' then
      inserts[#inserts + 1] = call.index
    end
  end
  H.eq(inserts, { 2, 3 })
end)

H.test('track_create of a folder leaves every track that was there as it was when every folder closes', function()
  local s, t = folder_session()
  t.book.selected, t.narrator.armed, t.after.muted = true, true, true
  local before = snapshot(s)
  s:send('track_create', 'c1', 'Chapter 4', '', 'Narrator')
  local after = snapshot(s)
  H.eq(#after, #before + 2)
  for index, row in ipairs(before) do
    H.eq(after[index], row)
  end
  H.eq({ after[#after - 1][2], after[#after - 1][3], after[#after][2], after[#after][3] }, { 'Chapter 4', 1, 'Narrator', -1 })
end)

H.test('track_create of a folder closes a folder left open at the end on its last track, and changes no other depth', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local fake = s.fake
  local ch7 = fake:add_track('Ch 7')
  fake:add_track('Narrator')
  local alice = fake:add_track('Alice')
  local ch8 = fake:add_track('Ch 8')
  fake:add_track('Narrator')
  fake:add_track('Queen')
  ch7.folder_depth, alice.folder_depth, ch8.folder_depth = 1, -1, 1
  s:send('track_create', 'c1', 'Chapter 9', '', 'Narrator')
  H.eq(depths(s), {
    { 'Ch 7', 1 },
    { 'Narrator', 0 },
    { 'Alice', -1 },
    { 'Ch 8', 1 },
    { 'Narrator', 0 },
    { 'Queen', -1 },
    { 'Chapter 9', 1 },
    { 'Narrator', -1 },
  })
end)

H.test('track_create of a folder closes two nested folders left open at the end', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local book, ch1 = s.fake:add_track('Book'), s.fake:add_track('Chapter 1')
  s.fake:add_track('Narrator')
  book.folder_depth, ch1.folder_depth = 1, 1
  s:send('track_create', 'c1', 'Chapter 2', '', 'Narrator')
  H.eq(depths(s), { { 'Book', 1 }, { 'Chapter 1', 1 }, { 'Narrator', -2 }, { 'Chapter 2', 1 }, { 'Narrator', -1 } })
end)

H.test('track_create of a folder in an empty project adds the folder at index 0 and its child at 1', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  s:send('track_create', 'c1', 'Chapter 1', '', 'Narrator')
  H.eq(s:events(), {
    { 'TRACK_CREATED', 'c1', '{00000001-0000-4000-8000-000000000001}', '0', 'Chapter 1', '{00000002-0000-4000-8000-000000000002}', '1', 'Narrator' },
  })
  H.eq(depths(s), { { 'Chapter 1', 1 }, { 'Narrator', -1 } })
end)

H.test('track_create of a folder is one undo point named for the app and leaves no block open', function()
  local s = new_session()
  s:send('track_create', 'c1', 'Chapter 2', '', 'Narrator')
  H.eq(#s.fake.undo, 1)
  H.eq(s.fake.undo[1].label, H.brand.name .. ': add track')
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('track_create of a folder refuses while REAPER records and changes nothing, not even an open folder', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local ch = s.fake:add_track('Ch 8')
  s.fake:add_track('Narrator')
  ch.folder_depth = 1
  s.fake.play_state = 5
  s:send('track_create', 'c1', 'Chapter 9', '', 'Narrator')
  H.eq(s:events(), { { 'ERROR', 'c1', 'REAPER is recording. Stop recording first.' } })
  H.eq(depths(s), { { 'Ch 8', 1 }, { 'Narrator', 0 } })
  H.eq(#s.fake.undo, 0)
end)

H.test('track_create of a folder refuses a blank folder name and adds nothing', function()
  local s = new_session()
  s:send('track_create', 'c1', '  ', '', 'Narrator')
  H.eq(s:events(), { { 'ERROR', 'c1', 'The new track needs a name.' } })
  H.eq(#s.fake.tracks, 2)
end)

H.test('track_create refuses both a parent and a child name, and adds nothing', function()
  local s, t = folder_session()
  local before = #s.fake.tracks
  s:send('track_create', 'c1', 'Chapter 4', t.folder.guid, 'Narrator')
  H.eq(s:events(), { { 'ERROR', 'c1', 'A new track goes inside a folder or makes a folder, not both.' } })
  H.eq(#s.fake.tracks, before)
  H.eq(#s.fake.undo, 0)
end)

H.test('track_create of a folder keeps emoji and right-to-left text in the folder name and cleans line breaks', function()
  local s = new_session()
  local name = 'Chapter 7 \u{1F30A} \u{05D4}\u{05D9}\u{05DD} \u{0627}\u{0644}\u{0628}\u{062D}\u{0631} | 100%'
  s:send('track_create', 'c1', name .. '\nPart\tOne', '', 'Narrator')
  H.eq(s.fake.tracks[3].name, name .. ' Part One')
  H.eq(s:events()[1][5], name .. ' Part One')
end)
