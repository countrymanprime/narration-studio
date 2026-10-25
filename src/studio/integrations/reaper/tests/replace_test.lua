-- replace_range and restore_replacement (narration_replace.lua, docs/reference/daw/capabilities.md#replace_range): put a
-- stretch of another narrator's audio, on its own track in the project, in place of a range of the narrator's words, and
-- take it back out. The narrator's piece goes to the muted Cuts track, as delete_range's does, and the later audio on the
-- track moves by the difference in length. Nothing is deleted but the app's own new item on a put-back.

local H = require('harness')

local PREFIX = H.brand.identity.reaperExtPrefix
local REPLACE_LABEL = H.brand.name .. ': replace audio'
local RESTORE_LABEL = H.brand.name .. ': put audio back'
local CUTS_KEY = PREFIX .. 'cuts'
local REPLACEMENT_KEY = PREFIX .. 'replacement'
local REPLACEMENT_CUT_KEY = PREFIX .. 'replacement_cut'
local REPLACEMENT_SEAMS_KEY = PREFIX .. 'replacement_seams'
local REPLACED_BY_KEY = PREFIX .. 'replaced_by'
local ID = 'r-0001'

-- The narrator's chapter track (an intro at 0-8, the item the words are in at 10-30, a later item at 32-37) and the
-- co-narrator's track holding their whole file (0-200, from 2 s into the file).
local function project()
  local s = H.session()
  local chapter = s.fake:add_track('Chapter 1')
  local theirs = s.fake:add_track('Eric Leach')
  local intro = s.fake:add_item(chapter, { position = 0, length = 8, source = 'intro.wav' })
  local item = s.fake:add_item(chapter, { position = 10, length = 20, source = 'ch1.wav', fadein = 0.5, fadeout = 0.25 })
  local later = s.fake:add_item(chapter, { position = 32, length = 5, source = 'ch1-b.wav' })
  local source = s.fake:add_item(theirs, { position = 0, length = 200, source = 'leach_01.mp3', startoffs = 2 })
  s.fake.calls = {}
  return s, { chapter = chapter, theirs = theirs, intro = intro, item = item, later = later, source = source }
end

local function span(item)
  return { item.position, item.length }
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

local function cuts_track(s)
  for _, track in ipairs(s.fake.tracks) do
    if track.ext and track.ext[CUTS_KEY] then
      return track
    end
  end
  return nil
end

local function by_guid(s, guid)
  for _, item in ipairs(s.fake.items) do
    if item.guid == guid then
      return item
    end
  end
  return nil
end

-- The narrator's words 14-16 (2 s) replaced by their 164.2-167.2 (3 s): their read is 1 s longer.
local function replace(s, p, run, tail)
  s:send('replace_range', run or 'r1', p.item.guid, '14', '16', p.source.guid, tail or '164.2|167.2|10|-3.5|' .. ID)
end

local function unchanged(s, tracks, items)
  H.eq(#s.fake.tracks, tracks, 'no track is added')
  H.eq(#s.fake.items, items, 'no item is added or removed')
  H.eq(calls_named(s, 'SplitMediaItem'), 0, 'nothing is split')
  H.eq(calls_named(s, 'MoveMediaItemToTrack'), 0, 'nothing is moved')
  H.eq(calls_named(s, 'AddMediaItemToTrack'), 0, 'no item is added')
  H.eq(calls_named(s, 'SetMediaItemInfo_Value'), 0, 'no item value is set')
  H.eq(#s.fake.undo, 0, 'no undo point')
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(s.fake.sources_created, s.fake.sources_destroyed, 'no source is left open')
end

local function refused(s, p, sentence, item, start, finish, source, tail)
  local tracks, items = #s.fake.tracks, #s.fake.items
  s:send('replace_range', 'r1', item or p.item.guid, start or '14', finish or '16', source or p.source.guid, tail or '164.2|167.2|10|0|' .. ID)
  H.eq(s:events(), { { 'ERROR', 'r1', sentence } })
  unchanged(s, tracks, items)
  H.eq(span(p.item), { 10, 20 })
end

-- 1. replace-moves-mine-to-cuts-and-lays-theirs -------------------------------------------------------------------

H.test('replace-moves-mine-to-cuts-and-lays-theirs: the narrator piece is parked on Cuts and their stretch plays in its place', function()
  local s, p = project()
  replace(s, p)
  local events = s:events()
  H.eq(#events, 1)
  local cuts = cuts_track(s)
  H.truthy(cuts, 'a Cuts track exists')
  H.eq(cuts.muted, true, 'the Cuts track is muted')
  H.eq(#cuts.items, 1)
  local cut = cuts.items[1]
  H.eq(span(cut), { 14, 2 }, 'the narrator piece keeps its time on the Cuts track')
  H.eq(cut.takes[1].source.file, 'ch1.wav')
  H.eq(cut.takes[1].startoffs, 4)
  H.eq(cut.ext[REPLACED_BY_KEY], ID, 'the parked piece names the replacement')
  H.eq(span(p.item), { 10, 4 }, 'the left piece keeps the item and its GUID')

  local new = p.chapter.items[3]
  H.eq(events[1], { 'RANGE_REPLACED', 'r1', new.guid, cut.guid, p.item.guid, '1.000000', '1' })
  H.eq(span(new), { 14, 3 }, 'their stretch starts where the words did and lasts as long as their read')
  local take = new.takes[1]
  H.eq(take.source.file, 'leach_01.mp3', 'it plays their file, read from their item in the project')
  H.eq(take.startoffs, 166.2, 'from their item offset plus the stretch start into the item')
  H.truthy(math.abs(take.vol - 10 ^ (-3.5 / 20)) < 1e-9, 'at the level change asked for, as the take volume')
  H.eq(new.ext[REPLACEMENT_KEY], ID)
  H.eq(new.ext[REPLACEMENT_CUT_KEY], cut.guid)

  local right = p.chapter.items[4]
  H.eq(right.takes[1].source.file, 'ch1.wav')
  H.eq(span(right), { 17, 14 }, 'the right piece follows their read: moved 1 s later')
  H.eq(right.takes[1].startoffs, 6, 'and still plays the audio after the words')
  H.eq(new.ext[REPLACEMENT_SEAMS_KEY], p.item.guid .. ' ' .. right.guid)
  H.eq(span(p.later), { 33, 5 }, 'a later item on the track moves by the same 1 s')
  H.eq(span(p.intro), { 0, 8 }, 'an earlier item does not move')
  H.eq(span(p.source), { 0, 200 }, 'their item is not touched')
  H.truthy(p.theirs.items[1] == p.source, 'and stays on their track')

  H.eq(p.item.fadeout, 0.01, 'the left seam fades out')
  H.eq(new.fadein, 0.01, 'their stretch fades in')
  H.eq(new.fadeout, 0.01, 'and out')
  H.eq(right.fadein, 0.01, 'the right seam fades in')
  H.eq(s.fake:undo_labels(), { REPLACE_LABEL }, 'one undo block')
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(calls_named(s, 'AddMediaItemToTrack'), 1)
end)

H.test('a shorter read closes the gap: the later audio moves up by the difference', function()
  local s, p = project()
  replace(s, p, 'r1', '164.2|165.2|0|0|' .. ID)
  local new = p.chapter.items[3]
  local events = s:events()
  H.eq(events[1][6], '-1.000000')
  H.eq(span(new), { 14, 1 })
  H.eq(span(p.chapter.items[4]), { 15, 14 })
  H.eq(span(p.later), { 31, 5 })
  H.eq(new.takes[1].vol, 1, 'a 0 dB change keeps the take at unity')
  H.eq(new.fadein, 0, 'a 0 ms fade sets none')
end)

H.test('words at the start of the item: no left piece, the item itself is parked, and the answer names no left piece', function()
  local s, p = project()
  s:send('replace_range', 'r1', p.item.guid, '10', '12', p.source.guid, '164.2|166.2|10|0|' .. ID)
  local events = s:events()
  local cut = cuts_track(s).items[1]
  H.truthy(cut == p.item, 'the item is the parked piece')
  H.eq(events[1][5], '', 'no left piece')
  local new = by_guid(s, events[1][3])
  H.eq(span(new), { 10, 2 })
  H.eq(new.ext[REPLACEMENT_SEAMS_KEY], '- ' .. p.chapter.items[3].guid)
end)

H.test('words to the end of the item: no right piece, and the next item still moves by the difference', function()
  local s, p = project()
  s:send('replace_range', 'r1', p.item.guid, '25', '30', p.source.guid, '100|104|10|0|' .. ID)
  local new = by_guid(s, s:events()[1][3])
  H.eq(span(new), { 25, 4 })
  H.eq(new.ext[REPLACEMENT_SEAMS_KEY], p.item.guid .. ' -')
  H.eq(span(p.later), { 31, 5 }, 'the next line moves 1 s earlier')
end)

H.test('their item at a changed playback rate: the stretch plays at that rate from the right place in the file', function()
  local s, p = project()
  p.source.takes[1].playrate = 2
  replace(s, p, 'r1', '10|12|0|0|' .. ID)
  local take = p.chapter.items[3].takes[1]
  H.eq(take.playrate, 2)
  H.eq(take.startoffs, 22, 'offset 2 s plus 10 s of their item at twice the speed')
end)

-- 2. refusals change nothing ---------------------------------------------------------------------------------------

H.test('a range, a stretch, a fade, a level or a name out of shape is refused before anything changes', function()
  local s, p = project()
  local tail = function(a, b, fade, gain, id)
    return table.concat({ a, b, fade, gain, id }, '|')
  end
  refused(s, p, 'The words to replace are not a usable pair of times.', nil, '16', '14')
  refused(s, p, 'The words to replace are not a usable pair of times.', nil, 'nan', '16')
  refused(s, p, 'The stretch of their audio is not a usable pair of times.', nil, nil, nil, nil, tail('167.2', '164.2', '10', '0', ID))
  refused(s, p, 'The stretch of their audio is not a usable pair of times.', nil, nil, nil, nil, tail('inf', '164.2', '10', '0', ID))
  refused(s, p, 'The fade must be a whole number of milliseconds from 0 to 500.', nil, nil, nil, nil, tail('164.2', '167.2', '501', '0', ID))
  refused(s, p, 'The fade must be a whole number of milliseconds from 0 to 500.', nil, nil, nil, nil, tail('164.2', '167.2', '1.5', '0', ID))
  refused(s, p, 'The level change must be from -24 to 24 dB.', nil, nil, nil, nil, tail('164.2', '167.2', '10', '24.5', ID))
  refused(s, p, 'The level change must be from -24 to 24 dB.', nil, nil, nil, nil, tail('164.2', '167.2', '10', 'loud', ID))
  refused(s, p, 'The replacement has no usable name.', nil, nil, nil, nil, tail('164.2', '167.2', '10', '0', ''))
  refused(s, p, 'The replacement has no usable name.', nil, nil, nil, nil, tail('164.2', '167.2', '10', '0', 'r 1'))
  refused(s, p, 'The replacement has no usable name.', nil, nil, nil, nil, '164.2|167.2|10|0|' .. ID .. '|extra')
  refused(s, p, 'The replacement has no usable name.', nil, nil, nil, nil, '164.2|167.2')
end)

H.test('a narrator item or their item that no longer resolves answers ITEM_STALE and changes nothing', function()
  local s, p = project()
  local gone = '{FFFFFFFF-0000-4000-8000-00000000FFFF}'
  s:send('replace_range', 'r1', gone, '14', '16', p.source.guid, '164.2|167.2|10|0|' .. ID)
  H.eq(s:events(), { { 'ITEM_STALE', 'r1', gone, 'item' } })
  s:send('replace_range', 'r2', p.item.guid, '14', '16', gone, '164.2|167.2|10|0|' .. ID)
  H.eq(s:events(), { { 'ITEM_STALE', 'r2', gone, 'source' } })
  unchanged(s, 2, 4)
end)

H.test('a range outside either item, a neighbour over the words, or their audio on the same track is refused', function()
  local s, p = project()
  refused(s, p, 'The words to replace are not inside that item.', nil, '28', '31')
  refused(s, p, 'The stretch of their audio is not inside their item.', nil, nil, nil, nil, '199|201|10|0|' .. ID)
  local mine = s.fake:add_item(p.chapter, { position = 40, length = 5, source = 'ch1-c.wav' })
  s.fake.calls = {}
  refused(s, p, 'Their audio must be on its own track, not on the track being changed.', nil, nil, nil, mine.guid, '40|41|10|0|' .. ID)
  s.fake:add_item(p.chapter, { position = 15, length = 1, source = 'pickup.wav' })
  s.fake.calls = {}
  refused(s, p, 'Another item on the track overlaps the words to replace, so nothing changed.')
end)

H.test('their item on the Cuts track, an item with no audio, and a MIDI item are refused', function()
  local s, p = project()
  local cuts = s.fake:add_track('Cuts')
  cuts.ext[CUTS_KEY] = '1'
  local parked = s.fake:add_item(cuts, { position = 0, length = 10, source = 'old.wav' })
  local empty = s.fake:add_item(p.theirs, { position = 300, length = 10 })
  local midi = s.fake:add_item(p.theirs, { position = 400, length = 10, midi = true })
  s.fake.calls = {}
  refused(s, p, 'Their audio is on the Cuts track. Choose their audio on its own track.', nil, nil, nil, parked.guid, '1|2|10|0|' .. ID)
  refused(s, p, 'Their item has no audio to use.', nil, nil, nil, empty.guid, '301|302|10|0|' .. ID)
  refused(s, p, 'Their item has no audio to use.', nil, nil, nil, midi.guid, '401|402|10|0|' .. ID)
  refused(s, p, 'That audio is already on the Cuts track.', parked.guid, '1', '2', nil, '164.2|167.2|10|0|' .. ID)
end)

H.test('words already replaced are refused until the narrator puts their audio back', function()
  local s, p = project()
  replace(s, p)
  local new = p.chapter.items[3]
  s:events()
  s.fake.calls = {}
  local undo = #s.fake.undo
  s:send('replace_range', 'r2', new.guid, '14.5', '15', p.source.guid, '10|11|0|0|r-0002')
  H.eq(s:events(), { { 'ERROR', 'r2', 'Those words are already replaced. Put your audio back first.' } })
  H.eq(#s.fake.undo, undo)
  H.eq(calls_named(s, 'SplitMediaItem'), 0)
end)

H.test('REAPER that cannot open their file, records, or lacks a call refuses with nothing changed', function()
  local s, p = project()
  s.fake.unreadable_sources['leach_01.mp3'] = true
  refused(s, p, 'REAPER could not open their audio.')
  s.fake.unreadable_sources['leach_01.mp3'] = nil
  s.fake.play_state = 5
  refused(s, p, 'REAPER is recording. Stop recording first.')
  s.fake.play_state = 0
  s.fake:remove_api('PCM_Source_CreateFromFile')
  refused(s, p, 'This REAPER version cannot replace audio.')
end)

-- 3. restore_replacement -------------------------------------------------------------------------------------------

H.test('put-my-audio-back: their stretch is removed, the narrator piece returns, the later audio moves back, one undo block', function()
  local s, p = project()
  replace(s, p)
  local events = s:events()
  local new_guid, cut_guid = events[1][3], events[1][4]
  s.fake.calls = {}
  s:send('restore_replacement', 'p1', new_guid, ID)
  H.eq(s:events(), { { 'REPLACEMENT_RESTORED', 'p1', cut_guid, '-1.000000', '1' } })
  H.eq(by_guid(s, new_guid), nil, 'the app own new item is removed')
  local back = by_guid(s, cut_guid)
  H.truthy(back.track == p.chapter, 'the narrator piece is back on the chapter track')
  H.eq(span(back), { 14, 2 })
  H.eq(back.ext[REPLACED_BY_KEY], '', 'and no longer names the replacement')
  H.eq(#cuts_track(s).items, 0)
  H.eq(span(p.item), { 10, 4 })
  local right = p.chapter.items[4]
  H.eq(right.takes[1].startoffs, 6)
  H.eq(span(right), { 16, 14 }, 'the right piece is back where it was')
  H.eq(span(p.later), { 32, 5 }, 'and so is the next line')
  H.eq(p.item.fadeout, 0, 'the seams the replacement faded are joined with no fade')
  H.eq(back.fadein, 0)
  H.eq(back.fadeout, 0)
  H.eq(right.fadein, 0)
  H.eq(p.source.position, 0, 'their item is not touched')
  H.eq(s.fake:undo_labels(), { REPLACE_LABEL, RESTORE_LABEL })
end)

H.test('put back after the narrator moved the replacement: the narrator piece goes where the replacement is now', function()
  local s, p = project()
  replace(s, p)
  local events = s:events()
  local new = by_guid(s, events[1][3])
  for _, item in ipairs({ new, p.chapter.items[4], p.later }) do
    item.position = item.position + 5
  end
  s:send('restore_replacement', 'p1', new.guid, ID)
  H.eq(s:events()[1][1], 'REPLACEMENT_RESTORED')
  H.eq(span(by_guid(s, events[1][4])), { 19, 2 })
  H.eq(span(p.later), { 37, 5 })
end)

H.test('a put-back of an item that is gone, not this replacement, or whose piece left Cuts is refused with nothing changed', function()
  local s, p = project()
  replace(s, p)
  local events = s:events()
  local new_guid, cut_guid = events[1][3], events[1][4]
  s.fake.calls = {}
  local undo = #s.fake.undo
  s:send('restore_replacement', 'p1', new_guid, 'r-9999')
  H.eq(s:events(), { { 'ITEM_STALE', 'p1', new_guid, 'replacement' } })
  s:send('restore_replacement', 'p2', p.item.guid, ID)
  H.eq(s:events(), { { 'ITEM_STALE', 'p2', p.item.guid, 'replacement' } })
  local cut = by_guid(s, cut_guid)
  cut.track = p.theirs
  table.remove(cuts_track(s).items, 1)
  p.theirs.items[#p.theirs.items + 1] = cut
  s:send('restore_replacement', 'p3', new_guid, ID)
  H.eq(s:events(), { { 'ITEM_STALE', 'p3', cut_guid, 'cut' } })
  s:send('restore_replacement', 'p4', '', ID)
  H.eq(s:events(), { { 'ITEM_STALE', 'p4', '', 'item' } })
  s:send('restore_replacement', 'p5', new_guid, '')
  H.eq(s:events(), { { 'ERROR', 'p5', 'The replacement has no usable name.' } })
  H.eq(#s.fake.undo, undo, 'no undo point')
  H.eq(calls_named(s, 'DeleteTrackMediaItem'), 0)
  H.eq(calls_named(s, 'MoveMediaItemToTrack'), 0)
end)

H.test('a second put-back of the same replacement finds nothing to put back and changes nothing', function()
  local s, p = project()
  replace(s, p)
  local new_guid = s:events()[1][3]
  s:send('restore_replacement', 'p1', new_guid, ID)
  s:events()
  local undo = #s.fake.undo
  s:send('restore_replacement', 'p2', new_guid, ID)
  H.eq(s:events(), { { 'ITEM_STALE', 'p2', new_guid, 'item' } })
  H.eq(#s.fake.undo, undo)
end)

H.test('a put-back while REAPER records is refused', function()
  local s, p = project()
  replace(s, p)
  local new_guid = s:events()[1][3]
  s.fake.play_state = 5
  s:send('restore_replacement', 'p1', new_guid, ID)
  H.eq(s:events(), { { 'ERROR', 'p1', 'REAPER is recording. Stop recording first.' } })
  H.truthy(by_guid(s, new_guid), 'the replacement stays')
end)

-- 4. import_audio_track -------------------------------------------------------------------------------------------

local IMPORT_LABEL = H.brand.name .. ': add their audio'
local CO_NARRATOR_KEY = PREFIX .. 'co_narrator'
local THEIR_AUDIO_KEY = PREFIX .. 'their_audio'

-- A file on disk to import, and the session with one chapter track.
local function importable(name)
  local s = H.session()
  s.fake:add_track('Chapter 1')
  local path = H.join(host.tmpdir(), name or 'leach_01.mp3')
  H.write_file(path, 'audio')
  s.fake.media_lengths[path] = 796.5
  s.fake.calls = {}
  return s, path
end

H.test('import-their-audio: the file goes on a new muted track named for them, as one item from 0, in one undo block', function()
  local s, path = importable()
  s:send('import_audio_track', 'i1', 'Eric Leach', path)
  local events = s:events()
  local track = s.fake.tracks[2]
  H.truthy(track, 'a track is added after the existing ones')
  H.eq(track.name, 'Eric Leach')
  H.eq(track.muted, true, 'muted: their whole file never plays in the mix or a render')
  H.eq(track.ext[CO_NARRATOR_KEY], '1')
  H.eq(#track.items, 1)
  local item = track.items[1]
  H.eq(span(item), { 0, 796.5 })
  H.eq(item.takes[1].source.file, path)
  H.eq(item.ext[THEIR_AUDIO_KEY], '1')
  H.eq(events, { { 'AUDIO_TRACK_ADDED', 'i1', track.guid, item.guid, '796.500000', '1' } })
  H.eq(s.fake:undo_labels(), { IMPORT_LABEL })
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('the new track can be their source for a replacement straight away', function()
  local s, path = importable()
  local chapter = s.fake.tracks[1]
  local mine = s.fake:add_item(chapter, { position = 10, length = 20, source = 'ch1.wav' })
  s:send('import_audio_track', 'i1', 'Eric Leach', path)
  local item_guid = s:events()[1][4]
  s:send('replace_range', 'r1', mine.guid, '14', '16', item_guid, '100|102.5|10|0|' .. ID)
  local answer = s:events()[1]
  H.eq(answer[1], 'RANGE_REPLACED')
  H.eq(by_guid(s, answer[3]).takes[1].source.file, path)
end)

H.test('an import refuses a bad name or path, a missing or unreadable file, and recording, with nothing changed', function()
  local s, path = importable()
  local cases = {
    { '', path, 'Their name must be 1 to 80 characters with no bar or control character.' },
    { 'Eric | Leach', path, 'Their name must be 1 to 80 characters with no bar or control character.' },
    { 'Eric\tLeach', path, 'Their name must be 1 to 80 characters with no bar or control character.' },
    { string.rep('n', 81), path, 'Their name must be 1 to 80 characters with no bar or control character.' },
    { 'Eric Leach', '', 'Choose an audio file on this computer (WAV, FLAC, MP3, OGG or AIFF).' },
    { 'Eric Leach', 'leach_01.mp3', 'Choose an audio file on this computer (WAV, FLAC, MP3, OGG or AIFF).' },
    { 'Eric Leach', '\\\\server\\share\\leach_01.mp3', 'Choose an audio file on this computer (WAV, FLAC, MP3, OGG or AIFF).' },
    { 'Eric Leach', '//server/share/leach_01.mp3', 'Choose an audio file on this computer (WAV, FLAC, MP3, OGG or AIFF).' },
    { 'Eric Leach', H.join(host.tmpdir(), 'notes.docx'), 'Choose an audio file on this computer (WAV, FLAC, MP3, OGG or AIFF).' },
    { 'Eric Leach', H.join(host.tmpdir(), 'gone.wav'), 'That file is no longer there. Choose it again.' },
  }
  for _, case in ipairs(cases) do
    s:send('import_audio_track', 'i1', case[1], case[2])
    H.eq(s:events(), { { 'ERROR', 'i1', case[3] } }, case[1] .. ' / ' .. case[2])
  end
  s:send('import_audio_track', 'i1', 'Eric Leach', path, 'extra')
  H.eq(s:events(), { { 'ERROR', 'i1', 'Choose an audio file on this computer (WAV, FLAC, MP3, OGG or AIFF).' } }, 'a path split by a bar')
  s.fake.unreadable_sources[path] = true
  s:send('import_audio_track', 'i1', 'Eric Leach', path)
  H.eq(s:events(), { { 'ERROR', 'i1', 'REAPER cannot read that file as audio.' } })
  s.fake.unreadable_sources[path] = nil
  s.fake.media_lengths[path] = 0
  s:send('import_audio_track', 'i1', 'Eric Leach', path)
  H.eq(s:events(), { { 'ERROR', 'i1', 'REAPER cannot read that file as audio.' } })
  s.fake.media_lengths[path] = 10
  s.fake.play_state = 5
  s:send('import_audio_track', 'i1', 'Eric Leach', path)
  H.eq(s:events(), { { 'ERROR', 'i1', 'REAPER is recording. Stop recording first.' } })
  H.eq(#s.fake.tracks, 1, 'no track is added')
  H.eq(#s.fake.undo, 0, 'no undo point')
  H.eq(s.fake.sources_created, s.fake.sources_destroyed, 'no source is left open')
end)

H.test('a name with emoji and right-to-left text is kept as given', function()
  local s, path = importable('صوت 🎙.wav')
  s:send('import_audio_track', 'i1', 'إريك 🎙 Leach', path)
  H.eq(s:events()[1][1], 'AUDIO_TRACK_ADDED')
  H.eq(s.fake.tracks[2].name, 'إريك 🎙 Leach')
end)
