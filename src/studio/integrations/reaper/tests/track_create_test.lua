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

-- The folder each track sits inside, by name ('' at the top level), from the running sum of the folder depths: what REAPER shows as its parent.
local function parents(s)
  local out, stack, depth = {}, {}, 0
  for _, track in ipairs(s.fake.tracks) do
    out[track.name] = stack[depth] or ''
    local delta = track.folder_depth or 0
    if delta > 0 then
      stack[depth + 1] = track.name
    end
    depth = math.max(depth + delta, 0)
  end
  return out
end

-- A project can end inside an open folder: REAPER 7.82 accepts a last track whose I_FOLDERDEPTH is 0 under a folder, and closes the folder at
-- the end (the real-REAPER scenario "track_create with no parent appends a chapter track at the top level after a folder"). A track appended
-- there without closing it lands inside that folder, so every chapter the app adds afterwards nests under the last chapter's folder (#2251).
H.test('track_create with no parent after a folder left open at the end adds the track at the top level, not inside the folder', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local chapter3 = s.fake:add_track('Chapter 3')
  s.fake:add_track('Narrator')
  chapter3.folder_depth = 1
  local before = parents(s)
  s:send('track_create', 'c1', 'Chapter 4')
  H.eq(s:events()[1][1], 'TRACK_CREATED')
  H.eq(depths(s), { { 'Chapter 3', 1 }, { 'Narrator', -1 }, { 'Chapter 4', 0 } })
  local after = parents(s)
  H.eq(after['Chapter 4'], '')
  for name, parent in pairs(before) do
    H.eq(after[name], parent)
  end
end)

H.test('track_create with no parent closes every folder left open at the end, however deep, on the last track', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local book = s.fake:add_track('Book')
  local chapter3 = s.fake:add_track('Chapter 3')
  s.fake:add_track('Narrator')
  book.folder_depth, chapter3.folder_depth = 1, 1
  s:send('track_create', 'c1', 'Chapter 4')
  H.eq(depths(s), { { 'Book', 1 }, { 'Chapter 3', 1 }, { 'Narrator', -2 }, { 'Chapter 4', 0 } })
  H.eq(parents(s)['Chapter 4'], '')
  H.eq(parents(s)['Narrator'], 'Chapter 3')
end)

H.test('track_create with no parent after closed folders changes no folder depth', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local chapter3 = s.fake:add_track('Chapter 3')
  local narrator = s.fake:add_track('Narrator')
  chapter3.folder_depth, narrator.folder_depth = 1, -1
  s:send('track_create', 'c1', 'Chapter 4')
  H.eq(depths(s), { { 'Chapter 3', 1 }, { 'Narrator', -1 }, { 'Chapter 4', 0 } })
end)

H.test('chapters added one after another after an open folder are all at the top level', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local chapter3 = s.fake:add_track('Chapter 3')
  s.fake:add_track('Narrator')
  chapter3.folder_depth = 1
  s:send('track_create', 'c1', 'Chapter 4')
  s:send('track_create', 'c2', 'Chapter 5')
  s:send('track_create', 'c3', 'Chapter 6')
  local after = parents(s)
  H.eq({ after['Chapter 4'], after['Chapter 5'], after['Chapter 6'], after['Narrator'] }, { '', '', '', 'Chapter 3' })
end)

H.test('track_create with a parent among sibling chapter folders adds only to that folder: no sibling changes parent', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local c3 = s.fake:add_track('Chapter 3')
  local n3 = s.fake:add_track('Narrator')
  local c4 = s.fake:add_track('Chapter 4')
  s.fake:add_track('C4 Narrator')
  local a4 = s.fake:add_track('C4 Alice')
  s.fake:add_track('Chapter 5')
  c3.folder_depth, n3.folder_depth, c4.folder_depth, a4.folder_depth = 1, -1, 1, -1
  local before = parents(s)
  s:send('track_create', 'c1', 'Veyra', c3.guid)
  local after = parents(s)
  H.eq(after['Veyra'], 'Chapter 3')
  for name, parent in pairs(before) do
    H.eq(after[name], parent)
  end
  H.eq(depths(s), {
    { 'Chapter 3', 1 },
    { 'Narrator', 0 },
    { 'Veyra', -1 },
    { 'Chapter 4', 1 },
    { 'C4 Narrator', 0 },
    { 'C4 Alice', -1 },
    { 'Chapter 5', 0 },
  })
end)

-- "Who is in Num N?" during a take (#2839): the Booth stops the take with record_stop, as its Stop press does, and only then adds the voice. The
-- take is kept as an item on the voice it recorded on, its own undo point, and the new track is a second point after it, so undoing the add
-- never takes the recording with it.
H.test('a voice added after record_stop keeps the take on its voice, in its own undo point before the add', function()
  local s, t = folder_session()
  t.narrator.armed = true
  s.fake.cursor = 12
  s:send('record_start', 'r1', t.narrator.guid)
  H.eq(s:events()[1][1], 'RECORD_STARTED')
  s.fake.play_position = 20
  -- The key's add, had it been sent during the take, is refused and adds nothing.
  s:send('track_create', 'c0', 'King of Hearts', t.folder.guid)
  H.eq(s:events(), { { 'ERROR', 'c0', 'REAPER is recording. Stop recording first.' } })
  H.eq(#s.fake.tracks, 6)
  s:send('record_stop', 's1')
  H.eq(s:events()[1][1], 'RECORD_STOPPED')
  H.eq(#t.narrator.items, 1, 'the take is an item on the voice it recorded on')
  s:send('track_create', 'c1', 'King of Hearts', t.folder.guid)
  local created = s:events()[1]
  H.eq({ created[1], created[4], created[5] }, { 'TRACK_CREATED', '5', 'King of Hearts' })
  H.eq(depths(s), {
    { 'Book', 1 },
    { 'Chapter 3', 1 },
    { 'Narrator', 0 },
    { 'Crowd', 1 },
    { 'Guard', -1 },
    { 'King of Hearts', -2 },
    { 'After', 0 },
  })
  H.eq(#t.narrator.items, 1, 'adding the voice left the take where it was')
  local labels = {}
  for _, point in ipairs(s.fake.undo) do
    labels[#labels + 1] = point.label
  end
  H.eq(labels[#labels], H.brand.name .. ': add track')
  H.eq(labels[#labels - 1], 'Recorded media')
  H.eq(s.fake.open_undo_blocks, 0)
end)
