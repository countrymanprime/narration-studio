-- The live track list (narration_tracks_read.lua): tracks_read answers every track in the open project, in order, with its
-- GUID, name and folder depth change, as REAPER has them now, saved or not. The Chapter links table and the Link chapters
-- dialog read it so a track or folder added in REAPER shows before the project is saved (#2840). Read-only.

local H = require('harness')

local function new_session(path)
  local s = H.session({ project_path = path == nil and H.join(host.tmpdir(), 'Book.rpp') or path })
  return s
end

local function rows(events)
  local out = {}
  for _, event in ipairs(events) do
    if event[1] == 'TRACKS_ROW' then
      out[#out + 1] = { event[3], event[4], event[5], event[6] }
    end
  end
  return out
end

H.test('tracks_read needs the track and edit-counter APIs', function()
  for _, name in ipairs({ 'CountTracks', 'GetTrack', 'GetTrackGUID', 'GetProjectStateChangeCount' }) do
    local s = new_session()
    s.fake:add_track('Chapter 1')
    s.fake:remove_api(name)
    s:send('tracks_read', 'r1')
    H.eq(s:events(), { { 'ERROR', 'r1', 'This REAPER version cannot list its tracks.' } }, name)
  end
end)

H.test('tracks_read answers the project, then every track in order with its GUID, name and folder depth change, then the count', function()
  local path = H.join(host.tmpdir(), 'Book.rpp')
  local s = new_session(path)
  local opening = s.fake:add_track('Opening Credits')
  local folder = s.fake:add_track('Chapter 1')
  local narrator = s.fake:add_track('Narrator')
  local guard = s.fake:add_track('Guard')
  local after = s.fake:add_track('Chapter 2')
  folder.folder_depth, guard.folder_depth = 1, -1
  s.fake.change_count = 12
  s:send('tracks_read', 'r1')
  H.eq(s:events(), {
    { 'TRACKS_READ', 'r1', path, '0', '12' },
    { 'TRACKS_ROW', 'r1', '0', opening.guid, 'Opening Credits', '0' },
    { 'TRACKS_ROW', 'r1', '1', folder.guid, 'Chapter 1', '1' },
    { 'TRACKS_ROW', 'r1', '2', narrator.guid, 'Narrator', '0' },
    { 'TRACKS_ROW', 'r1', '3', guard.guid, 'Guard', '-1' },
    { 'TRACKS_ROW', 'r1', '4', after.guid, 'Chapter 2', '0' },
    { 'TRACKS_READ_END', 'r1', '5', '5' },
  })
end)

H.test('tracks_read lists a track added after an earlier read, without a save', function()
  local s = new_session()
  s.fake:add_track('Chapter 1')
  s:send('tracks_read', 'r1')
  H.eq(#rows(s:events()), 1)
  local added = s.fake:add_track('Chapter 2')
  s.fake.change_count = s.fake.change_count + 1
  s:send('tracks_read', 'r2')
  local events = s:events()
  H.eq(rows(events)[2], { '1', added.guid, 'Chapter 2', '0' })
  H.eq(events[1][5], '1', 'the change count the add raised')
end)

H.test('tracks_read answers an unsaved project with no path, and an empty project with no rows', function()
  local s = new_session('')
  s:send('tracks_read', 'r1')
  H.eq(s:events(), { { 'TRACKS_READ', 'r1', '', '1', '0' }, { 'TRACKS_READ_END', 'r1', '0', '0' } })
end)

H.test('tracks_read sends a name with a bar, a line break, emoji and right-to-left text whole', function()
  local s = new_session()
  local name = 'Ch 3 | "The Sea"\nהים 🌊 100%'
  local track = s.fake:add_track(name)
  s:send('tracks_read', 'r1')
  H.eq(rows(s:events()), { { '0', track.guid, name, '0' } })
end)

H.test('tracks_read answers an unnamed track with an empty name, not a made-up one', function()
  local s = new_session()
  local track = s.fake:add_track('')
  s:send('tracks_read', 'r1')
  H.eq(rows(s:events()), { { '0', track.guid, '', '0' } })
end)

H.test('tracks_read answers GUIDs in braces and upper case', function()
  local s = new_session()
  local track = s.fake:add_track('Chapter 1')
  track.guid = '{abcdef01-0000-4000-8000-000000000001}'
  s:send('tracks_read', 'r1')
  H.eq(rows(s:events())[1][2], '{ABCDEF01-0000-4000-8000-000000000001}')
end)

H.test('tracks_read stops listing at its limit and says how many tracks there were', function()
  local s = new_session()
  for index = 1, 2003 do
    s.fake:add_track('T' .. index)
  end
  s:send('tracks_read', 'r1')
  local events = s:events()
  H.eq(#events, 1 + 2000 + 1)
  H.eq(events[#events], { 'TRACKS_READ_END', 'r1', '2000', '2003' })
end)

H.test('tracks_read changes nothing: no undo point, no edit, the change count as it was, and the same answer twice', function()
  local s = new_session()
  local folder = s.fake:add_track('Chapter 1', true)
  local voice = s.fake:add_track('Narrator')
  folder.folder_depth, voice.folder_depth = 1, -1
  voice.armed = true
  s.fake.change_count = 4
  s:send('tracks_read', 'r1')
  local first = s:events()
  s:send('tracks_read', 'r1')
  H.eq(s:events(), first)
  H.eq(#s.fake.undo, 0)
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(s.fake.change_count, 4)
  H.eq(#s.fake.calls, 0, 'a read set something')
  H.eq({ folder.selected, voice.armed, folder.folder_depth, voice.folder_depth }, { true, true, 1, -1 })
end)
