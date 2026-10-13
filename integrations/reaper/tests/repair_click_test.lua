-- repair_click (narration_range.lua): short clicks in a take, given in the take's source time, are each smoothed with a short
-- dip on the take's volume envelope and a ramp either side. The audio, the item and every other item are left as they were;
-- one undo block; a stale item or take, and every refusal, changes nothing.

local H = require('harness')

local LABEL = 'Narration Utils: repair clicks'
local RAMP = 0.002
local DIP_DB = 30

local ITEM = '{AAAAAAAA-0000-4000-8000-000000000001}'
local TAKE = '{AAAAAAAA-0000-4000-8000-000000000002}'
local STALE = '{FFFFFFFF-0000-4000-8000-00000000FFFF}'

-- Chapter 1: an intro (0-8), the take whose clicks are repaired (10-20, playing its file from 2 s, so source 2..12 is item
-- time 0..10) and a later item (24-30).
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
    length = 10,
    source = opts.midi and nil or 'take.wav',
    startoffs = 2,
    playrate = opts.playrate,
    midi = opts.midi,
  })
  p.take = p.item.takes[1]
  p.later = s.fake:add_item(chapter, { position = 24, length = 6, source = 'later.wav' })
  p.intro.selected = true
  s.fake.calls = {}
  return s, p
end

local function round(value)
  return math.floor(value * 1e6 + 0.5) / 1e6
end

local DIP = round(10 ^ (-DIP_DB / 20))

