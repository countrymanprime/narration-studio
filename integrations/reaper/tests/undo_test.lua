-- last_action and undo_last (narration_undo.lua): read whether the next undo point in REAPER is one an app action of a given
-- kind made, and undo up to 12 such points from the top, one at a time, re-reading the top before each. A point whose label
-- is not exactly the kind's is never undone; a kind or label not in the bridge's fixed table is refused; nothing is undone
-- while REAPER records. A label read from the project is never written to events.log.

local H = require('harness')

local CUT = 'Narration Utils: delete words'
local FOREIGN = 'Move items'
local OTHER_OURS = 'Narration Utils: repair clicks'
local RECORDING = 'REAPER is recording. Stop recording first.'
local BAD_KIND = 'That is not an action this app can undo.'
local BAD_STEPS = 'The number of undo steps must be a whole number from 1 to 12.'

-- A chapter track with one item (10-30) the tests cut words out of with delete_range.
local function project()
  local s = H.session()
  local chapter = s.fake:add_track('Chapter 1')
  local item = s.fake:add_item(chapter, { position = 10, length = 20, source = 'ch1.wav' })
  s.fake.calls = {}
  return s, { chapter = chapter, item = item }
end

-- Cuts start..end out of p.item with delete_range (close mode), the way the app's cut does, and returns its answer.
local function cut(s, p, start, finish)
  s:send('delete_range', 'cut', p.item.guid, tostring(start), tostring(finish), 'close', '0')
  local events = s:events()
  H.eq(events[1][1], 'RANGE_CUT', 'the cut is made')
  return events[1]
end

