-- delete_range (narration_range.lua, ADR 0860 point 2): split an item at both ends of a range of words and move the
-- middle piece to the project's muted Cuts track, in one undo block. `close` moves the later items on the same track up
-- by the cut's length; `gap` moves nothing, so the cut is silence (the command has no room-tone source). Nothing is
-- deleted.

local H = require('harness')

local UNDO_LABEL = 'Narration Utils: delete words'
local CUTS_KEY = 'narration_utils_cuts'

-- A chapter track with an intro (0-8), the item the words are in (10-30) and a later item (32-37), and a second track
-- with an item that spans the cut's time (25-35).
local function project()
  local s = H.session()
  local chapter = s.fake:add_track('Chapter 1')
  local other = s.fake:add_track('Chapter 2')
  local intro = s.fake:add_item(chapter, { position = 0, length = 8, source = 'intro.wav' })
  local item = s.fake:add_item(chapter, { position = 10, length = 20, source = 'ch1.wav', fadein = 0.5, fadeout = 0.25 })
  local later = s.fake:add_item(chapter, { position = 32, length = 5, source = 'ch1-b.wav' })
  local elsewhere = s.fake:add_item(other, { position = 25, length = 10, source = 'ch2.wav' })
  s.fake.calls = {}
  return s, { chapter = chapter, other = other, intro = intro, item = item, later = later, elsewhere = elsewhere }
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

local function span(item)
  return { item.position, item.length }
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

