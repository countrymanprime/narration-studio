-- reduce_range_gain (narration_range.lua): stretches of a take, given in the take's source time, are lowered by N dB with
-- points on the take's volume envelope and a short ramp at each edge. The audio, the item and every other item are left
-- as they were; one undo block; a stale item or take, and every refusal, changes nothing.

local H = require('harness')

local LABEL = 'Narration Utils: lower stretches'
local RAMP = 0.01

local ITEM = '{AAAAAAAA-0000-4000-8000-000000000001}'
local TAKE = '{AAAAAAAA-0000-4000-8000-000000000002}'
local STALE = '{FFFFFFFF-0000-4000-8000-00000000FFFF}'

-- Chapter 1: an intro (0-8), the take whose stretches are lowered (10-20, playing its file from 2 s, so source 2..12 is
-- item time 0..10) and a later item (24-30).
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

local function gain(db)
  return 10 ^ (-db / 20)
end

-- The volume envelope's points as { time, amplitude }, rounded to the microsecond and to six places.
local function points(s, take)
  local env = take.volume_env
  if not env then
    return nil
  end
  local out = {}
  for _, point in ipairs(env.points) do
    local amplitude = s.fake.reaper.ScaleFromEnvelopeMode(1, point.value)
    out[#out + 1] = { math.floor(point.time * 1e6 + 0.5) / 1e6, math.floor(amplitude * 1e6 + 0.5) / 1e6 }
  end
  return out
end

local function round(value)
  return math.floor(value * 1e6 + 0.5) / 1e6
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
  s:send('reduce_range_gain', 'g1', table.unpack(args))
  H.eq(s:events(), { expected })
  unchanged(s, p)
end

local function error_event(s, p, args)
  s:send('reduce_range_gain', 'g1', table.unpack(args))
  local events = s:events()
  H.eq(#events, 1)
  H.eq(events[1][1], 'ERROR')
  H.eq(events[1][2], 'g1')
  unchanged(s, p)
  return events[1][3]
end

-- 1. reduce_range_gain lowers each stretch by the dB given and leaves the rest, one undo point --------------------

H.test('reduce_range_gain lowers each stretch by the dB given and leaves the rest, one undo point', function()
  local s, p = project()
  s:send('reduce_range_gain', 'g1', ITEM, TAKE, '6', '4:5,8:8.5')
  H.eq(s:events(), { { 'RANGE_GAIN_REDUCED', 'g1', ITEM, TAKE, '2', '6.0', '1' } })
  local g = round(gain(6))
  H.eq(points(s, p.take), {
    { 2 - RAMP, 1 },
    { 2, g },
    { 3, g },
    { 3 + RAMP, 1 },
    { 6 - RAMP, 1 },
    { 6, g },
    { 6.5, g },
    { 6.5 + RAMP, 1 },
  }, 'each stretch is lowered between ramps back to where the take was')
  H.eq(s.fake:undo_labels(), { LABEL }, 'one undo point')
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test(
  'reduce_range_gain lowers each stretch by the dB given and leaves the rest, one undo point: the audio, the item and the other items are untouched',
  function()
    local s, p = project()
    s:send('reduce_range_gain', 'g1', ITEM, TAKE, '6', '4:5')
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
  end
)

H.test('reduce_range_gain lowers each stretch by the dB given and leaves the rest, one undo point: the selection is put back', function()
  local s, p = project()
  s:send('reduce_range_gain', 'g1', ITEM, TAKE, '6', '4:5')
  s:events()
  H.eq(p.intro.selected, true)
  H.eq(p.item.selected, false)
  H.eq(p.later.selected, false)
end)

H.test('reduce_range_gain lowers each stretch by the dB given and leaves the rest, one undo point: one Undo puts the take back', function()
  local s, p = project()
  s:send('reduce_range_gain', 'g1', ITEM, TAKE, '9', '4:5,8:8.5')
  s:events()
  H.eq(s.fake:undo_last_block(), LABEL)
  H.eq(p.take.volume_env, nil, 'the envelope it made is gone')
end)

H.test(
  'reduce_range_gain lowers each stretch by the dB given and leaves the rest, one undo point: an envelope the take has keeps its points and level',
  function()
    local s, p = project()
    -- The narrator has the take at -6 dB from an envelope with points at 0.5 and 9.5.
    local level = gain(6)
    p.take.volume_env = {
      points = {
        { time = 0.5, value = math.sqrt(level), shape = 0 },
        { time = 9.5, value = math.sqrt(level), shape = 0 },
      },
      visible = true,
    }
    s:send('reduce_range_gain', 'g1', ITEM, TAKE, '6', '4:5')
    H.eq(s:events()[1][1], 'RANGE_GAIN_REDUCED')
    H.eq(calls_named(s, 'Main_OnCommand'), 0, 'the envelope is not toggled')
    H.eq(p.take.volume_env.visible, true)
    local l, lg = round(level), round(level * gain(6))
    H.eq(points(s, p.take), {
      { 0.5, l },
      { 2 - RAMP, l },
      { 2, lg },
      { 3, lg },
      { 3 + RAMP, l },
      { 9.5, l },
    }, 'the stretch is lowered from the level the take had')
    H.eq(s.fake:undo_last_block(), LABEL)
    H.eq(#p.take.volume_env.points, 2, 'one Undo leaves the narrator points alone')
  end
)

H.test(
  'reduce_range_gain lowers each stretch by the dB given and leaves the rest, one undo point: stretches at the edges, out of order and overlapping',
  function()
    local s, p = project()
    -- Source 2..2.5 starts the item; 11.5..12 ends it; 6:7 and 6.5:7.5 overlap and 7.505:8 is closer than two ramps.
    s:send('reduce_range_gain', 'g1', ITEM, TAKE, '12', '11.5:12,6.5:7.5,2:2.5,6:7,7.505:8')
    H.eq(s:events(), { { 'RANGE_GAIN_REDUCED', 'g1', ITEM, TAKE, '3', '12.0', '1' } })
    local g = round(gain(12))
    H.eq(points(s, p.take), {
      { 0, g },
      { 0.5, g },
      { 0.5 + RAMP, 1 },
      { 4 - RAMP, 1 },
      { 4, g },
      { 6, g },
      { 6 + RAMP, 1 },
      { 9.5 - RAMP, 1 },
      { 9.5, g },
      { 10, g },
    }, 'no ramp outside the item, and stretches that touch are lowered as one')
  end
)

H.test('reduce_range_gain lowers each stretch by the dB given and leaves the rest, one undo point: a GUID without braces or in lower case resolves', function()
  local s, p = project()
  s:send('reduce_range_gain', 'g1', ITEM:lower():gsub('[{}]', ''), TAKE:lower(), '6', '4:5')
  H.eq(s:events()[1][1], 'RANGE_GAIN_REDUCED')
  H.eq(#points(s, p.take), 4)
end)

H.test('reduce_range_gain lowers each stretch by the dB given and leaves the rest, one undo point: the same request again changes nothing', function()
  local s, p = project()
  s:send('reduce_range_gain', 'g1', ITEM, TAKE, '6', '4:5')
  H.eq(s:events()[1][1], 'RANGE_GAIN_REDUCED')
  s.fake.calls = {}
  s:send('reduce_range_gain', 'g2', ITEM, TAKE, '6', '4:5')
  local events = s:events()
  H.eq(events[1][1], 'ERROR')
  H.contains(events[1][3], 'already has volume changes')
  H.eq(#points(s, p.take), 4, 'the stretch is not lowered twice')
  H.eq(s.fake:undo_labels(), { LABEL }, 'still one undo point')
  H.eq(calls_named(s, 'InsertEnvelopePoint'), 0)
end)

-- 2. reduce_range_gain refuses a stale item or take and changes nothing -------------------------------------------

H.test('reduce_range_gain refuses a stale item or take and changes nothing: an item GUID that does not resolve', function()
  local s, p = project()
  refused(s, p, { STALE, TAKE, '6', '4:5' }, { 'ITEM_STALE', 'g1', STALE, 'item' })
end)

H.test('reduce_range_gain refuses a stale item or take and changes nothing: a take that is not on the item', function()
  local s, p = project()
  refused(s, p, { ITEM, STALE, '6', '4:5' }, { 'ITEM_STALE', 'g1', STALE, 'take' })
end)

H.test('reduce_range_gain refuses a stale item or take and changes nothing: a take of another item', function()
  local s, p = project()
  local other = p.later.takes[1].guid
  refused(s, p, { ITEM, other, '6', '4:5' }, { 'ITEM_STALE', 'g1', other, 'take' })
end)

H.test('reduce_range_gain refuses a stale item or take and changes nothing: a stretch the item no longer plays', function()
  local s, p = project()
  refused(s, p, { ITEM, TAKE, '6', '4:5,1:1.5' }, { 'ITEM_STALE', 'g1', ITEM, 'item' })
  refused(s, p, { ITEM, TAKE, '6', '11.5:12.5' }, { 'ITEM_STALE', 'g1', ITEM, 'item' })
end)

H.test('reduce_range_gain refuses a stale item or take and changes nothing: a take that is not the one playing', function()
  local s, p = project()
  local other = s.fake.reaper.AddTakeToMediaItem(p.item)
  other.source = { file = 'other.wav' }
  s.fake.reaper.SetActiveTake(other)
  s.fake.calls = {}
  H.contains(error_event(s, p, { ITEM, TAKE, '6', '4:5' }), 'not the take')
end)

-- Refusals: the request, the take and REAPER's state ------------------------------------------------------------

H.test('reduce_range_gain refuses a reduction that is not from 1 to 24 dB', function()
  for _, db in ipairs({ '', 'abc', '0', '0.5', '25', '-6', 'nan', 'inf' }) do
    local s, p = project()
    H.contains(error_event(s, p, { ITEM, TAKE, db, '4:5' }), 'from 1 to 24 dB')
  end
end)

H.test('reduce_range_gain refuses stretches that are not pairs of times', function()
  for _, stretches in ipairs({ '', '4', '4:', ':5', '5:4', '4:4', 'a:b', '4:5,', '4:5;6:7', '-1:2', '4:5:6', 'nan:5' }) do
    local s, p = project()
    H.contains(error_event(s, p, { ITEM, TAKE, '6', stretches }), 'not readable')
  end
end)

H.test('reduce_range_gain refuses more than 500 stretches', function()
  local parts = {}
  for index = 0, 500 do
    parts[#parts + 1] = string.format('%.3f:%.3f', 2 + index * 0.019, 2 + index * 0.019 + 0.001)
  end
  local s, p = project()
  H.contains(error_event(s, p, { ITEM, TAKE, '6', table.concat(parts, ',') }), 'at most 500')
end)

H.test('reduce_range_gain refuses while REAPER records', function()
  local s, p = project()
  s.fake.play_state = 5
  H.contains(error_event(s, p, { ITEM, TAKE, '6', '4:5' }), 'recording')
end)

H.test('reduce_range_gain refuses a MIDI take and a changed playback rate', function()
  local s, p = project({ midi = true })
  H.contains(error_event(s, p, { ITEM, TAKE, '6', '4:5' }), 'MIDI')
  s, p = project({ playrate = 1.5 })
  H.contains(error_event(s, p, { ITEM, TAKE, '6', '4:5' }), 'playback rate')
end)

H.test('reduce_range_gain refuses a REAPER without the calls it needs', function()
  local s, p = project()
  s.fake:remove_api('InsertEnvelopePoint')
  H.contains(error_event(s, p, { ITEM, TAKE, '6', '4:5' }), 'cannot lower')
end)

H.test('reduce_range_gain answers ERROR and records no undo point when REAPER makes no volume envelope', function()
  local s, p = project()
  s.fake.makes_no_volume_envelope = true
  s:send('reduce_range_gain', 'g1', ITEM, TAKE, '6', '4:5')
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

H.test('reduce_range_gain clamps a stretch a hair outside the item to the item', function()
  local s, p = project()
  -- Source 1.9999995 is half a microsecond before the item starts; 12.0000005 is half a microsecond after it ends.
  s:send('reduce_range_gain', 'g1', ITEM, TAKE, '6', '1.9999995:3,11:12.0000005')
  H.eq(s:events()[1][1], 'RANGE_GAIN_REDUCED')
  local list = p.take.volume_env.points
  H.eq(list[1].time, 0, 'the first point is at the item start')
  H.eq(list[#list].time, 10, 'the last point is at the item end')
end)
