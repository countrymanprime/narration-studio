-- stack_takes and unstack_takes (narration_takes.lua, ADR 0860 point 4): later reads of a passage become takes of the
-- first read's item, their own items go to the muted Cuts track and the audio that follows moves up by the request's
-- shift, in one undo block; unstack_takes puts them back by the offsets the stacked takes recorded. Both read a payload
-- file the host wrote, check every field and every GUID before anything changes, and delete nothing the narrator
-- recorded.

local H = require('harness')

local STACK_LABEL = 'Narration Utils: stack takes'
local UNSTACK_LABEL = 'Narration Utils: unstack takes'
local CUTS_KEY = 'narration_utils_cuts'
local RECORD_KEY = 'narration_utils_stacked_from'

local function guid(n)
  return string.format('{%08X-0000-4000-8000-%012X}', 0xA0000000 + n, n)
end

local BASE, BASE_TAKE = guid(1), guid(2)
local RETRY1, RETRY1_TAKE = guid(3), guid(4)
local RETRY2, RETRY2_TAKE = guid(5), guid(6)
local BASE_B, BASE_B_TAKE = guid(7), guid(8)
local RETRY_B, RETRY_B_TAKE = guid(9), guid(10)
local STALE = '{FFFFFFFF-0000-4000-8000-00000000FFFF}'

-- Chapter 1: an intro (0-8), the first read (10-15), two retries (16-20 and 21-26) and a later passage (30-35); a second
-- track's item spans the same time (12-40) and must never move.
local function project()
  local s = H.session()
  local chapter = s.fake:add_track('Chapter 1')
  local other = s.fake:add_track('Chapter 2')
  local p = { chapter = chapter, other = other }
  p.intro = s.fake:add_item(chapter, { position = 0, length = 8, source = 'intro.wav' })
  p.base = s.fake:add_item(chapter, { guid = BASE, take_guid = BASE_TAKE, position = 10, length = 5, source = 'read1.wav' })
  p.retry1 = s.fake:add_item(chapter, { guid = RETRY1, take_guid = RETRY1_TAKE, position = 16, length = 4, source = 'read2.wav', startoffs = 1.5 })
  p.retry2 = s.fake:add_item(chapter, { guid = RETRY2, take_guid = RETRY2_TAKE, position = 21, length = 5, source = 'read3.wav' })
  p.later = s.fake:add_item(chapter, { position = 30, length = 5, source = 'later.wav' })
  p.elsewhere = s.fake:add_item(other, { position = 12, length = 28, source = 'ch2.wav' })
  s.fake.calls = {}
  return s, p
end

-- A second passage after the first: its first read (40-44) and one retry (45-49), and an item after it (52-55).
local function second_passage(s, p)
  p.base_b = s.fake:add_item(p.chapter, { guid = BASE_B, take_guid = BASE_B_TAKE, position = 40, length = 4, source = 'b1.wav' })
  p.retry_b = s.fake:add_item(p.chapter, { guid = RETRY_B, take_guid = RETRY_B_TAKE, position = 45, length = 4, source = 'b2.wav' })
  p.last = s.fake:add_item(p.chapter, { position = 52, length = 3, source = 'end.wav' })
  s.fake.calls = {}
end

local function payload(s, name, lines)
  local path = s:path(name)
  H.write_file(path, table.concat(lines, '\n') .. '\n')
  return path
end

-- The stack request for the first passage: both retries to the first read's spot; the audio after moves up by 11 s.
local function stack_lines()
  return {
    'shift|-11',
    'group|' .. BASE .. '|' .. BASE_TAKE,
    'move|' .. RETRY1_TAKE .. '|16|10|4',
    'move|' .. RETRY2_TAKE .. '|21|10|5',
  }
end

local function unstack_lines()
  return {
    'shift|11',
    'group|' .. BASE .. '|' .. BASE_TAKE,
    'move|' .. RETRY1_TAKE .. '|10|16|4',
    'move|' .. RETRY2_TAKE .. '|10|21|5',
  }
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