-- What a refusal must leave as it was: every item's place and the track list, no split, no undo point.
local function unchanged(s, before_tracks, before_items)
  H.eq(#s.fake.tracks, before_tracks, 'no track is added')
  H.eq(#s.fake.items, before_items, 'no item is added or removed')
  H.eq(calls_named(s, 'SplitMediaItem'), 0, 'nothing is split')
  H.eq(calls_named(s, 'MoveMediaItemToTrack'), 0, 'nothing is moved')
  H.eq(calls_named(s, 'SetMediaItemInfo_Value'), 0, 'no item value is set')
  H.eq(#s.fake.undo, 0, 'no undo point')
  H.eq(s.fake.open_undo_blocks, 0)
end

local function refused(s, p, sentence, ...)
  local tracks, items = #s.fake.tracks, #s.fake.items
  s:send('delete_range', 'c1', ...)
  H.eq(s:events(), { { 'ERROR', 'c1', sentence } })
  unchanged(s, tracks, items)
  H.eq(span(p.item), { 10, 20 })
end

-- 1. cut-moves-the-middle-to-a-muted-cuts-track ------------------------------------------------------------------

H.test('cut-moves-the-middle-to-a-muted-cuts-track: close splits at both ends, moves the middle to Cuts and closes up', function()
  local s, p = project()
  s:send('delete_range', 'c1', p.item.guid, '14', '16', 'close', '10')
  local events = s:events()
  H.eq(#events, 1)
  local cuts = cuts_track(s)
  H.truthy(cuts, 'a Cuts track exists')
  H.eq(cuts.name, 'Cuts')
  H.eq(cuts.muted, true, 'the Cuts track is muted')
  H.eq(cuts.ext[CUTS_KEY], '1')
  H.eq(#cuts.items, 1)
  local cut = cuts.items[1]
  H.eq(events[1], { 'RANGE_CUT', 'c1', p.item.guid, cut.guid, '1' })
  H.eq(span(cut), { 14, 2 }, 'the middle piece keeps its time on the Cuts track')
  H.eq(cut.takes[1].source.file, 'ch1.wav', 'with its take and source')
  H.eq(cut.takes[1].startoffs, 4)
  H.eq(span(p.item), { 10, 4 }, 'the left piece keeps the item and its GUID')
  local right = p.chapter.items[3]
  H.eq(right.takes[1].source.file, 'ch1.wav')
  H.eq(span(right), { 14, 14 }, 'the right piece moves up by the cut length')
  H.eq(right.takes[1].startoffs, 6, 'and still plays the audio after the cut')
  H.eq(span(p.later), { 30, 5 }, 'a later item on the track moves up by the cut length')
  H.eq(s.fake:undo_labels(), { UNDO_LABEL }, 'one undo block')
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('the Cuts track is created once, at the end, and a second cut reuses it', function()
  local s, p = project()
  s:send('delete_range', 'c1', p.item.guid, '14', '16', 'close', '0')
  s:send('delete_range', 'c2', p.item.guid, '11', '12', 'close', '0')
  local events = s:events()
  H.eq(events[2][1], 'RANGE_CUT')
  H.eq(#s.fake.tracks, 3, 'one Cuts track')
  H.truthy(s.fake.tracks[3] == cuts_track(s), 'added after the existing tracks')
  H.eq(calls_named(s, 'InsertTrackAtIndex'), 1)
  H.eq(#cuts_track(s).items, 2)
end)

H.test('a track named Cuts without the key is used, keyed and muted; a keyed Cuts track the narrator unmuted is muted again', function()
  local s, p = project()
  local named = s.fake:add_track('Cuts')
  s:send('delete_range', 'c1', p.item.guid, '14', '16', 'close', '0')
  H.eq(s:events()[1][1], 'RANGE_CUT')
  H.eq(calls_named(s, 'InsertTrackAtIndex'), 0)
  H.eq(named.ext[CUTS_KEY], '1')
  H.eq(named.muted, true)
  named.muted = false
  named.name = 'My cuts'
  s:send('delete_range', 'c2', p.item.guid, '11', '12', 'close', '0')
  H.eq(s:events()[1][1], 'RANGE_CUT')
  H.eq(#named.items, 2, 'found by its key after a rename')
  H.eq(named.muted, true)
  H.eq(calls_named(s, 'InsertTrackAtIndex'), 0)
end)

-- 2. gap-mode-keeps-the-length -------------------------------------------------------------------------------------

H.test('gap-mode-keeps-the-length: the same split and move, nothing after it moves, and the gap is silence (no room tone)', function()
  local s, p = project()
  s:send('delete_range', 'c1', p.item.guid, '14', '16', 'gap', '10')
  local cut = cuts_track(s).items[1]
  H.eq(s:events(), { { 'RANGE_CUT', 'c1', p.item.guid, cut.guid, '1' } })
  H.eq(span(cut), { 14, 2 })
  H.eq(span(p.item), { 10, 4 })
  H.eq(span(p.chapter.items[3]), { 16, 14 }, 'the right piece stays where it was')
  H.eq(span(p.later), { 32, 5 })
  H.eq(#p.chapter.items, 4, 'nothing fills the gap: no room-tone item is added')
  H.eq(s.fake:undo_labels(), { UNDO_LABEL })
end)

-- 3. nothing-is-deleted ----------------------------------------------------------------------------------------------

H.test('nothing-is-deleted: no item, take or source is removed, and undoing the block restores the item whole', function()
  local s, p = project()
  local items = #s.fake.items
  s:send('delete_range', 'c1', p.item.guid, '14', '16', 'close', '10')
  local cut_guid = s:events()[1][4]
  H.eq(calls_named(s, 'DeleteTrackMediaItem'), 0)
  H.eq(#s.fake.items, items + 2, 'the two new pieces are added and nothing is removed')
  local cut = by_guid(s, cut_guid)
  H.eq(#cut.takes, 1)
  H.eq(cut.takes[1].source.file, 'ch1.wav')
  H.eq(s.fake:undo_last_block(), UNDO_LABEL)
  H.eq(span(p.item), { 10, 20 }, 'one Undo gives the item back whole')
  H.eq({ p.item.fadein, p.item.fadeout }, { 0.5, 0.25 })
  H.eq(span(p.later), { 32, 5 })
  H.eq(#p.chapter.items, 3)
  H.eq(#s.fake.tracks, 2, 'and takes away the Cuts track it added')
end)

-- 4. other-items-stay-correct ----------------------------------------------------------------------------------------

H.test('other-items-stay-correct: items before the cut, on other tracks and on Cuts do not move', function()
  local s, p = project()
  local far = s.fake:add_item(p.other, { position = 40, length = 2, source = 'ch2-b.wav' })
  s:send('delete_range', 'c1', p.item.guid, '20', '22', 'close', '0')
  local first_cut = cuts_track(s).items[1]
  s:send('delete_range', 'c2', p.item.guid, '14', '16', 'close', '0')
  H.eq(#s:events(), 2)
  H.eq(span(p.intro), { 0, 8 }, 'an item before the cut stays')
  H.eq(span(p.elsewhere), { 25, 10 }, 'an item on another track stays, even across the cut')
  H.eq(span(far), { 40, 2 }, 'an item on another track after the cut stays')
  H.eq(span(first_cut), { 20, 2 }, 'an item on the Cuts track stays')
  H.eq(span(p.later), { 28, 5 }, 'the later item moved by exactly the two cut lengths')
end)

H.test('a cut that overlaps a neighbouring item on the track is refused', function()
  local s, p = project()
  s.fake:add_item(p.chapter, { position = 15, length = 1, source = 'overlap.wav' })
  s.fake.calls = {}
  refused(s, p, 'Another item on the track overlaps the range to cut, so nothing was cut.', p.item.guid, '14', '16', 'close', '0')
end)

H.test('an item that only touches the range is not an overlap', function()
  local s, p = project()
  local touching = s.fake:add_item(p.chapter, { position = 30, length = 1, source = 'touch.wav' })
  s:send('delete_range', 'c1', p.item.guid, '28', '30', 'close', '0')
  H.eq(s:events()[1][1], 'RANGE_CUT')
  H.eq(span(touching), { 28, 1 }, 'it starts at the cut end, so it moves up')
end)

-- 5. stale-and-bounds-refusals ----------------------------------------------------------------------------------------

H.test('an item GUID that no longer resolves answers ITEM_STALE and changes nothing', function()
  local s, p = project()
  local gone = '{DEADBEEF-0000-4000-8000-000000000000}'
  s:send('delete_range', 'c1', gone, '14', '16', 'close', '0')
  H.eq(s:events(), { { 'ITEM_STALE', 'c1', gone, 'item' } })
  unchanged(s, 2, 4)
  H.eq(span(p.item), { 10, 20 })
end)

H.test('a range outside the item is refused before any change', function()
  for _, range in ipairs({ { '9', '12' }, { '28', '31' }, { '5', '40' }, { '-1', '2' } }) do
    local s, p = project()
    refused(s, p, 'The range to cut is not inside that item.', p.item.guid, range[1], range[2], 'close', '0')
  end
end)

H.test('an empty, reversed or non-finite range is refused before any change', function()
  for _, range in ipairs({ { '14', '14' }, { '16', '14' }, { 'nan', '16' }, { '14', '1e999' }, { '-1e999', '16' }, { 'x', '16' }, { '14', '' } }) do
    local s, p = project()
    refused(s, p, 'The range to cut is not a usable pair of times.', p.item.guid, range[1], range[2], 'close', '0')
  end
end)

H.test('a mode other than close or gap is refused before any change', function()
  local s, p = project()
  refused(s, p, 'The cut mode must be close or gap.', p.item.guid, '14', '16', 'delete', '0')
end)

H.test('a start within the edge tolerance of the item start cuts the end only: the middle piece is the item itself', function()
  local s, p = project()
  s:send('delete_range', 'c1', p.item.guid, '10.0000005', '12', 'close', '10')
  H.eq(s:events(), { { 'RANGE_CUT', 'c1', '', p.item.guid, '1' } })
  H.eq(calls_named(s, 'SplitMediaItem'), 1)
  H.truthy(p.item.track == cuts_track(s), 'the item itself is on Cuts')
  H.eq(span(p.item), { 10, 2 })
  H.eq(span(p.chapter.items[2]), { 10, 18 }, 'the rest moves up to where the item began')
  H.eq(p.item.fadein, 0.5, 'the cut piece keeps its own fade-in')
end)

H.test('an end within the edge tolerance of the item end cuts the start only', function()
  local s, p = project()
  s:send('delete_range', 'c1', p.item.guid, '26', '29.9999995', 'close', '0')
  local cut = cuts_track(s).items[1]
  H.eq(s:events(), { { 'RANGE_CUT', 'c1', p.item.guid, cut.guid, '1' } })
  H.eq(calls_named(s, 'SplitMediaItem'), 1)
  H.eq(span(cut), { 26, 4 })
  H.eq(cut.fadeout, 0.25, 'the cut piece keeps the item fade-out')
  H.eq(span(p.item), { 10, 16 })
  H.eq(span(p.later), { 28, 5 })
end)

H.test('a range that rounds to both edges moves the whole item to Cuts', function()
  local s, p = project()
  s:send('delete_range', 'c1', p.item.guid, '10', '30', 'close', '0')
  H.eq(s:events(), { { 'RANGE_CUT', 'c1', '', p.item.guid, '1' } })
  H.eq(calls_named(s, 'SplitMediaItem'), 0)
  H.truthy(p.item.track == cuts_track(s), 'the item itself is on Cuts')
  H.eq(span(p.later), { 12, 5 })
end)

H.test('nothing changes while REAPER records', function()
  local s, p = project()
  s.fake.play_state = 5
  refused(s, p, 'REAPER is recording. Stop recording first.', p.item.guid, '14', '16', 'close', '0')
end)

H.test('an item already on the Cuts track is refused', function()
  local s, p = project()
  s:send('delete_range', 'c1', p.item.guid, '10', '30', 'gap', '0')
  s:events()
  s.fake.calls = {}
  s.fake.undo = {}
  s:send('delete_range', 'c2', p.item.guid, '14', '16', 'close', '0')
  H.eq(s:events(), { { 'ERROR', 'c2', 'That audio is already on the Cuts track.' } })
  unchanged(s, 3, 4)
end)

H.test('a REAPER without the calls a cut needs refuses before any change', function()
  local s, p = project()
  s.fake:remove_api('MoveMediaItemToTrack')
  refused(s, p, 'This REAPER version cannot cut words and their audio.', p.item.guid, '14', '16', 'close', '0')
end)

-- 6. fade-is-bounded --------------------------------------------------------------------------------------------------

H.test('fade-is-bounded: a fade outside 0 to 500 milliseconds, or not whole, is refused before any change', function()
  for _, fade in ipairs({ '-1', '501', '2.5', 'x', '', 'inf' }) do
    local s, p = project()
    refused(s, p, 'The fade must be a whole number of milliseconds from 0 to 500.', p.item.guid, '14', '16', 'close', fade)
  end
end)

H.test('the fade is set at the new seam only, never on untouched edges', function()
  local s, p = project()
  s:send('delete_range', 'c1', p.item.guid, '14', '16', 'close', '500')
  local cut = cuts_track(s).items[1]
  local right = p.chapter.items[3]
  H.eq(p.item.fadein, 0.5, 'the left piece keeps its fade-in')
  H.eq(p.item.fadeout, 0.5, 'the left piece fades out at the seam')
  H.eq(right.fadein, 0.5, 'the right piece fades in at the seam')
  H.eq(right.fadeout, 0.25, 'the right piece keeps the item fade-out')
  H.eq({ cut.fadein, cut.fadeout }, { 0, 0 }, 'the cut piece gets no fade')
  H.eq({ p.later.fadein, p.later.fadeout }, { 0, 0 }, 'a later item gets no fade')
end)

H.test('a fade of 0 leaves the seam with no fade', function()
  local s, p = project()
  s:send('delete_range', 'c1', p.item.guid, '14', '16', 'gap', '0')
  H.eq(p.item.fadeout, 0)
  H.eq(p.chapter.items[3].fadein, 0)
end)

-- 7. pad and room tone (SN-E97) ---------------------------------------------------------------------------------------
-- pad (seconds, 0 to 0.5) cuts that much less at each end. room_tone '1' (gap mode only) fills the gap with copies of the
-- stretch a region named "Room tone" marks inside an item on the same track, in the same undo block. Both omitted, the
-- command answers as before; asked for, the answer appends the pad and the number of room-tone pieces it laid.

local ROOM_TONE_KEY = 'narration_utils_room_tone'

-- span() rounded to microseconds: a pad moves the edges by sums that are not exact in binary.
local function rspan(item)
  local function r(value)
    return math.floor(value * 1e6 + 0.5) / 1e6
  end
  return { r(item.position), r(item.length) }
end

-- The project above with 1 s of room tone marked on the intro (2 to 3 s into it, 2 s into intro.wav).
local function with_room_tone()
  local s, p = project()
  s.fake:add_region(2, 3, 'Room tone')
  return s, p
end

local function room_tone_pieces(track)
  local out = {}
  for _, item in ipairs(track.items) do
    if item.ext[ROOM_TONE_KEY] then
      out[#out + 1] = item
    end
  end
  return out
end

H.test('delete_range with a pad cuts less at each edge', function()
  local s, p = project()
  s:send('delete_range', 'c1', p.item.guid, '14', '16', 'close', '10', '0.1')
  local cut = cuts_track(s).items[1]
  H.eq(s:events(), { { 'RANGE_CUT', 'c1', p.item.guid, cut.guid, '1' } })
  H.eq(rspan(cut), { 14.1, 1.8 }, 'the cut starts and ends a pad inside the range')
  H.eq(rspan(p.item), { 10, 4.1 }, 'the left piece keeps the pad')
  H.eq(rspan(p.chapter.items[3]), { 14.1, 14.1 }, 'the right piece keeps the pad and moves up by the shorter cut')
  H.eq(rspan(p.later), { 30.2, 5 })
  H.eq(s.fake:undo_labels(), { UNDO_LABEL })
end)

H.test('a pad of 0 or none answers as before', function()
  for _, pad in ipairs({ '0', '' }) do
    local s, p = project()
    s:send('delete_range', 'c1', p.item.guid, '14', '16', 'close', '0', pad, '0')
    local cut = cuts_track(s).items[1]
    H.eq(s:events(), { { 'RANGE_CUT', 'c1', p.item.guid, cut.guid, '1' } })
    H.eq(rspan(cut), { 14, 2 })
  end
end)

H.test('a pad outside 0 to 0.5 seconds, or one that leaves nothing to cut, is refused before any change', function()
  for _, pad in ipairs({ '-0.1', '0.6', 'x', 'nan', 'inf' }) do
    local s, p = project()
    refused(s, p, 'The pad must be from 0 to 500 milliseconds.', p.item.guid, '14', '16', 'close', '0', pad)
  end
  local s, p = project()
  refused(s, p, 'The pad leaves nothing to cut.', p.item.guid, '14', '14.8', 'close', '0', '0.4')
end)

H.test('a pad applies inside a range at the item edge: the edge is then split', function()
  local s, p = project()
  s:send('delete_range', 'c1', p.item.guid, '10', '12', 'close', '0', '0.05')
  local cut = cuts_track(s).items[1]
  H.eq(s:events(), { { 'RANGE_CUT', 'c1', p.item.guid, cut.guid, '1' } })
  H.eq(rspan(p.item), { 10, 0.05 })
  H.eq(rspan(cut), { 10.05, 1.9 })
end)

H.test('delete_range with room tone fills the gap with the room tone, one undo point', function()
  local s, p = with_room_tone()
  s:send('delete_range', 'c1', p.item.guid, '14', '16.5', 'gap', '10', '', '1')
  local cut = cuts_track(s).items[1]
  H.eq(s:events(), { { 'RANGE_CUT', 'c1', p.item.guid, cut.guid, '1' } })
  local pieces = room_tone_pieces(p.chapter)
  H.eq(#pieces, 3, 'the 2.5 s gap takes three copies of the 1 s room tone')
  H.eq({ rspan(pieces[1]), rspan(pieces[2]), rspan(pieces[3]) }, { { 14, 1 }, { 15, 1 }, { 16, 0.5 } })
  for _, piece in ipairs(pieces) do
    H.eq(piece.takes[1].source.file, 'intro.wav', 'from the room tone in the project, never a host path')
    H.eq(piece.takes[1].startoffs, 2, 'from the start of the marked stretch')
    H.eq({ piece.fadein, piece.fadeout }, { 0.01, 0.01 }, 'with the seam fade at each edge')
  end
  H.eq(rspan(p.chapter.items[#p.chapter.items]), { 32, 5 }, 'nothing moves')
  H.eq(rspan(p.item), { 10, 4 })
  H.eq(s.fake:undo_labels(), { UNDO_LABEL }, 'one undo block')
  H.eq(s.fake.open_undo_blocks, 0)
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'AddMediaItemToTrack' then
      H.truthy(call.in_block, "each room-tone item is added inside the cut's undo block")
    end
  end
  H.eq(s.fake:undo_last_block(), UNDO_LABEL)
  H.eq(#p.chapter.items, 3, 'one Undo takes the room tone away with the cut')
  H.eq(rspan(p.item), { 10, 20 })
end)

H.test('room tone with a pad fills the narrower gap', function()
  local s, p = with_room_tone()
  s:send('delete_range', 'c1', p.item.guid, '14', '16', 'gap', '0', '0.25', '1')
  H.eq(s:events()[1][1], 'RANGE_CUT')
  local pieces = room_tone_pieces(p.chapter)
  H.eq({ rspan(pieces[1]), rspan(pieces[2]) }, { { 14.25, 1 }, { 15.25, 0.5 } })
end)

H.test('room tone with no Room tone region over audio on the track is refused and nothing is cut', function()
  local s, p = project()
  s.fake:add_item(p.other, { position = 38, length = 2, source = 'ch2-tone.wav' })
  s.fake:add_region(38.5, 39.5, 'Room tone')
  s.fake:add_region(8.5, 9.5, 'Room tone')
  s.fake:add_region(2, 3, 'Chapter 1')
  s.fake.calls = {}
  refused(
    s,
    p,
    'This chapter has no room tone marked in REAPER. Mark a stretch of room tone on its track with a region named Room tone.',
    p.item.guid,
    '14',
    '16',
    'gap',
    '0',
    '',
    '1'
  )
end)

H.test('a Room tone region that overlaps the words to cut is refused', function()
  local s, p = project()
  s.fake:add_region(15, 17, 'room tone')
  s.fake.calls = {}
  refused(s, p, 'The room tone region overlaps the words to cut. Mark room tone elsewhere on the track.', p.item.guid, '14', '16', 'gap', '0', '', '1')
end)

H.test('room tone needs the gap mode', function()
  local s, p = with_room_tone()
  refused(s, p, 'Room tone fills a gap that keeps its length, so it needs the gap mode.', p.item.guid, '14', '16', 'close', '0', '', '1')
end)

H.test('a room tone choice other than 0 or 1 is refused', function()
  local s, p = with_room_tone()
  refused(s, p, 'The room tone choice must be 0 or 1.', p.item.guid, '14', '16', 'gap', '0', '', 'yes')
end)

H.test('room tone too short for the gap is refused before any change', function()
  local s, p = project()
  s.fake:add_region(2, 2.01, 'Room tone')
  s.fake.calls = {}
  refused(s, p, 'The marked room tone is too short to fill that gap.', p.item.guid, '11', '16', 'gap', '0', '', '1')
end)

H.test('a room tone file REAPER cannot open is refused before any change', function()
  local s, p = with_room_tone()
  s.fake.unreadable_sources['intro.wav'] = true
  refused(s, p, 'REAPER could not open the room tone audio.', p.item.guid, '14', '16', 'gap', '0', '', '1')
  H.eq(s.fake.sources_destroyed, s.fake.sources_created, 'every source opened is let go')
end)

H.test('a REAPER without the calls room tone needs refuses before any change', function()
  local s, p = with_room_tone()
  s.fake:remove_api('AddMediaItemToTrack')
  refused(s, p, 'This REAPER version cannot fill a cut with room tone.', p.item.guid, '14', '16', 'gap', '0', '', '1')
end)

H.test('delete_range without pad or room tone is unchanged: the gap stays silence', function()
  local s, p = with_room_tone()
  s:send('delete_range', 'c1', p.item.guid, '14', '16', 'gap', '0')
  local cut = cuts_track(s).items[1]
  H.eq(s:events(), { { 'RANGE_CUT', 'c1', p.item.guid, cut.guid, '1' } })
  H.eq(#room_tone_pieces(p.chapter), 0)
end)

H.test('a fade field with more than fade, pad and room tone is refused as a fade', function()
  local s, p = with_room_tone()
  refused(s, p, 'The fade must be a whole number of milliseconds from 0 to 500.', p.item.guid, '14', '16', 'gap', '0', '', '1', 'x')
end)
