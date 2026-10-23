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
  H.eq(s.fake.undo[1].label, 'Narration Studio: add track')
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