local function positions(track)
  local out = {}
  for _, item in ipairs(track.items) do
    out[#out + 1] = item.position
  end
  return out
end

local function sources(item)
  local out = {}
  for _, take in ipairs(item.takes) do
    out[#out + 1] = take.source.file
  end
  return out
end

-- What a refusal must leave as it was: every item where it was, no take added, no track added, no undo point.
local function unchanged(s, p, tracks)
  H.eq(#s.fake.tracks, tracks, 'no track is added')
  H.eq(#p.base.takes, 1, 'no take is added')
  H.eq(positions(p.chapter), { 0, 10, 16, 21, 30 }, 'nothing on the chapter track moves')
  H.truthy(p.retry1.track == p.chapter)
  H.eq(calls_named(s, 'AddTakeToMediaItem'), 0)
  H.eq(calls_named(s, 'MoveMediaItemToTrack'), 0)
  H.eq(calls_named(s, 'SetMediaItemInfo_Value'), 0)
  H.eq(#s.fake.undo, 0, 'no undo point')
  H.eq(s.fake.open_undo_blocks, 0)
end

local function refused(s, p, lines, expected)
  local tracks = #s.fake.tracks
  s:send('stack_takes', 's1', payload(s, 'stack.txt', lines))
  H.eq(s:events(), { expected })
  unchanged(s, p, tracks)
end

-- 1. stack-makes-later-reads-takes-of-the-first-item --------------------------------------------------------------

H.test('stack-makes-later-reads-takes-of-the-first-item: each retry is a take of the first item, in one undo block', function()
  local s, p = project()
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  H.eq(s:events(), { { 'TAKES_STACKED', 's1', '1', '2', '-11.000', '1' } })
  H.eq(sources(p.base), { 'read1.wav', 'read2.wav', 'read3.wav' }, 'the retries are takes of the first item')
  H.eq(p.base.takes[2].startoffs, 1.5, 'a take plays its read from where its item did')
  H.eq(p.base.takes[3].startoffs, 0)
  H.eq(p.base.position, 10, 'the first read does not move')
  H.eq(p.base.length, 5, 'adding a take leaves the item length')
  H.eq(s.fake.reaper.GetActiveTake(p.base).guid, BASE_TAKE, 'the first read stays the active take')
  H.eq(calls_named(s, 'SetActiveTake'), 0)
  H.eq(s.fake:undo_labels(), { STACK_LABEL })
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('stack-makes-later-reads-takes-of-the-first-item: the retries move to the muted Cuts track and nothing is deleted', function()
  local s, p = project()
  local items = #s.fake.items
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  H.eq(s:events()[1][1], 'TAKES_STACKED')
  local cuts = cuts_track(s)
  H.truthy(cuts, 'a Cuts track is keyed')
  H.eq(cuts.name, 'Cuts')
  H.truthy(cuts.muted, 'the Cuts track is muted')
  H.truthy(p.retry1.track == cuts)
  H.truthy(p.retry2.track == cuts)
  H.eq({ p.retry1.position, p.retry2.position }, { 16, 21 }, 'a moved read keeps its time on the Cuts track')
  H.eq(#s.fake.items, items, 'no item is removed')
  H.eq(calls_named(s, 'DeleteTrackMediaItem'), 0)
  H.eq(calls_named(s, 'Main_OnCommand'), 0)
  H.eq(#p.retry1.takes, 1, 'the read keeps its own take, so its audio stays referenced')
end)

H.test('stack-makes-later-reads-takes-of-the-first-item: each stacked take records where its read came from', function()
  local s, p = project()
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  s:events()
  H.eq(p.base.takes[2].ext[RECORD_KEY], RETRY1 .. '|' .. RETRY1_TAKE .. '|' .. p.chapter.guid .. '|16.000000|6.000000')
  H.eq(p.base.takes[3].ext[RECORD_KEY], RETRY2 .. '|' .. RETRY2_TAKE .. '|' .. p.chapter.guid .. '|21.000000|11.000000')
  H.eq(p.base.takes[1].ext[RECORD_KEY], nil, 'the first read records nothing')
end)

H.test('stack-makes-later-reads-takes-of-the-first-item: one Undo puts every read back', function()
  local s, p = project()
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  s:events()
  H.eq(s.fake:undo_last_block(), STACK_LABEL)
  H.eq(#p.base.takes, 1)
  H.eq(positions(p.chapter), { 0, 10, 16, 21, 30 })
  H.truthy(p.retry1.track == p.chapter)
end)

H.test('stack-makes-later-reads-takes-of-the-first-item: an existing Cuts track is used, not a second one', function()
  local s, p = project()
  local cuts = s.fake:add_track('Cuts')
  local tracks = #s.fake.tracks
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  H.eq(s:events()[1][1], 'TAKES_STACKED')
  H.eq(#s.fake.tracks, tracks)
  H.truthy(p.retry1.track == cuts)
  H.eq(cuts.ext[CUTS_KEY], '1')
end)

-- 2. all-or-nothing-validation -------------------------------------------------------------------------------------

H.test('all-or-nothing-validation: a first read that no longer resolves answers ITEM_STALE and changes nothing', function()
  local s, p = project()
  local lines = stack_lines()
  lines[2] = 'group|' .. STALE .. '|' .. BASE_TAKE
  refused(s, p, lines, { 'ITEM_STALE', 's1', STALE, 'item' })
end)

H.test('all-or-nothing-validation: a base take no longer on the first item answers ITEM_STALE', function()
  local s, p = project()
  local lines = stack_lines()
  lines[2] = 'group|' .. BASE .. '|' .. RETRY1_TAKE
  table.remove(lines, 3)
  refused(s, p, lines, { 'ITEM_STALE', 's1', RETRY1_TAKE, 'take' })
end)

H.test('all-or-nothing-validation: a retry that no longer resolves answers ITEM_STALE', function()
  local s, p = project()
  local lines = stack_lines()
  lines[4] = 'move|' .. STALE .. '|21|10|5'
  refused(s, p, lines, { 'ITEM_STALE', 's1', STALE, 'take' })
end)

H.test('all-or-nothing-validation: one stale group stops the whole request, so no group is stacked', function()
  local s, p = project()
  second_passage(s, p)
  local lines = {
    'shift|-16',
    'group|' .. BASE .. '|' .. BASE_TAKE,
    'move|' .. RETRY1_TAKE .. '|16|10|4',
    'move|' .. RETRY2_TAKE .. '|21|10|5',
    'group|' .. BASE_B .. '|' .. BASE_B_TAKE,
    'move|' .. STALE .. '|45|40|4',
  }
  s:send('stack_takes', 's1', payload(s, 'stack.txt', lines))
  H.eq(s:events(), { { 'ITEM_STALE', 's1', STALE, 'take' } })
  H.eq(#p.base.takes, 1, 'the first group is not stacked either')
  H.eq(positions(p.chapter), { 0, 10, 16, 21, 30, 40, 45, 52 })
  H.eq(#s.fake.undo, 0)
end)

H.test('all-or-nothing-validation: a retry that moved since the app read it answers ITEM_STALE', function()
  local s, p = project()
  p.retry2.position = 22
  local tracks = #s.fake.tracks
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  H.eq(s:events(), { { 'ITEM_STALE', 's1', RETRY2_TAKE, 'take' } })
  H.eq(#s.fake.tracks, tracks)
  H.eq(#p.base.takes, 1)
  H.eq(#s.fake.undo, 0)
end)

H.test('all-or-nothing-validation: a payload with no groups answers Nothing to stack and opens no undo block', function()
  local s, p = project()
  refused(s, p, { 'shift|0' }, { 'ERROR', 's1', 'Nothing to stack.' })
end)

H.test('all-or-nothing-validation: what REAPER cannot stack is refused before any change', function()
  local cases = {
    {
      'a read longer than the first read',
      function(_, p)
        p.retry2.length = 6
      end,
      { 'shift|-12', 'group|' .. BASE .. '|' .. BASE_TAKE, 'move|' .. RETRY2_TAKE .. '|21|10|6' },
      'That read is longer than the first read, so it cannot be one of its takes.',
    },
    {
      'a read on another track',
      function(s, p)
        s.fake.reaper.MoveMediaItemToTrack(p.retry2, p.other)
        s.fake.calls = {}
      end,
      { 'shift|-11', 'group|' .. BASE .. '|' .. BASE_TAKE, 'move|' .. RETRY2_TAKE .. '|21|10|5' },
      'A read to stack is on another track than the first read.',
    },
    {
      'a destination other than the first read',
      nil,
      { 'shift|-11', 'group|' .. BASE .. '|' .. BASE_TAKE, 'move|' .. RETRY2_TAKE .. '|21|12|5' },
      'A take can only go to the first read’s spot.',
    },
    {
      'a fixed-lane track',
      function(s, p)
        s.fake:set_fixed_lanes(p.chapter, 2)
      end,
      stack_lines(),
      'This track uses fixed item lanes, so its reads cannot be stacked as takes.',
    },
    {
      'a shift the reads do not add up to',
      nil,
      { 'shift|-3', 'group|' .. BASE .. '|' .. BASE_TAKE, 'move|' .. RETRY1_TAKE .. '|16|10|4', 'move|' .. RETRY2_TAKE .. '|21|10|5' },
      'The chapter changed since the plan was made. Nothing was stacked.',
    },
    {
      'other audio between the reads',
      function(s, p)
        s.fake:add_item(p.chapter, { position = 20.2, length = 0.5, source = 'breath.wav' })
        s.fake.calls = {}
      end,
      stack_lines(),
      'Other audio sits between the reads, so nothing was stacked.',
    },
    {
      'a read with a changed playback rate',
      function(_, p)
        p.retry1.takes[1].playrate = 1.1
      end,
      stack_lines(),
      'A read with a changed playback rate cannot be stacked.',
    },
    {
      'the first read named as a retry',
      nil,
      { 'shift|0', 'group|' .. BASE .. '|' .. BASE_TAKE, 'move|' .. BASE_TAKE .. '|10|10|5' },
      'The stacking request is not readable, so nothing changed.',
    },
  }
  for _, case in ipairs(cases) do
    local s, p = project()
    if case[2] then
      case[2](s, p)
    end
    local tracks = #s.fake.tracks
    s:send('stack_takes', 's1', payload(s, 'stack.txt', case[3]))
    H.eq(s:events(), { { 'ERROR', 's1', case[4] } }, case[1])
    H.eq(#s.fake.tracks, tracks, case[1])
    H.eq(#p.base.takes, 1, case[1])
    H.eq(#s.fake.undo, 0, case[1])
    H.eq(calls_named(s, 'MoveMediaItemToTrack'), 0, case[1])
  end
end)

H.test('all-or-nothing-validation: nothing changes while REAPER records or without the calls it needs', function()
  local s, p = project()
  s.fake.play_state = 5
  refused(s, p, stack_lines(), { 'ERROR', 's1', 'REAPER is recording. Stop recording first.' })
  s.fake.play_state = 0
  s.fake:remove_api('AddTakeToMediaItem')
  refused(s, p, stack_lines(), { 'ERROR', 's1', 'This REAPER version cannot stack takes.' })
end)

H.test('all-or-nothing-validation: a read already on the Cuts track is refused', function()
  local s, p = project()
  local cuts = s.fake:add_track('Cuts')
  cuts.ext[CUTS_KEY] = '1'
  s.fake.reaper.MoveMediaItemToTrack(p.retry2, cuts)
  s.fake.calls = {}
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  H.eq(s:events(), { { 'ERROR', 's1', 'A read to stack is on another track than the first read.' } })
  H.eq(#s.fake.undo, 0)
end)

-- 3. later-audio-and-other-tracks-stay-correct ----------------------------------------------------------------------

H.test('later-audio-and-other-tracks-stay-correct: the audio after moves up by the shift, nothing else moves', function()
  local s, p = project()
  local cuts = s.fake:add_track('Cuts')
  local cut = s.fake:add_item(cuts, { position = 40, length = 2, source = 'cut.wav' })
  s.fake.calls = {}
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  s:events()
  H.eq(positions(p.chapter), { 0, 10, 19 }, 'the later passage moves up by 11 s and the intro stays')
  H.eq(p.later.position, 19)
  H.truthy(p.later.position >= p.base.position + p.base.length, 'nothing overlaps the first read')
  H.eq(p.elsewhere.position, 12, 'another track never moves')
  H.eq(cut.position, 40, 'the Cuts track never moves')
end)

H.test('later-audio-and-other-tracks-stay-correct: with two passages the audio between moves by the first shift only', function()
  local s, p = project()
  second_passage(s, p)
  local lines = {
    'shift|-16',
    'group|' .. BASE .. '|' .. BASE_TAKE,
    'move|' .. RETRY1_TAKE .. '|16|10|4',
    'move|' .. RETRY2_TAKE .. '|21|10|5',
    'group|' .. BASE_B .. '|' .. BASE_B_TAKE,
    'move|' .. RETRY_B_TAKE .. '|45|40|4',
  }
  s:send('stack_takes', 's1', payload(s, 'stack.txt', lines))
  H.eq(s:events(), { { 'TAKES_STACKED', 's1', '2', '3', '-16.000', '1' } })
  H.eq(positions(p.chapter), { 0, 10, 19, 29, 36 })
  H.eq(p.base_b.position, 29, 'the second passage moves by the first shift')
  H.eq(p.last.position, 36, 'the audio after both moves by both')
  H.eq(sources(p.base_b), { 'b1.wav', 'b2.wav' })
  H.eq(s.fake:undo_labels(), { STACK_LABEL }, 'one undo block for the whole request')
end)

-- 4. unstack-restores-by-recorded-offsets ---------------------------------------------------------------------------

H.test('unstack-restores-by-recorded-offsets: every read goes back where it was, in one undo block', function()
  local s, p = project()
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  s:events()
  s:send('unstack_takes', 'u1', payload(s, 'unstack.txt', unstack_lines()))
  H.eq(s:events(), { { 'TAKES_UNSTACKED', 'u1', '1', '2', '11.000', '1' } })
  H.eq(positions(p.chapter), { 0, 10, 16, 21, 30 })
  H.truthy(p.retry1.track == p.chapter)
  H.truthy(p.retry2.track == p.chapter)
  H.eq(sources(p.base), { 'read1.wav' }, 'the stacked takes are gone from the first item')
  H.eq(s.fake.reaper.GetActiveTake(p.base).guid, BASE_TAKE)
  H.eq(sources(p.retry1), { 'read2.wav' }, 'each read keeps its own take')
  H.eq(p.elsewhere.position, 12)
  H.eq(s.fake:undo_labels(), { STACK_LABEL, UNSTACK_LABEL })
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(calls_named(s, 'DeleteTrackMediaItem'), 0)
  H.eq(calls_named(s, 'Main_OnCommand'), 0)
end)

H.test('unstack-restores-by-recorded-offsets: one Undo stacks them again', function()
  local s, p = project()
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  s:send('unstack_takes', 'u1', payload(s, 'unstack.txt', unstack_lines()))
  s:events()
  H.eq(s.fake:undo_last_block(), UNSTACK_LABEL)
  H.eq(sources(p.base), { 'read1.wav', 'read2.wav', 'read3.wav' })
  H.eq(positions(p.chapter), { 0, 10, 19 })
end)

H.test('unstack-restores-by-recorded-offsets: one take of a stack goes back and the other stays', function()
  local s, p = project()
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  s:events()
  -- Back out only the second retry: it ends at 21 + 5 - 10 = 16 s past the first read's start, so the audio after moves
  -- out by 16 - 5 = 11 s again.
  s:send('unstack_takes', 'u1', payload(s, 'unstack.txt', { 'shift|11', 'group|' .. BASE .. '|' .. BASE_TAKE, 'move|' .. RETRY2_TAKE .. '|10|21|5' }))
  H.eq(s:events(), { { 'TAKES_UNSTACKED', 'u1', '1', '1', '11.000', '1' } })
  H.eq(sources(p.base), { 'read1.wav', 'read2.wav' })
  H.eq(positions(p.chapter), { 0, 10, 21, 30 })
  H.truthy(p.retry1.track == cuts_track(s))
end)

H.test('unstack-restores-by-recorded-offsets: an earlier passage unstacked while a later one is stacked restores both', function()
  local s, p = project()
  second_passage(s, p)
  s:send(
    'stack_takes',
    's1',
    payload(s, 'stack.txt', {
      'shift|-16',
      'group|' .. BASE .. '|' .. BASE_TAKE,
      'move|' .. RETRY1_TAKE .. '|16|10|4',
      'move|' .. RETRY2_TAKE .. '|21|10|5',
      'group|' .. BASE_B .. '|' .. BASE_B_TAKE,
      'move|' .. RETRY_B_TAKE .. '|45|40|4',
    })
  )
  s:events()
  H.eq(positions(p.chapter), { 0, 10, 19, 29, 36 })
  s:send('unstack_takes', 'u1', payload(s, 'unstack.txt', unstack_lines()))
  H.eq(s:events(), { { 'TAKES_UNSTACKED', 'u1', '1', '2', '11.000', '1' } })
  H.eq(positions(p.chapter), { 0, 10, 16, 21, 30, 40, 47 }, 'the later stacked passage moves out with the audio after')
  H.eq(sources(p.base_b), { 'b1.wav', 'b2.wav' }, 'the later passage stays stacked')
  s:send('unstack_takes', 'u2', payload(s, 'unstack-b.txt', { 'shift|5', 'group|' .. BASE_B .. '|' .. BASE_B_TAKE, 'move|' .. RETRY_B_TAKE .. '|40|45|4' }))
  H.eq(s:events(), { { 'TAKES_UNSTACKED', 'u2', '1', '1', '5.000', '1' } })
  H.eq(positions(p.chapter), { 0, 10, 16, 21, 30, 40, 45, 52 }, 'every read is back where it was recorded')
end)

H.test('unstack-restores-by-recorded-offsets: two passages unstacked in one request each go back by their own offsets', function()
  local s, p = project()
  second_passage(s, p)
  s:send(
    'stack_takes',
    's1',
    payload(s, 'stack.txt', {
      'shift|-16',
      'group|' .. BASE .. '|' .. BASE_TAKE,
      'move|' .. RETRY1_TAKE .. '|16|10|4',
      'move|' .. RETRY2_TAKE .. '|21|10|5',
      'group|' .. BASE_B .. '|' .. BASE_B_TAKE,
      'move|' .. RETRY_B_TAKE .. '|45|40|4',
    })
  )
  s:events()
  -- The second passage's first read now starts at 29 s, so its retry goes back to 29 + 5 s, and the first passage's
  -- 11 s then carry both out to where they were recorded.
  s:send(
    'unstack_takes',
    'u1',
    payload(s, 'unstack.txt', {
      'shift|16',
      'group|' .. BASE .. '|' .. BASE_TAKE,
      'move|' .. RETRY1_TAKE .. '|10|16|4',
      'move|' .. RETRY2_TAKE .. '|10|21|5',
      'group|' .. BASE_B .. '|' .. BASE_B_TAKE,
      'move|' .. RETRY_B_TAKE .. '|29|34|4',
    })
  )
  H.eq(s:events(), { { 'TAKES_UNSTACKED', 'u1', '2', '3', '16.000', '1' } })
  H.eq(positions(p.chapter), { 0, 10, 16, 21, 30, 40, 45, 52 })
  H.eq(s.fake:undo_labels(), { STACK_LABEL, UNSTACK_LABEL })
end)

H.test('unstack-restores-by-recorded-offsets: the first read becomes active again when it is not the first take', function()
  local s, p = project()
  -- The first read's item already held an older take, listed first; the first read is its second, active take.
  local older = s.fake.reaper.AddTakeToMediaItem(p.base)
  older.source = { file = 'older.wav' }
  table.remove(p.base.takes)
  table.insert(p.base.takes, 1, older)
  p.base.active_index = 2
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  H.eq(s:events()[1][1], 'TAKES_STACKED')
  H.eq(sources(p.base), { 'older.wav', 'read1.wav', 'read2.wav', 'read3.wav' })
  s.fake.reaper.SetActiveTake(p.base.takes[4])
  s:send('unstack_takes', 'u1', payload(s, 'unstack.txt', unstack_lines()))
  H.eq(s:events()[1][1], 'TAKES_UNSTACKED')
  H.eq(sources(p.base), { 'older.wav', 'read1.wav' })
  H.eq(s.fake.reaper.GetActiveTake(p.base).guid, BASE_TAKE, 'the first read, not the older take, is active')
end)

H.test('unstack-restores-by-recorded-offsets: a take no longer on the first item answers ITEM_STALE', function()
  local s, p = project()
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  s:events()
  table.remove(p.base.takes, 3)
  s.fake.calls = {}
  local undo = #s.fake.undo
  s:send('unstack_takes', 'u1', payload(s, 'unstack.txt', unstack_lines()))
  H.eq(s:events(), { { 'ITEM_STALE', 'u1', RETRY2_TAKE, 'take' } })
  H.eq(#s.fake.undo, undo, 'no undo point')
  H.eq(calls_named(s, 'SetItemStateChunk'), 0, 'no take is removed')
  H.truthy(p.retry1.track == cuts_track(s), 'no read goes back')
end)

H.test('unstack-restores-by-recorded-offsets: a read no longer on the Cuts track answers ITEM_STALE', function()
  local s, p = project()
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  s:events()
  s.fake.reaper.MoveMediaItemToTrack(p.retry1, p.other)
  s.fake.calls = {}
  s:send('unstack_takes', 'u1', payload(s, 'unstack.txt', unstack_lines()))
  H.eq(s:events(), { { 'ITEM_STALE', 'u1', RETRY1, 'item' } })
  H.eq(calls_named(s, 'SetItemStateChunk'), 0)
end)

H.test('unstack-restores-by-recorded-offsets: a destination other than the recorded offset is refused', function()
  local s, p = project()
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  s:events()
  s.fake.calls = {}
  local lines = unstack_lines()
  lines[3] = 'move|' .. RETRY1_TAKE .. '|10|18|4'
  s:send('unstack_takes', 'u1', payload(s, 'unstack.txt', lines))
  H.eq(s:events(), { { 'ERROR', 'u1', 'The chapter changed since the plan was made. Nothing was moved back.' } })
  H.eq(calls_named(s, 'SetItemStateChunk'), 0)
  H.eq(#p.base.takes, 3)
end)

H.test('unstack-restores-by-recorded-offsets: an active stacked take gives way to the first read', function()
  local s, p = project()
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  s:events()
  s.fake.reaper.SetActiveTake(p.base.takes[3])
  s:send('unstack_takes', 'u1', payload(s, 'unstack.txt', unstack_lines()))
  H.eq(s:events()[1][1], 'TAKES_UNSTACKED')
  H.eq(s.fake.reaper.GetActiveTake(p.base).guid, BASE_TAKE)
end)

H.test('unstack-restores-by-recorded-offsets: an active take the narrator chose stays active', function()
  local s, p = project()
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  s:events()
  s.fake.reaper.SetActiveTake(p.base.takes[2])
  s:send('unstack_takes', 'u1', payload(s, 'unstack.txt', { 'shift|11', 'group|' .. BASE .. '|' .. BASE_TAKE, 'move|' .. RETRY2_TAKE .. '|10|21|5' }))
  H.eq(s:events()[1][1], 'TAKES_UNSTACKED')
  H.eq(s.fake.reaper.GetActiveTake(p.base).guid, p.base.takes[2].guid)
  H.eq(p.base.takes[2].source.file, 'read2.wav')
end)

H.test('unstack-restores-by-recorded-offsets: nothing to move back opens no undo block', function()
  local s = project()
  s:send('unstack_takes', 'u1', payload(s, 'unstack.txt', { 'shift|0' }))
  H.eq(s:events(), { { 'ERROR', 'u1', 'Nothing to un-stack.' } })
  H.eq(#s.fake.undo, 0)
end)

-- 5. payload-is-validated-and-bounded ------------------------------------------------------------------------------

H.test('payload-is-validated-and-bounded: a malformed payload answers an ERROR and changes nothing', function()
  local unreadable = 'The stacking request is not readable, so nothing changed.'
  local group = 'group|' .. BASE .. '|' .. BASE_TAKE
  local cases = {
    { 'empty', {} },
    { 'no shift first', { group, 'move|' .. RETRY1_TAKE .. '|16|10|4' } },
    { 'a shift that is not a number', { 'shift|soon', group, 'move|' .. RETRY1_TAKE .. '|16|10|4' } },
    { 'a hex number', { 'shift|-0x0B', group, 'move|' .. RETRY1_TAKE .. '|16|10|4' } },
    { 'a stacking shift that is positive', { 'shift|11', group, 'move|' .. RETRY1_TAKE .. '|16|10|4' } },
    { 'a move before any group', { 'shift|-6', 'move|' .. RETRY1_TAKE .. '|16|10|4' } },
    { 'a group with no move', { 'shift|0', group } },
    { 'a GUID of the wrong shape', { 'shift|-6', 'group|' .. BASE .. '|take-1', 'move|' .. RETRY1_TAKE .. '|16|10|4' } },
    { 'a negative time', { 'shift|-6', group, 'move|' .. RETRY1_TAKE .. '|-16|10|4' } },
    { 'a zero length', { 'shift|-6', group, 'move|' .. RETRY1_TAKE .. '|16|10|0' } },
    { 'a time that is not finite', { 'shift|-6', group, 'move|' .. RETRY1_TAKE .. '|inf|10|4' } },
    { 'a take named twice', { 'shift|-6', group, 'move|' .. RETRY1_TAKE .. '|16|10|4', 'move|' .. RETRY1_TAKE .. '|16|10|4' } },
    { 'an item in two groups', { 'shift|-6', group, 'move|' .. RETRY1_TAKE .. '|16|10|4', group, 'move|' .. RETRY2_TAKE .. '|21|10|5' } },
    { 'an extra field', { 'shift|-6', group, 'move|' .. RETRY1_TAKE .. '|16|10|4|9' } },
    { 'an unknown line', { 'shift|-6', group, 'move|' .. RETRY1_TAKE .. '|16|10|4', 'path|C:/Windows' } },
    { 'a blank line', { 'shift|-6', '', group, 'move|' .. RETRY1_TAKE .. '|16|10|4' } },
  }
  for _, case in ipairs(cases) do
    local s, p = project()
    local tracks = #s.fake.tracks
    s:send('stack_takes', 's1', payload(s, 'stack.txt', case[2]))
    H.eq(s:events(), { { 'ERROR', 's1', unreadable } }, case[1])
    unchanged(s, p, tracks)
  end
end)

H.test('payload-is-validated-and-bounded: an oversized payload is refused before it is read', function()
  local s, p = project()
  local lines = { 'shift|-6', 'group|' .. BASE .. '|' .. BASE_TAKE, 'move|' .. RETRY1_TAKE .. '|16|10|4', ('x'):rep(70000) }
  refused(s, p, lines, { 'ERROR', 's1', 'The stacking request is too large, so nothing changed.' })
end)

H.test('payload-is-validated-and-bounded: too many groups or moves are refused', function()
  local s, p = project()
  local lines = { 'shift|-6' }
  for n = 1, 201 do
    lines[#lines + 1] = string.format('group|{%08X-0000-4000-8000-000000000001}|{%08X-0000-4000-8000-000000000002}', n, n)
    lines[#lines + 1] = string.format('move|{%08X-0000-4000-8000-000000000003}|16|10|4', n)
  end
  refused(s, p, lines, { 'ERROR', 's1', 'The stacking request is too large, so nothing changed.' })
end)

H.test('payload-is-validated-and-bounded: a missing payload file answers an ERROR', function()
  local s, p = project()
  local tracks = #s.fake.tracks
  s:send('stack_takes', 's1', s:path('missing.txt'))
  H.eq(s:events(), { { 'ERROR', 's1', 'The stacking request was not found.' } })
  unchanged(s, p, tracks)
  s:send('unstack_takes', 'u1', s:path('missing.txt'))
  H.eq(s:events(), { { 'ERROR', 'u1', 'The stacking request was not found.' } })
end)

H.test('payload-is-validated-and-bounded: an unstacking shift that is negative is refused', function()
  local s, p = project()
  s:send('stack_takes', 's1', payload(s, 'stack.txt', stack_lines()))
  s:events()
  local lines = unstack_lines()
  lines[1] = 'shift|-11'
  s:send('unstack_takes', 'u1', payload(s, 'unstack.txt', lines))
  H.eq(s:events(), { { 'ERROR', 'u1', 'The stacking request is not readable, so nothing changed.' } })
  H.eq(#p.base.takes, 3)
end)

H.test('payload-is-validated-and-bounded: GUIDs match whatever their case, and CRLF lines read the same', function()
  local s, p = project()
  local lines = stack_lines()
  lines[2] = lines[2]:lower()
  H.write_file(s:path('stack.txt'), table.concat(lines, '\r\n') .. '\r\n')
  s:send('stack_takes', 's1', s:path('stack.txt'))
  H.eq(s:events()[1][1], 'TAKES_STACKED')
  H.eq(#p.base.takes, 3)
end)
