-- The live state of REAPER and one track: chapter_track_state (narration_track_state.lua). Read-only: it reports the
-- transport, the edit counter, which tracks are armed, the named track's record input, REAPER's input device and the
-- track's items, and changes nothing.

local H = require('harness')

local CH1 = '{00000001-0000-4000-8000-000000000001}'

local function new_session(path)
  local s = H.session({ project_path = path == nil and H.join(host.tmpdir(), 'Book.rpp') or path })
  local chapter = s.fake:add_track('Chapter 1')
  local pickups = s.fake:add_track('Pickups')
  return s, chapter, pickups
end

local function tags(events)
  local out = {}
  for _, event in ipairs(events) do
    out[#out + 1] = event[1]
  end
  return out
end

H.test('chapter_track_state needs the transport and track APIs', function()
  for _, name in ipairs({ 'GetPlayPosition', 'CountTracks', 'GetProjectStateChangeCount' }) do
    local s, chapter = new_session()
    s.fake:remove_api(name)
    s:send('chapter_track_state', 't1', chapter.guid)
    H.eq(s:events(), { { 'ERROR', 't1', 'This REAPER version cannot report its transport and tracks.' } }, name)
  end
end)

H.test('chapter_track_state reports the transport, the project, the arms and the named track with no items', function()
  local path = H.join(host.tmpdir(), 'Book.rpp')
  local s, chapter, pickups = new_session(path)
  s.fake.cursor = 2.5
  s.fake.play_position = 1.25
  s.fake.change_count = 7
  chapter.armed = true
  pickups.armed = true
  chapter.rec_input = 1024
  s:send('chapter_track_state', 't1', chapter.guid)
  H.eq(s:events(), {
    { 'TRACK_STATE', 't1', CH1, '0', '2.500000', '1.250000', path, '0', '7', '1', '2', '1024', '', '', '' },
    { 'TRACK_STATE_END', 't1', '0', '0' },
  })
end)

H.test('chapter_track_state matches the track GUID without braces or case, and answers it normalised', function()
  local s, chapter = new_session()
  s:send('chapter_track_state', 't1', (chapter.guid:lower():gsub('[{}]', '')))
  H.eq(s:events()[1][3], CH1)
end)

-- The arm counts the Read Aloud bar reads: nothing armed, and the named track the
-- only one armed (several armed and another track armed are the tests above and below).
H.test('chapter_track_state reports nothing armed, and the named track as the only armed track', function()
  local s, chapter = new_session()
  s:send('chapter_track_state', 't1', chapter.guid)
  local none = s:events()[1]
  H.eq({ none[10], none[11] }, { '0', '0' }, 'nothing armed')
  chapter.armed = true
  s:send('chapter_track_state', 't2', chapter.guid)
  local only = s:events()[1]
  H.eq({ only[2], only[10], only[11] }, { 't2', '1', '1' }, 'the named track the only one armed')
end)

H.test('chapter_track_state reports an unsaved project, the named track not armed and REAPER input device', function()
  local s, chapter, pickups = new_session('')
  pickups.armed = true
  s.fake.audio_input = 'Focusrite USB ASIO'
  s:send('chapter_track_state', 't1', chapter.guid)
  local state = s:events()[1]
  H.eq({ state[7], state[8], state[10], state[11], state[13] }, { '', '1', '0', '1', 'Focusrite USB ASIO' })
end)

H.test('chapter_track_state reports the play state bits and the play position while recording', function()
  local s, chapter = new_session()
  s.fake.play_state = 5
  s.fake.play_position = 12.345678
  s:send('chapter_track_state', 't1', chapter.guid)
  local state = s:events()[1]
  H.eq({ state[4], state[6] }, { '5', '12.345678' })
end)

H.test('chapter_track_state lists every item on the named track with its active take, and no other track', function()
  local s, chapter, pickups = new_session()
  local first = s.fake:add_item(chapter, { position = 0, length = 4, source = 'C:\\Audio\\ch1|take 1.wav', guid = '{AAAAAAAA-0000-4000-8000-000000000001}' })
  local trimmed = s.fake:add_item(
    chapter,
    { position = 10, length = 3, source = 'ch1-b.wav', startoffs = 1.5, playrate = 1.25, guid = '{AAAAAAAA-0000-4000-8000-000000000002}' }
  )
  s.fake:add_item(pickups, { position = 1, length = 1, source = 'pickup.wav' })
  s:send('chapter_track_state', 't1', chapter.guid)
  H.eq(s:events(), {
    { 'TRACK_STATE', 't1', CH1, '0', '0.000000', '0.000000', s.fake.project_path, '0', '0', '0', '0', '0', '', '', '' },
    { 'TRACK_ITEM', 't1', first.guid, first.takes[1].guid, '0.000000', '4.000000', '0.000000', '1.000000', 'C:\\Audio\\ch1|take 1.wav', '0' },
    { 'TRACK_ITEM', 't1', trimmed.guid, trimmed.takes[1].guid, '10.000000', '3.000000', '1.500000', '1.250000', 'ch1-b.wav', '0' },
    { 'TRACK_STATE_END', 't1', '2', '2' },
  })
end)

H.test('chapter_track_state reports the take that is active, not the first one', function()
  local s, chapter = new_session()
  local item = s.fake:add_item(chapter, { position = 0, length = 2, source = 'one.wav' })
  local second = s.fake.reaper.AddTakeToMediaItem(item)
  second.source = { file = 'two.wav' }
  item.active_index = 2
  s:send('chapter_track_state', 't1', chapter.guid)
  local row = s:events()[2]
  H.eq({ row[4], row[9] }, { second.guid, 'two.wav' })
end)

H.test('chapter_track_state reports an item without a take with an empty take and source', function()
  local s, chapter = new_session()
  local item = s.fake:add_item(chapter, { position = 3, length = 1 })
  s:send('chapter_track_state', 't1', chapter.guid)
  H.eq(s:events()[2], { 'TRACK_ITEM', 't1', item.guid, '', '3.000000', '1.000000', '0.000000', '1.000000', '', '0' })
end)

H.test('chapter_track_state reports a muted item as muted, so a muted take is never read as the recording', function()
  -- The resume locate skips muted items as the saved .rpp's reading does; a take
  -- muted live and not saved yet is only known from this answer. The field is appended, so an older reader ignores it.
  local s, chapter = new_session()
  local kept = s.fake:add_item(chapter, { position = 0, length = 2, source = 'kept.wav' })
  local flubbed = s.fake:add_item(chapter, { position = 2, length = 2, source = 'flubbed.wav', muted = true })
  s:send('chapter_track_state', 't1', chapter.guid)
  local events = s:events()
  H.eq({ events[2][3], events[2][10] }, { kept.guid, '0' })
  H.eq({ events[3][3], events[3][10] }, { flubbed.guid, '1' })
end)

H.test('chapter_track_state stops listing items at its limit and says how many there were', function()
  local s, chapter = new_session()
  for index = 1, 1003 do
    s.fake:add_item(chapter, { position = index, length = 0.5, source = 'x.wav' })
  end
  s:send('chapter_track_state', 't1', chapter.guid)
  local events = s:events()
  H.eq(#events, 1 + 1000 + 1)
  H.eq(events[#events], { 'TRACK_STATE_END', 't1', '1000', '1003' })
end)

H.test('chapter_track_state with no track answers the transport and the arms, and lists nothing', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake:add_item(chapter, { position = 0, length = 1, source = 'a.wav' })
  s:send('chapter_track_state', 't1', '')
  H.eq(s:events(), {
    { 'TRACK_STATE', 't1', '', '0', '0.000000', '0.000000', s.fake.project_path, '0', '0', '0', '1', '', '', '', '' },
    { 'TRACK_STATE_END', 't1', '0', '0' },
  })
end)

H.test('chapter_track_state reports a track GUID that no longer resolves and never answers for another track', function()
  local s, chapter = new_session()
  chapter.armed = true
  s.fake:add_item(chapter, { position = 0, length = 1, source = 'a.wav' })
  s:send('chapter_track_state', 't1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}')
  H.eq(s:events(), { { 'TRACK_STALE', 't1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
end)

H.test('chapter_track_state changes nothing: no undo point, no selection, cursor or transport call', function()
  local s, chapter = new_session()
  local item = s.fake:add_item(chapter, { position = 0, length = 1, source = 'a.wav' })
  s.fake.cursor = 4
  s:send('chapter_track_state', 't1', chapter.guid)
  H.eq(tags(s:events()), { 'TRACK_STATE', 'TRACK_ITEM', 'TRACK_STATE_END' })
  H.eq(#s.fake.undo, 0)
  H.eq(s.fake.cursor, 4)
  H.eq(item.selected, false)
  H.eq(chapter.armed or false, false)
  for _, call in ipairs(s.fake.calls) do
    H.truthy(call.name ~= 'SetMediaTrackInfo_Value' and call.name ~= 'OnPlayButton' and call.name ~= 'OnStopButton', call.name .. ' was called')
  end
end)

H.test('chapter_track_state answers an empty input device when REAPER cannot say which one is open', function()
  local s, chapter = new_session()
  s.fake.audio_input = 'Some device'
  s.fake:remove_api('GetAudioDeviceInfo')
  s:send('chapter_track_state', 't1', chapter.guid)
  H.eq(s:events()[1][13], '')
end)

H.test("chapter_track_state reports the output device REAPER has open and the names of the track's input channels", function()
  local s, chapter = new_session()
  s.fake.audio_input = 'Focusrite USB ASIO'
  s.fake.audio_output = 'Speakers (Focusrite USB Audio)'
  s.fake.input_channels = { 'Mic/Line 1', 'Mic/Line 2', 'Inst 3' }
  chapter.rec_input = 1
  s:send('chapter_track_state', 't1', chapter.guid)
  local mono = s:events()[1]
  H.eq(
    { mono[12], mono[13], mono[14], mono[15] },
    { '1', 'Focusrite USB ASIO', 'Speakers (Focusrite USB Audio)', 'Mic/Line 2' },
    'a mono input names its channel'
  )
  chapter.rec_input = 1024
  s:send('chapter_track_state', 't2', chapter.guid)
  H.eq(s:events()[1][15], 'Mic/Line 1 / Mic/Line 2', 'a stereo input names its pair')
end)

H.test('chapter_track_state names no input channel for a track with no input, a MIDI input, a channel REAPER cannot name, or no track', function()
  local s, chapter = new_session()
  s.fake.input_channels = { 'In 1', 'In 2' }
  for _, case in ipairs({
    { -1, 'no input' },
    { 4096, 'MIDI (all devices, whose low bits are channel 0)' },
    { 5, 'a channel past the device' },
    { 1024 + 1, 'a pair past the device' },
  }) do
    chapter.rec_input = case[1]
    s:send('chapter_track_state', 't1', chapter.guid)
    H.eq(s:events()[1][15], '', case[2])
  end
  s:send('chapter_track_state', 't2', '')
  H.eq(s:events()[1][15], '', 'no track')
end)

H.test('chapter_track_state answers an empty output device and channel name when REAPER cannot say', function()
  local s, chapter = new_session()
  s.fake.audio_output = 'Speakers'
  s.fake.input_channels = { 'In 1' }
  chapter.rec_input = 0
  s.fake:remove_api('GetAudioDeviceInfo')
  s.fake:remove_api('GetInputChannelName')
  s:send('chapter_track_state', 't1', chapter.guid)
  local state = s:events()[1]
  H.eq({ state[14], state[15] }, { '', '' })
end)

-- The union read for a chapter linked to a folder of voices (docs/prds/booth-voice-tracks.prd.md, phase 2): with 'children', the folder's own items and
-- every item on its descendants, in track order, each TRACK_ITEM carrying its track's GUID as a last field. Descendants are the tracks after the folder
-- until its depth closes, read from I_FOLDERDEPTH.
local function voices_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local fake = s.fake
  local before = fake:add_track('Chapter 2')
  local folder = fake:add_track('Chapter 3')
  local narrator = fake:add_track('Narrator')
  local sub = fake:add_track('Crowd')
  local crowd = fake:add_track('Guard')
  local veyra = fake:add_track('Veyra')
  local after = fake:add_track('Chapter 4')
  folder.folder_depth, sub.folder_depth, crowd.folder_depth, veyra.folder_depth = 1, 1, -1, -1
  fake:add_item(before, { position = 0, length = 5, source = 'ch2.wav' })
  fake:add_item(narrator, { position = 0, length = 4, source = 'narrator.wav' })
  fake:add_item(crowd, { position = 4, length = 1, source = 'guard.wav' })
  fake:add_item(veyra, { position = 5, length = 2, source = 'veyra.wav' })
  fake:add_item(after, { position = 0, length = 5, source = 'ch4.wav' })
  return s, { folder = folder, narrator = narrator, sub = sub, crowd = crowd, veyra = veyra, after = after, before = before }
end

H.test('chapter_track_state with children lists the items on every descendant of a folder, each with its track, and none after the folder', function()
  local s, t = voices_session()
  s:send('chapter_track_state', 't1', t.folder.guid, 'children')
  local events = s:events()
  H.eq(events[1][3], t.folder.guid, "the state is the folder's")
  local rows = {}
  for _, event in ipairs(events) do
    if event[1] == 'TRACK_ITEM' then
      rows[#rows + 1] = { event[9], event[11] }
    end
  end
  H.eq(rows, { { 'narrator.wav', t.narrator.guid }, { 'guard.wav', t.crowd.guid }, { 'veyra.wav', t.veyra.guid } })
  H.eq(events[#events], { 'TRACK_STATE_END', 't1', '3', '3' })
end)

H.test('chapter_track_state with children on an empty folder (voices with no items, or no voices at all) lists nothing and is not stale', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local folder = s.fake:add_track('Chapter 1')
  local voice = s.fake:add_track('Narrator')
  local last = s.fake:add_track('Chapter 2')
  folder.folder_depth, voice.folder_depth = 1, -1
  s:send('chapter_track_state', 't1', folder.guid, 'children')
  local events = s:events()
  H.eq(events[1][3], folder.guid, "the state is the folder's, not a stale answer")
  H.eq(events[#events], { 'TRACK_STATE_END', 't1', '0', '0' })
  -- A folder opened on the very last track has no voices inside it.
  last.folder_depth = 1
  s:send('chapter_track_state', 't2', last.guid, 'children')
  events = s:events()
  H.eq(events[1][3], last.guid)
  H.eq(events[#events], { 'TRACK_STATE_END', 't2', '0', '0' })
end)

H.test("chapter_track_state with children includes the folder's own items first", function()
  local s, t = voices_session()
  s.fake:add_item(t.folder, { position = 9, length = 1, source = 'folder.wav' })
  s:send('chapter_track_state', 't1', t.folder.guid, 'children')
  local row = s:events()[2]
  H.eq({ row[1], row[9], row[11] }, { 'TRACK_ITEM', 'folder.wav', t.folder.guid })
end)

H.test('chapter_track_state with children on a track that is not a folder lists its own items, with its track', function()
  local s, t = voices_session()
  s:send('chapter_track_state', 't1', t.before.guid, 'children')
  local events = s:events()
  H.eq(#events, 3)
  H.eq({ events[2][9], events[2][11] }, { 'ch2.wav', t.before.guid })
end)

H.test('chapter_track_state with children on a child track lists only that child and its own descendants', function()
  local s, t = voices_session()
  s:send('chapter_track_state', 't1', t.sub.guid, 'children')
  local events = s:events()
  H.eq({ events[2][9], events[2][11], events[3][1] }, { 'guard.wav', t.crowd.guid, 'TRACK_STATE_END' })
end)

H.test('chapter_track_state without children is unchanged on a folder: its own items only, with no track field', function()
  local s, t = voices_session()
  s:send('chapter_track_state', 't1', t.folder.guid)
  H.eq(s:events()[2], { 'TRACK_STATE_END', 't1', '0', '0' })
end)

H.test('chapter_track_state refuses an unknown read option and lists nothing', function()
  local s, t = voices_session()
  s:send('chapter_track_state', 't1', t.folder.guid, 'everything')
  H.eq(s:events(), { { 'ERROR', 't1', 'Unknown track read option: everything.' } })
end)

H.test('chapter_track_state with none answers the state row and the item total, and lists no item', function()
  local s, chapter = new_session()
  s.fake:add_item(chapter, { position = 0, length = 4, source = 'a.wav' })
  s.fake:add_item(chapter, { position = 5, length = 4, source = 'b.wav' })
  s:send('chapter_track_state', 't1', chapter.guid, 'none')
  local events = s:events()
  H.eq(#events, 2)
  H.eq(events[1], { 'TRACK_STATE', 't1', CH1, '0', '0.000000', '0.000000', s.fake.project_path, '0', '0', '0', '0', '0', '', '', '' })
  H.eq(events[2], { 'TRACK_STATE_END', 't1', '0', '2' })
end)

H.test('chapter_track_state with none reads no item, so its cost does not grow with the takes', function()
  local s, chapter = new_session()
  for index = 1, 1003 do
    s.fake:add_item(chapter, { position = index, length = 0.5, source = 'x.wav' })
  end
  local item_reads, original = 0, reaper.GetTrackMediaItem
  reaper.GetTrackMediaItem = function(...)
    item_reads = item_reads + 1
    return original(...)
  end
  s:send('chapter_track_state', 't1', chapter.guid, 'none')
  reaper.GetTrackMediaItem = original
  H.eq(s:events()[2], { 'TRACK_STATE_END', 't1', '0', '1003' })
  H.eq(item_reads, 0)
end)

H.test('chapter_track_state with none and a track that is gone answers TRACK_STALE, and with no track the transport only', function()
  local s, chapter = new_session()
  s:send('chapter_track_state', 't1', '{00000000-0000-4000-8000-0000000000DE}', 'none')
  H.eq(s:events(), { { 'TRACK_STALE', 't1', '{00000000-0000-4000-8000-0000000000DE}' } })
  s:send('chapter_track_state', 't2', '', 'none')
  local events = s:events()
  H.eq(events[#events], { 'TRACK_STATE_END', 't2', '0', '0' })
end)

H.test('chapter_track_state with children counts the limit over the whole folder', function()
  local s, t = voices_session()
  for index = 1, 600 do
    s.fake:add_item(t.narrator, { position = 10 + index, length = 1, source = 'n.wav' })
    s.fake:add_item(t.veyra, { position = 10 + index, length = 1, source = 'v.wav' })
  end
  s:send('chapter_track_state', 't1', t.folder.guid, 'children')
  local events = s:events()
  H.eq(events[#events], { 'TRACK_STATE_END', 't1', '1000', '1203' })
end)

H.test('chapter_track_state with children on a track that is gone answers TRACK_STALE and lists nothing', function()
  local s = voices_session()
  s:send('chapter_track_state', 't1', '{00000000-0000-4000-8000-0000000000DE}', 'children')
  H.eq(s:events(), { { 'TRACK_STALE', 't1', '{00000000-0000-4000-8000-0000000000DE}' } })
end)

H.test('chapter_track_state with children answers the same twice and changes nothing', function()
  local s, t = voices_session()
  s:send('chapter_track_state', 't1', t.folder.guid, 'children')
  local first = s:events()
  s:send('chapter_track_state', 't1', t.folder.guid, 'children')
  H.eq(s:events(), first)
  H.eq(#s.fake.calls, 0, 'a read set something')
end)

H.test('chapter_track_state with children and no track answers the transport only', function()
  local s = voices_session()
  s:send('chapter_track_state', 't1', '', 'children')
  local events = s:events()
  H.eq({ events[1][1], events[1][3], events[2][1], events[2][3], events[2][4] }, { 'TRACK_STATE', '', 'TRACK_STATE_END', '0', '0' })
end)
