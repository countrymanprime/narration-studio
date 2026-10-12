-- split_take (narration_takes.lua): a take that reads its line twice becomes two takes of one item. The item ends at the
-- cut, and the new take plays the same file from the cut, so the second read sits on the first read's spot. One undo
-- block; nothing is deleted, re-sourced or moved, and a stale item or take changes nothing.

local H = require('harness')

local LABEL = 'Narration Utils: split take'
local SPLIT_KEY = 'narration_utils_split_from'

local ITEM = '{AAAAAAAA-0000-4000-8000-000000000001}'
local TAKE = '{AAAAAAAA-0000-4000-8000-000000000002}'
local STALE = '{FFFFFFFF-0000-4000-8000-00000000FFFF}'

local function audio(s, name)
  local path = s:path(name)
  H.write_file(path, 'RIFF')
  return path
end

-- Chapter 1: an intro (0-8), the take that reads the line twice (10-20, the second read from 15.5) and a later item
-- (24-30) that must not move.
local function project(opts)
  opts = opts or {}
  local s = H.session()
  local chapter = s.fake:add_track('Chapter 1')
  local p = { chapter = chapter }
  p.intro = s.fake:add_item(chapter, { position = 0, length = 8, source = 'intro.wav' })
  p.item = s.fake:add_item(chapter, {
    guid = ITEM,
    take_guid = TAKE,
    position = 10,
    length = opts.length or 10,
    source = opts.source or audio(s, 'twice.wav'),
    startoffs = 2,
    playrate = opts.playrate,
    midi = opts.midi,
  })
  p.later = s.fake:add_item(chapter, { position = 24, length = 6, source = 'later.wav' })
  s.fake.calls = {}
  return s, p
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

