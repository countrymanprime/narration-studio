-- Playing a stretch of a file on disk and showing a file, leaving the project unchanged (narration_media_file.lua).
-- Master & QC measures rendered files that are not project items, so `navigate` cannot reach them: these commands
-- take the file's path instead, which the host sends only for a file the narrator picked. Neither inserts media,
-- opens an undo block or touches the project's transport, selection or items.
--
-- The SWS preview calls (CF_CreatePreview, CF_Preview_*) and OpenMediaExplorer are modelled in fake_reaper.lua from
-- their published reference text, not from a run in REAPER: what they do in REAPER is pending the QA pass (#1495).

local H = require('harness')

local function new_session(opts)
  opts = opts or {}
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local track = s.fake:add_track('Chapter 1')
  s.fake:add_item(track, { position = 0, length = 10, source = 'take.wav' })
  local folder = host.tmpdir()
  local path = H.join(folder, opts.name or 'Chapter 01.wav')
  H.write_file(path, 'RIFF....WAVE')
  s.fake.media_lengths[path] = opts.file_length or 120
  return s, path
end

-- What a command must leave as it was: the items, the undo history, the change count and the edit cursor.
local function project_state(s)
  return { items = #s.fake.items, undo = #s.fake.undo, change = s.fake.change_count, cursor = s.fake.cursor, play = s.fake.play_state }
end

-- preview_file_range ---------------------------------------------------------------------------------------------

H.test('preview_file_range plays the stretch through a preview and answers what it plays', function()
  local s, path = new_session()
  s:send('preview_file_range', 'p1', path, '12.5', '5')
  H.eq(s:events(), { { 'FILE_PREVIEW_STARTED', 'p1', path, '12.500000', '5.000000' } })
  H.eq(#s.fake.previews, 1)
  local preview = s.fake.previews[1]
  H.eq(preview.source.file, path)
  H.eq(preview.values.D_POSITION, 12.5)
  H.eq(preview.values.B_LOOP, 0)
  H.eq(preview.playing, true)
end)

H.test('preview_file_range leaves the project unchanged: no item, no undo point, no edit, no transport', function()
  local s, path = new_session()
  local before = project_state(s)
  s:send('preview_file_range', 'p1', path, '0', '5')
  H.eq(project_state(s), before)
  H.eq(s.fake:transport_calls(), {})
end)

H.test('preview_file_range stops the preview once it reaches the end of the stretch, and frees the source', function()
  local s, path = new_session()
  s:send('preview_file_range', 'p1', path, '10', '5')
  s:events()
  local preview = s.fake.previews[1]
  preview.values.D_POSITION = 14.9
  s:tick()
  H.eq(preview.stopped, false, 'still inside the stretch')
  preview.values.D_POSITION = 15
  s:tick()
  H.eq(preview.stopped, true, 'stopped at the end of the stretch')
  s:tick()
  H.eq(preview.source.destroyed, true, 'the source is freed the cycle after the stop')
  H.eq(s:events(), {}, 'the end of a preview is not an answer to anything')
end)

H.test('preview_file_range frees the source when the preview ends on its own', function()
  local s, path = new_session({ file_length = 6 })
  s:send('preview_file_range', 'p1', path, '4', '5')
  local preview = s.fake.previews[1]
  s.fake:finish_preview(preview)
  s:tick()
  s:tick()
  H.eq(preview.source.destroyed, true)
end)

H.test('preview_file_range shortens a stretch that runs past the end of the file', function()
  local s, path = new_session({ file_length = 8 })
  s:send('preview_file_range', 'p1', path, '6', '5')
  H.eq(s:events(), { { 'FILE_PREVIEW_STARTED', 'p1', path, '6.000000', '2.000000' } })
end)

H.test('preview_file_range refuses a stretch that starts at or after the end of the file', function()
  local s, path = new_session({ file_length = 8 })
  s:send('preview_file_range', 'p1', path, '8', '5')
  H.eq(s:events(), { { 'ERROR', 'p1', 'The stretch starts after the end of the file.' } })
  H.eq(#s.fake.previews, 0)
  H.eq(s.fake.sources_destroyed, 1, 'the source it opened to read the length is freed')
end)

H.test('a second preview stops the first one before it plays', function()
  local s, path = new_session()
  s:send('preview_file_range', 'p1', path, '0', '5')
  s:send('preview_file_range', 'p2', path, '30', '5')
  H.eq(s:events(), {
    { 'FILE_PREVIEW_STARTED', 'p1', path, '0.000000', '5.000000' },
    { 'FILE_PREVIEW_STARTED', 'p2', path, '30.000000', '5.000000' },
  })
  H.eq(s.fake.previews[1].stopped, true)
  H.eq(s.fake.previews[2].playing, true)
end)

H.test('preview_file_range refuses a start or length that is not a usable number of seconds', function()
  local s, path = new_session()
  for _, case in ipairs({ { '', '5' }, { 'x', '5' }, { '-1', '5' }, { 'nan', '5' }, { 'inf', '5' }, { '0', '0' }, { '0', '-2' }, { '0', '61' }, { '0', 'inf' } }) do
    s:send('preview_file_range', 'p1', path, case[1], case[2])
    H.eq(s:events(), { { 'ERROR', 'p1', 'The stretch to play is not a usable number of seconds.' } }, case[1] .. '/' .. case[2])
  end
  H.eq(#s.fake.previews, 0)
end)

H.test('preview_file_range refuses a path that is not an absolute local path to an audio file', function()
  local s, path = new_session()
  local text = H.join(host.tmpdir(), 'notes.txt')
  H.write_file(text, 'hello')
  local bad = { '', 'Chapter 01.wav', '\\\\server\\share\\Chapter 01.wav', '//server/share/Chapter 01.wav', path .. '/../Chapter 01.wav', text }
  for _, value in ipairs(bad) do
    s:send('preview_file_range', 'p1', value, '0', '5')
    H.eq(s:events(), { { 'ERROR', 'p1', 'That is not an audio file this app can play or show.' } }, value)
  end
  H.eq(#s.fake.previews, 0)
end)

H.test('preview_file_range refuses a file that is not there', function()
  local s = new_session()
  local gone = H.join(host.tmpdir(), 'Gone.wav')
  s:send('preview_file_range', 'p1', gone, '0', '5')
  H.eq(s:events(), { { 'ERROR', 'p1', 'The file is not there any more.' } })
  H.eq(#s.fake.previews, 0)
end)

H.test('preview_file_range refuses while REAPER is recording, and plays nothing', function()
  local s, path = new_session()
  s.fake.play_state = 5
  s:send('preview_file_range', 'p1', path, '0', '5')
  H.eq(s:events(), { { 'ERROR', 'p1', 'REAPER is recording. Stop recording first.' } })
  H.eq(#s.fake.previews, 0)
end)

H.test('preview_file_range without the SWS preview calls refuses and opens nothing', function()
  for _, name in ipairs({
    'CF_CreatePreview',
    'CF_Preview_SetValue',
    'CF_Preview_GetValue',
    'CF_Preview_Play',
    'CF_Preview_Stop',
    'GetMediaSourceLength',
    'PCM_Source_Destroy',
  }) do
    local s, path = new_session()
    s.fake:remove_api(name)
    s:send('preview_file_range', 'p1', path, '0', '5')
    H.eq(s:events(), { { 'ERROR', 'p1', 'Playing part of a file needs the SWS extension in REAPER.' } }, name)
    H.eq(#s.fake.previews, 0)
    H.eq(s.fake.sources_created, 0, name)
  end
end)

H.test('preview_file_range answers an error when REAPER cannot open the file', function()
  local s, path = new_session()
  s.fake.unreadable_sources[path] = true
  s:send('preview_file_range', 'p1', path, '0', '5')
  H.eq(s:events(), { { 'ERROR', 'p1', 'REAPER could not open the file to play it.' } })
  H.eq(#s.fake.previews, 0)
end)

-- stop_file_preview ----------------------------------------------------------------------------------------------

H.test('stop_file_preview stops the preview this bridge started and says it stopped one', function()
  local s, path = new_session()
  s:send('preview_file_range', 'p1', path, '0', '5')
  s:events()
  local before = project_state(s)
  s:send('stop_file_preview', 's1')
  H.eq(s:events(), { { 'FILE_PREVIEW_STOPPED', 's1', '1' } })
  H.eq(s.fake.previews[1].stopped, true)
  s:tick()
  H.eq(s.fake.previews[1].source.destroyed, true)
  H.eq(project_state(s), before)
end)

H.test('stop_file_preview with nothing playing changes nothing and says so (idempotent)', function()
  local s, path = new_session()
  s:send('stop_file_preview', 's1')
  H.eq(s:events(), { { 'FILE_PREVIEW_STOPPED', 's1', '0' } })
  s:send('preview_file_range', 'p1', path, '0', '5')
  s:send('stop_file_preview', 's2')
  s:send('stop_file_preview', 's3')
  H.eq(s:events(), {
    { 'FILE_PREVIEW_STARTED', 'p1', path, '0.000000', '5.000000' },
    { 'FILE_PREVIEW_STOPPED', 's2', '1' },
    { 'FILE_PREVIEW_STOPPED', 's3', '0' },
  })
end)

H.test('stop_file_preview after the preview reached its end says nothing was playing', function()
  local s, path = new_session()
  s:send('preview_file_range', 'p1', path, '0', '5')
  s.fake.previews[1].values.D_POSITION = 5
  s:tick()
  s:events()
  s:send('stop_file_preview', 's1')
  H.eq(s:events(), { { 'FILE_PREVIEW_STOPPED', 's1', '0' } })
end)

H.test('stop_file_preview never touches a preview another script started', function()
  local s = new_session()
  local other = s.fake.reaper.CF_CreatePreview(s.fake.reaper.PCM_Source_CreateFromFile('other.wav'))
  s.fake.reaper.CF_Preview_Play(other)
  s:send('stop_file_preview', 's1')
  H.eq(s:events(), { { 'FILE_PREVIEW_STOPPED', 's1', '0' } })
  H.eq(other.stopped, false)
end)

H.test('a preview still playing when the script ends is stopped and its source freed', function()
  local s, path = new_session()
  s:send('preview_file_range', 'p1', path, '0', '5')
  s.fake:exit()
  H.eq(s.fake.previews[1].stopped, true)
  H.eq(s.fake.previews[1].source.destroyed, true)
end)

-- reveal_file ----------------------------------------------------------------------------------------------------

H.test('reveal_file selects the file in the Media Explorer without playing or importing it', function()
  local s, path = new_session()
  local before = project_state(s)
  s:send('reveal_file', 'r1', path)
  H.eq(s:events(), { { 'FILE_REVEALED', 'r1', path } })
  local opened = {}
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'OpenMediaExplorer' then
      opened[#opened + 1] = { call.path, call.play }
    end
  end
  H.eq(opened, { { path, false } })
  H.eq(project_state(s), before)
  H.eq(s.fake.sources_created, 0, 'showing a file opens no source')
end)

H.test('reveal_file refuses a path that is not an absolute local path to an audio file, and a missing file', function()
  local s, path = new_session()
  for _, value in ipairs({ '', 'Chapter 01.wav', '\\\\server\\share\\a.wav', path .. '\\..\\a.wav' }) do
    s:send('reveal_file', 'r1', value)
    H.eq(s:events(), { { 'ERROR', 'r1', 'That is not an audio file this app can play or show.' } }, value)
  end
  s:send('reveal_file', 'r1', H.join(host.tmpdir(), 'Gone.wav'))
  H.eq(s:events(), { { 'ERROR', 'r1', 'The file is not there any more.' } })
  for _, call in ipairs(s.fake.calls) do
    H.truthy(call.name ~= 'OpenMediaExplorer', 'nothing was shown')
  end
end)

H.test('reveal_file on a REAPER without OpenMediaExplorer refuses', function()
  local s, path = new_session()
  s.fake:remove_api('OpenMediaExplorer')
  s:send('reveal_file', 'r1', path)
  H.eq(s:events(), { { 'ERROR', 'r1', 'This REAPER version cannot show a file in its Media Explorer.' } })
end)

H.test('a path that starts with a slash is refused where the separator is a backslash: on Windows it is relative to the drive', function()
  local s = new_session()
  local events = {}
  -- The feature file on its own, with Windows' separator and a core that records events and finds every file.
  local core = {
    SEP = '\\',
    file_exists = function()
      return true
    end,
    event = function(_, tag, run, ...)
      events[#events + 1] = { tag, run, ... }
    end,
  }
  local commands = {}
  assert(loadfile(H.join(host.reaper_dir, 'narration_media_file.lua')))(core)({
    register = function(name, handler)
      commands[name] = handler
    end,
  })
  commands.reveal_file({ session_dir = s.dir }, { 'r1', '/Renders/Chapter 01.wav' })
  commands.reveal_file({ session_dir = s.dir }, { 'r2', 'C:\\Renders\\Chapter 01.wav' })
  H.eq(events, { { 'ERROR', 'r1', 'That is not an audio file this app can play or show.' }, { 'FILE_REVEALED', 'r2', 'C:\\Renders\\Chapter 01.wav' } })
end)