-- The volume envelope's points as { time, amplitude }, rounded to the microsecond and to six places.
local function points(s, take)
  local env = take.volume_env
  if not env then
    return nil
  end
  local out = {}
  for _, point in ipairs(env.points) do
    out[#out + 1] = { round(point.time), round(s.fake.reaper.ScaleFromEnvelopeMode(1, point.value)) }
  end
  return out
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

-- What a refusal leaves as it was: no envelope point, the item where it was, the selection, no undo point.
local function unchanged(s, p)
  H.eq(calls_named(s, 'InsertEnvelopePoint'), 0, 'no envelope point')
  H.eq(calls_named(s, 'Main_OnCommand'), 0, 'no envelope made')
  H.eq(p.item.position, 10)
  H.eq(p.item.length, 10)
  H.eq(p.intro.selected, true, 'the selection is as it was')
  H.eq(p.item.selected, false)
  H.eq(#s.fake.undo, 0, 'no undo point')
  H.eq(s.fake.open_undo_blocks, 0)
end

local function refused(s, p, args, expected)
  s:send('repair_click', 'c1', table.unpack(args))
  H.eq(s:events(), { expected })
  unchanged(s, p)
end

local function error_event(s, p, args)
  s:send('repair_click', 'c1', table.unpack(args))
  local events = s:events()
  H.eq(#events, 1)
  H.eq(events[1][1], 'ERROR')
  H.eq(events[1][2], 'c1')
  unchanged(s, p)
  return events[1][3]
end

-- 1. repair_click smooths each click and leaves the rest, one undo point -------------------------------------------

H.test('repair_click smooths each click and leaves the rest, one undo point', function()
  local s, p = project()
  s:send('repair_click', 'c1', ITEM, TAKE, '4:4.003,8.5:8.502')
  H.eq(s:events(), { { 'CLICKS_REPAIRED', 'c1', ITEM, TAKE, '2', '1' } })
  H.eq(points(s, p.take), {
    { 2 - RAMP, 1 },
    { 2, DIP },
    { 2.003, DIP },
    { 2.003 + RAMP, 1 },
    { 6.5 - RAMP, 1 },
    { 6.5, DIP },
    { 6.502, DIP },
    { 6.502 + RAMP, 1 },
  }, 'each click is dipped between ramps back to where the take was')
  H.eq(s.fake:undo_labels(), { LABEL }, 'one undo point')
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('repair_click smooths each click and leaves the rest, one undo point: the audio, the item and the other items are untouched', function()
  local s, p = project()
  s:send('repair_click', 'c1', ITEM, TAKE, '4:4.003')
  s:events()
  H.eq(p.take.source.file, 'take.wav', 'the take plays the same file')
  H.eq(p.take.startoffs, 2)
  H.eq(p.take.vol, nil, 'the take volume is not changed')
  H.eq({ p.item.position, p.item.length }, { 10, 10 })
  H.eq(#s.fake.items, 3, 'no item is added or removed')
  H.eq(calls_named(s, 'SplitMediaItem'), 0)
  H.eq(calls_named(s, 'SetMediaItemTakeInfo_Value'), 0)
  H.eq(calls_named(s, 'SetMediaItemInfo_Value'), 0)
  H.eq(p.intro.takes[1].volume_env, nil, 'no other take gets an envelope')
  H.eq(p.later.takes[1].volume_env, nil)
end)

H.test('repair_click smooths each click and leaves the rest, one undo point: the selection is put back', function()
  local s, p = project()
  s:send('repair_click', 'c1', ITEM, TAKE, '4:4.003')
  s:events()
  H.eq(p.intro.selected, true)
  H.eq(p.item.selected, false)
  H.eq(p.later.selected, false)
end)

H.test('repair_click smooths each click and leaves the rest, one undo point: one Undo puts the take back', function()
  local s, p = project()
  s:send('repair_click', 'c1', ITEM, TAKE, '4:4.003,8.5:8.502')
  s:events()
  H.eq(s.fake:undo_last_block(), LABEL)
  H.eq(p.take.volume_env, nil, 'the envelope it made is gone')
end)

H.test('repair_click smooths each click and leaves the rest, one undo point: an envelope the take has keeps its points and level', function()
  local s, p = project()
  -- The narrator has the take at -6 dB from an envelope with points at 0.5 and 9.5.
  local level = 10 ^ (-6 / 20)
  p.take.volume_env = {
    points = {
      { time = 0.5, value = math.sqrt(level), shape = 0 },
      { time = 9.5, value = math.sqrt(level), shape = 0 },
    },
    visible = true,
  }
  s:send('repair_click', 'c1', ITEM, TAKE, '4:4.003')
  H.eq(s:events()[1][1], 'CLICKS_REPAIRED')
  H.eq(calls_named(s, 'Main_OnCommand'), 0, 'the envelope is not toggled')
  H.eq(p.take.volume_env.visible, true)
  local l, ld = round(level), round(level * 10 ^ (-DIP_DB / 20))
  H.eq(points(s, p.take), {
    { 0.5, l },
    { 2 - RAMP, l },
    { 2, ld },
    { 2.003, ld },
    { 2.003 + RAMP, l },
    { 9.5, l },
  }, 'the click is dipped from the level the take had')
  H.eq(s.fake:undo_last_block(), LABEL)
  H.eq(#p.take.volume_env.points, 2, 'one Undo leaves the narrator points alone')
end)

H.test('repair_click smooths each click and leaves the rest, one undo point: clicks at the edges, out of order and close together', function()
  local s, p = project()
  -- Source 2..2.002 starts the item; 11.997..12 ends it; 6:6.003 and 6.006:6.008 are closer than two ramps.
  s:send('repair_click', 'c1', ITEM, TAKE, '11.997:12,6.006:6.008,2:2.002,6:6.003')
  H.eq(s:events(), { { 'CLICKS_REPAIRED', 'c1', ITEM, TAKE, '3', '1' } })
  H.eq(points(s, p.take), {
    { 0, DIP },
    { 0.002, DIP },
    { 0.002 + RAMP, 1 },
    { 4 - RAMP, 1 },
    { 4, DIP },
    { 4.008, DIP },
    { 4.008 + RAMP, 1 },
    { 9.997 - RAMP, 1 },
    { 9.997, DIP },
    { 10, DIP },
  }, 'no ramp outside the item, and clicks whose ramps meet are smoothed as one')
end)

H.test('repair_click smooths each click and leaves the rest, one undo point: a GUID without braces or in lower case resolves', function()
  local s, p = project()
  s:send('repair_click', 'c1', ITEM:lower():gsub('[{}]', ''), TAKE:lower(), '4:4.003')
  H.eq(s:events()[1][1], 'CLICKS_REPAIRED')
  H.eq(#points(s, p.take), 4)
end)

H.test('repair_click smooths each click and leaves the rest, one undo point: the same request again changes nothing', function()
  local s, p = project()
  s:send('repair_click', 'c1', ITEM, TAKE, '4:4.003')
  H.eq(s:events()[1][1], 'CLICKS_REPAIRED')
  s.fake.calls = {}
  s:send('repair_click', 'c2', ITEM, TAKE, '4:4.003')
  local events = s:events()
  H.eq(events[1][1], 'ERROR')
  H.contains(events[1][3], 'already has volume changes')
  H.eq(#points(s, p.take), 4, 'the click is not dipped twice')
  H.eq(s.fake:undo_labels(), { LABEL }, 'still one undo point')
  H.eq(calls_named(s, 'InsertEnvelopePoint'), 0)
end)

-- 2. repair_click refuses a stale item or take and changes nothing ------------------------------------------------

H.test('repair_click refuses a stale item or take and changes nothing: an item GUID that does not resolve', function()
  local s, p = project()
  refused(s, p, { STALE, TAKE, '4:4.003' }, { 'ITEM_STALE', 'c1', STALE, 'item' })
end)

H.test('repair_click refuses a stale item or take and changes nothing: a take that is not on the item', function()
  local s, p = project()
  refused(s, p, { ITEM, STALE, '4:4.003' }, { 'ITEM_STALE', 'c1', STALE, 'take' })
end)

H.test('repair_click refuses a stale item or take and changes nothing: a take of another item', function()
  local s, p = project()
  local other = p.later.takes[1].guid
  refused(s, p, { ITEM, other, '4:4.003' }, { 'ITEM_STALE', 'c1', other, 'take' })
end)

H.test('repair_click refuses a stale item or take and changes nothing: a click the item no longer plays', function()
  local s, p = project()
  refused(s, p, { ITEM, TAKE, '4:4.003,1:1.002' }, { 'ITEM_STALE', 'c1', ITEM, 'item' })
  refused(s, p, { ITEM, TAKE, '11.999:12.001' }, { 'ITEM_STALE', 'c1', ITEM, 'item' })
end)

H.test('repair_click refuses a stale item or take and changes nothing: a take that is not the one playing', function()
  local s, p = project()
  local other = s.fake.reaper.AddTakeToMediaItem(p.item)
  other.source = { file = 'other.wav' }
  s.fake.reaper.SetActiveTake(other)
  s.fake.calls = {}
  H.contains(error_event(s, p, { ITEM, TAKE, '4:4.003' }), 'not the take')
end)

-- Refusals: the request, the take and REAPER's state ------------------------------------------------------------

H.test('repair_click refuses clicks that are not pairs of times', function()
  for _, clicks in ipairs({ '', '4', '4:', ':4.003', '4.003:4', '4:4', 'a:b', '4:4.003,', '4:4.003;6:6.003', '-1:2', '4:4.001:4.002', 'nan:4' }) do
    local s, p = project()
    H.contains(error_event(s, p, { ITEM, TAKE, clicks }), 'not readable')
  end
end)

H.test('repair_click refuses a click longer than 50 ms', function()
  local s, p = project()
  H.contains(error_event(s, p, { ITEM, TAKE, '4:4.003,6:6.051' }), 'at most 50 ms')
end)

H.test('repair_click refuses more than 500 clicks', function()
  local parts = {}
  for index = 0, 500 do
    parts[#parts + 1] = string.format('%.3f:%.3f', 2 + index * 0.019, 2 + index * 0.019 + 0.001)
  end
  local s, p = project()
  H.contains(error_event(s, p, { ITEM, TAKE, table.concat(parts, ',') }), 'at most 500')
end)

H.test('repair_click refuses while REAPER records', function()
  local s, p = project()
  s.fake.play_state = 5
  H.contains(error_event(s, p, { ITEM, TAKE, '4:4.003' }), 'recording')
end)

H.test('repair_click refuses a MIDI take and a changed playback rate', function()
  local s, p = project({ midi = true })
  H.contains(error_event(s, p, { ITEM, TAKE, '4:4.003' }), 'MIDI')
  s, p = project({ playrate = 1.5 })
  H.contains(error_event(s, p, { ITEM, TAKE, '4:4.003' }), 'playback rate')
end)

H.test('repair_click refuses a REAPER without the calls it needs', function()
  local s, p = project()
  s.fake:remove_api('InsertEnvelopePoint')
  H.contains(error_event(s, p, { ITEM, TAKE, '4:4.003' }), 'cannot repair')
end)

H.test('repair_click answers ERROR and records no undo point when REAPER makes no volume envelope', function()
  local s, p = project()
  s.fake.makes_no_volume_envelope = true
  s:send('repair_click', 'c1', ITEM, TAKE, '4:4.003')
  local events = s:events()
  H.eq(#events, 1)
  H.eq(events[1][1], 'ERROR')
  H.contains(events[1][3], 'did not make a volume envelope')
  H.eq(#s.fake.undo, 0, 'no undo point')
  H.eq(s.fake.open_undo_blocks, 0, 'the block is closed')
  H.eq(calls_named(s, 'InsertEnvelopePoint'), 0)
  H.eq(p.intro.selected, true, 'the selection is as it was')
  H.eq(p.take.volume_env, nil)
end)

H.test('repair_click clamps a click a hair outside the item to the item', function()
  local s, p = project()
  -- Source 1.9999995 is half a microsecond before the item starts; 12.0000005 is half a microsecond after it ends.
  s:send('repair_click', 'c1', ITEM, TAKE, '1.9999995:2.002,11.997:12.0000005')
  H.eq(s:events()[1][1], 'CLICKS_REPAIRED')
  local list = p.take.volume_env.points
  H.eq(list[1].time, 0, 'the first point is at the item start')
  H.eq(list[#list].time, 10, 'the last point is at the item end')
end)