local function positions(track)
  local out = {}
  for _, item in ipairs(track.items) do
    out[#out + 1] = item.position
  end
  return out
end

-- What a refusal leaves as it was: the item's length and takes, every item where it was, no undo point.
local function unchanged(s, p)
  H.eq(#p.item.takes, 1, 'no take is added')
  H.eq(p.item.length, p.item_length or 10, 'the item keeps its length')
  H.eq(positions(p.chapter), { 0, 10, 24 }, 'nothing on the track moves')
  H.eq(calls_named(s, 'AddTakeToMediaItem'), 0)
  H.eq(calls_named(s, 'SetMediaItemInfo_Value'), 0)
  H.eq(#s.fake.undo, 0, 'no undo point')
  H.eq(s.fake.open_undo_blocks, 0)
end

local function refused(s, p, args, expected)
  s:send('split_take', 'p1', table.unpack(args))
  H.eq(s:events(), { expected })
  unchanged(s, p)
end

local function error_event(s, p, args)
  s:send('split_take', 'p1', table.unpack(args))
  local events = s:events()
  H.eq(#events, 1)
  H.eq(events[1][1], 'ERROR')
  H.eq(events[1][2], 'p1')
  unchanged(s, p)
  return events[1][3]
end

-- 1. split_take splits one take into two takes of one item at the time given, one undo point --------------------

H.test('split_take splits one take into two takes of one item at the time given, one undo point', function()
  local s, p = project()
  s:send('split_take', 'p1', ITEM, TAKE, '15.5')
  local events = s:events()
  H.eq(#events, 1)
  local added = p.item.takes[2]
  H.truthy(added, 'the item has a second take')
  H.eq(events[1], { 'TAKE_SPLIT', 'p1', ITEM, TAKE, added.guid, '15.500', '1' })
  H.eq(#p.item.takes, 2, 'one item, two takes')
  H.eq(p.item.position, 10, 'the item does not move')
  H.eq(p.item.length, 5.5, 'the item ends at the cut')
  H.eq(p.item.takes[1].guid, TAKE, 'the first read is the take it was')
  H.eq(p.item.takes[1].startoffs, 2, 'the first read plays from where it did')
  H.eq(added.source.file, p.item.takes[1].source.file, 'the second read plays the same file')
  H.eq(added.startoffs, 7.5, 'the second read plays from the cut')
  H.eq(s.fake.reaper.GetActiveTake(p.item).guid, TAKE, 'the first read stays the active take')
  H.eq(positions(p.chapter), { 0, 10, 24 }, 'no other item moves')
  H.eq(s.fake:undo_labels(), { LABEL }, 'one undo point')
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('split_take splits one take into two takes of one item at the time given, one undo point: the new take records its source', function()
  local s, p = project()
  s:send('split_take', 'p1', ITEM, TAKE, '15.5')
  s:events()
  H.eq(p.item.takes[2].ext[SPLIT_KEY], ITEM .. '|' .. TAKE .. '|5.500000')
  H.eq(p.item.takes[1].ext[SPLIT_KEY], nil, 'the first read records nothing')
end)

H.test('split_take splits one take into two takes of one item at the time given, one undo point: one Undo puts the take back whole', function()
  local s, p = project()
  s:send('split_take', 'p1', ITEM, TAKE, '15.5')
  s:events()
  H.eq(s.fake:undo_last_block(), LABEL)
  H.eq(#p.item.takes, 1)
  H.eq(p.item.length, 10)
end)

H.test('split_take splits one take into two takes of one item at the time given, one undo point: nothing is deleted', function()
  local s, p = project()
  local items = #s.fake.items
  s:send('split_take', 'p1', ITEM, TAKE, '15.5')
  s:events()
  H.eq(#s.fake.items, items, 'no item is added or removed')
  H.eq(calls_named(s, 'DeleteTrackMediaItem'), 0)
  H.eq(calls_named(s, 'SplitMediaItem'), 0)
  H.eq(calls_named(s, 'Main_OnCommand'), 0)
end)

H.test('split_take splits one take into two takes of one item at the time given, one undo point: a GUID without braces or in lower case resolves', function()
  local s, p = project()
  s:send('split_take', 'p1', ITEM:lower():gsub('[{}]', ''), TAKE:lower(), '15.5')
  H.eq(s:events()[1][1], 'TAKE_SPLIT')
  H.eq(#p.item.takes, 2)
end)

-- 2. split_take refuses a stale item or take and changes nothing --------------------------------------------------

H.test('split_take refuses a stale item or take and changes nothing: an item GUID that does not resolve', function()
  local s, p = project()
  refused(s, p, { STALE, TAKE, '15.5' }, { 'ITEM_STALE', 'p1', STALE, 'item' })
end)

H.test('split_take refuses a stale item or take and changes nothing: a take that is not on the item', function()
  local s, p = project()
  refused(s, p, { ITEM, STALE, '15.5' }, { 'ITEM_STALE', 'p1', STALE, 'take' })
end)

H.test('split_take refuses a stale item or take and changes nothing: a take of another item', function()
  local s, p = project()
  local other = p.later.takes[1].guid
  refused(s, p, { ITEM, other, '15.5' }, { 'ITEM_STALE', 'p1', other, 'take' })
end)

H.test('split_take refuses a stale item or take and changes nothing: a cut outside the item answers stale', function()
  local s, p = project()
  refused(s, p, { ITEM, TAKE, '9' }, { 'ITEM_STALE', 'p1', ITEM, 'item' })
  refused(s, p, { ITEM, TAKE, '20' }, { 'ITEM_STALE', 'p1', ITEM, 'item' })
  refused(s, p, { ITEM, TAKE, '10' }, { 'ITEM_STALE', 'p1', ITEM, 'item' })
end)

-- Refusals: the request, the take and REAPER's state ------------------------------------------------------------

H.test('split_take refuses a time that is not a plain number', function()
  for _, at in ipairs({ '', 'abc', '1e3', '-12', 'nan', '0x10' }) do
    local s, p = project()
    H.contains(error_event(s, p, { ITEM, TAKE, at }), 'not readable')
  end
end)

H.test('split_take refuses while REAPER records', function()
  local s, p = project()
  s.fake.play_state = 5
  H.contains(error_event(s, p, { ITEM, TAKE, '15.5' }), 'recording')
end)

H.test('split_take refuses an item that already has more than one take', function()
  local s, p = project()
  s.fake.reaper.AddTakeToMediaItem(p.item).source = { file = 'other.wav' }
  s.fake.calls = {}
  s:send('split_take', 'p1', ITEM, TAKE, '15.5')
  local events = s:events()
  H.eq(events[1][1], 'ERROR')
  H.contains(events[1][3], 'more than one take')
  H.eq(#p.item.takes, 2)
  H.eq(p.item.length, 10)
  H.eq(#s.fake.undo, 0)
end)

H.test('split_take refuses a second read longer than the first, so no audio is cut off', function()
  local s, p = project()
  H.contains(error_event(s, p, { ITEM, TAKE, '14' }), 'longer than the first')
end)

H.test('split_take refuses a MIDI take, a changed playback rate and a missing file', function()
  local s, p = project({ midi = true, source = '' })
  H.contains(error_event(s, p, { ITEM, TAKE, '15.5' }), 'MIDI')
  s, p = project({ playrate = 1.5 })
  H.contains(error_event(s, p, { ITEM, TAKE, '15.5' }), 'playback rate')
  s, p = project({ source = 'not-on-disk.wav' })
  H.contains(error_event(s, p, { ITEM, TAKE, '15.5' }), 'missing')
end)

H.test('split_take refuses an item on a fixed-lane track', function()
  local s, p = project()
  s.fake:set_fixed_lanes(p.chapter, 2)
  s.fake.calls = {}
  H.contains(error_event(s, p, { ITEM, TAKE, '15.5' }), 'fixed item lanes')
end)

H.test('split_take refuses a REAPER without the calls it needs', function()
  local s, p = project()
  s.fake:remove_api('AddTakeToMediaItem')
  H.contains(error_event(s, p, { ITEM, TAKE, '15.5' }), 'cannot split')
end)