-- Pushes an undo point the way a narrator's own edit in REAPER leaves one: a label, and nothing for the fake to restore.
local function narrator_edit(s, label)
  s.fake.undo[#s.fake.undo + 1] = { label = label }
end

local function undos(s)
  local count = 0
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'Undo_DoUndo2' then
      count = count + 1
    end
  end
  return count
end

-- 1. last_action reads the top of the undo history and changes nothing -----------------------------------------

H.test('last_action: right after a cut, the next undo point is this kind', function()
  local s, p = project()
  cut(s, p, 14, 16)
  local labels = s.fake:undo_labels()
  s:send('last_action', 'l1', 'cut_range')
  H.eq(s:events(), { { 'LAST_ACTION', 'l1', 'cut_range', 'this' } })
  H.eq(s.fake:undo_labels(), labels, 'a read leaves the history as it was')
  H.eq(undos(s), 0, 'nothing is undone')
  H.eq(#s.fake.items, 3, 'the cut stays')
end)

H.test('last_action: a narrator edit on top is other, and its label is not written back', function()
  local s, p = project()
  cut(s, p, 14, 16)
  narrator_edit(s, FOREIGN)
  s:send('last_action', 'l1', 'cut_range')
  local events = s:events()
  H.eq(events, { { 'LAST_ACTION', 'l1', 'cut_range', 'other' } })
  local log = H.read_text(s:path('events.log'))
  H.truthy(not log:find('Move', 1, true), 'the foreign label is not in events.log')
end)

H.test('last_action: another of the app own labels on top is other: only the exact label counts', function()
  local s, p = project()
  cut(s, p, 14, 16)
  for _, label in ipairs({ OTHER_OURS, CUT .. ' ', 'narration utils: delete words', 'Narration Utils: delete' }) do
    narrator_edit(s, label)
    s:send('last_action', 'l1', 'cut_range')
    H.eq(s:events(), { { 'LAST_ACTION', 'l1', 'cut_range', 'other' } }, label)
    table.remove(s.fake.undo)
  end
end)

H.test('last_action: no undo history is other', function()
  local s = project()
  s:send('last_action', 'l1', 'cut_range')
  H.eq(s:events(), { { 'LAST_ACTION', 'l1', 'cut_range', 'other' } })
end)

H.test('last_action: a kind or a label not in the table is refused', function()
  local s, p = project()
  cut(s, p, 14, 16)
  for _, kind in ipairs({ '', 'fx_range', CUT, 'CUT_RANGE', '__index' }) do
    s:send('last_action', 'l1', kind)
    H.eq(s:events(), { { 'ERROR', 'l1', BAD_KIND } }, kind)
  end
  H.eq(undos(s), 0)
end)

H.test('last_action: while REAPER records it still reads, and changes nothing', function()
  local s, p = project()
  cut(s, p, 14, 16)
  s.fake.play_state = 5
  s:send('last_action', 'l1', 'cut_range')
  H.eq(s:events(), { { 'LAST_ACTION', 'l1', 'cut_range', 'this' } })
  H.eq(undos(s), 0)
end)

-- 2. undo_last undoes this kind's points from the top --------------------------------------------------------------

H.test('undo_last: one step undoes the cut and gives the item back whole', function()
  local s, p = project()
  local tracks = #s.fake.tracks
  cut(s, p, 14, 16)
  s:send('undo_last', 'u1', 'cut_range', '1')
  H.eq(s:events(), { { 'UNDONE_LAST', 'u1', 'cut_range', '1', '1' } })
  H.eq(s.fake:undo_labels(), {}, 'the cut point is gone from the history')
  H.eq(#s.fake.items, 1, 'the pieces are one item again')
  H.eq({ p.item.position, p.item.length }, { 10, 20 })
  H.eq(#s.fake.tracks, tracks, 'the Cuts track the cut added is gone')
  H.eq(undos(s), 1)
  H.eq(s.fake.open_undo_blocks, 0, 'an undo opens no block')
end)

H.test('undo_last: N steps undo N cuts, newest first', function()
  local s, p = project()
  cut(s, p, 24, 26)
  cut(s, p, 14, 16)
  cut(s, p, 11, 12)
  H.eq(s.fake:undo_labels(), { CUT, CUT, CUT })
  s:send('undo_last', 'u1', 'cut_range', '2')
  H.eq(s:events(), { { 'UNDONE_LAST', 'u1', 'cut_range', '2', '2' } })
  H.eq(s.fake:undo_labels(), { CUT }, 'the oldest cut stays')
  H.eq(undos(s), 2)
end)

H.test('undo_last: a narrator edit on top is refused and nothing is undone', function()
  local s, p = project()
  cut(s, p, 14, 16)
  narrator_edit(s, FOREIGN)
  local items = #s.fake.items
  s:send('undo_last', 'u1', 'cut_range', '1')
  H.eq(s:events(), { { 'UNDONE_LAST', 'u1', 'cut_range', '1', '0' } })
  H.eq(s.fake:undo_labels(), { CUT, FOREIGN }, 'the history is as it was')
  H.eq(#s.fake.items, items, 'the cut stays')
  H.eq(undos(s), 0, 'Undo is never pressed')
  local log = H.read_text(s:path('events.log'))
  H.truthy(not log:find('Move', 1, true), 'the foreign label is not in events.log')
end)

H.test('undo_last: another of the app own labels on top is never undone', function()
  local s, p = project()
  cut(s, p, 14, 16)
  for _, label in ipairs({ OTHER_OURS, 'Narration Utils: delete words (2)', 'narration utils: delete words' }) do
    narrator_edit(s, label)
    s:send('undo_last', 'u1', 'cut_range', '3')
    H.eq(s:events(), { { 'UNDONE_LAST', 'u1', 'cut_range', '3', '0' } }, label)
    H.eq(undos(s), 0, label)
    table.remove(s.fake.undo)
  end
end)

H.test('undo_last: it stops at the first point that is not this kind, and never undoes past it', function()
  local s, p = project()
  cut(s, p, 24, 26)
  narrator_edit(s, FOREIGN)
  cut(s, p, 14, 16)
  cut(s, p, 11, 12)
  s:send('undo_last', 'u1', 'cut_range', '4')
  H.eq(s:events(), { { 'UNDONE_LAST', 'u1', 'cut_range', '4', '2' } })
  H.eq(s.fake:undo_labels(), { CUT, FOREIGN }, 'the narrator edit and the cut under it stay')
  H.eq(undos(s), 2)
end)

H.test('undo_last: it stops when the history runs out', function()
  local s, p = project()
  cut(s, p, 14, 16)
  s:send('undo_last', 'u1', 'cut_range', '3')
  H.eq(s:events(), { { 'UNDONE_LAST', 'u1', 'cut_range', '3', '1' } })
  H.eq(undos(s), 1)
end)

H.test('undo_last: no undo history undoes nothing', function()
  local s = project()
  s:send('undo_last', 'u1', 'cut_range', '1')
  H.eq(s:events(), { { 'UNDONE_LAST', 'u1', 'cut_range', '1', '0' } })
  H.eq(undos(s), 0)
end)

H.test('undo_last: an Undo REAPER does not make stops the run', function()
  local s, p = project()
  cut(s, p, 14, 16)
  cut(s, p, 11, 12)
  s.fake.reaper.Undo_DoUndo2 = function()
    s.fake.calls[#s.fake.calls + 1] = { name = 'Undo_DoUndo2' }
    return 0
  end
  s:send('undo_last', 'u1', 'cut_range', '2')
  H.eq(s:events(), { { 'UNDONE_LAST', 'u1', 'cut_range', '2', '0' } })
  H.eq(undos(s), 1, 'it tried once and stopped')
end)

H.test('undo_last: while REAPER records it is refused and nothing is undone', function()
  local s, p = project()
  cut(s, p, 14, 16)
  s.fake.play_state = 5
  s:send('undo_last', 'u1', 'cut_range', '1')
  H.eq(s:events(), { { 'ERROR', 'u1', RECORDING } })
  H.eq(s.fake:undo_labels(), { CUT })
  H.eq(undos(s), 0)
end)

H.test('undo_last: a kind or a label not in the table is refused before anything is read', function()
  local s, p = project()
  cut(s, p, 14, 16)
  for _, kind in ipairs({ '', 'fx_range', CUT, 'cut range', '__index' }) do
    s:send('undo_last', 'u1', kind, '1')
    H.eq(s:events(), { { 'ERROR', 'u1', BAD_KIND } }, kind)
  end
  H.eq(s.fake:undo_labels(), { CUT })
  H.eq(undos(s), 0)
end)

H.test('undo_last: steps outside 1 to 12 or not a whole number are refused', function()
  local s, p = project()
  cut(s, p, 14, 16)
  for _, steps in ipairs({ '0', '13', '-1', '1.5', '1e1', ' 1', 'x', '' }) do
    s:send('undo_last', 'u1', 'cut_range', steps)
    H.eq(s:events(), { { 'ERROR', 'u1', BAD_STEPS } }, steps)
  end
  s:send('undo_last', 'u1', 'cut_range')
  H.eq(s:events(), { { 'ERROR', 'u1', BAD_STEPS } }, 'no steps')
  H.eq(s.fake:undo_labels(), { CUT })
  H.eq(undos(s), 0)
end)

H.test('undo_last: twelve steps is the most', function()
  local s = project()
  for _ = 1, 13 do
    narrator_edit(s, CUT)
  end
  s:send('undo_last', 'u1', 'cut_range', '12')
  H.eq(s:events(), { { 'UNDONE_LAST', 'u1', 'cut_range', '12', '12' } })
  H.eq(s.fake:undo_labels(), { CUT })
end)
