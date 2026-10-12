-- apply_fx_range and remove_fx_range (narration_range.lua, ADR 0860 point 3): one of the narrator's saved chains, named
-- as list_fx_chains lists it, on the middle piece of a range of words, and taken off again with the piece joined back to
-- its neighbours. Each change is one undo block; nothing is deleted from the project but the pieces a join folds back.

local H = require('harness')

local APPLY_LABEL = 'Narration Utils: add chain to range'
local REMOVE_LABEL = 'Narration Utils: remove chain from range'
local CHAIN_KEY = 'narration_utils_fx_range_chain'
local FX_KEY = 'narration_utils_fx_range_fx'
local CHAIN = 'Voice/Radio.RfxChain'
local BAD_CHAIN = 'That FX chain is not in the FXChains folder REAPER lists.'
local BAD_RANGE = 'The range for the chain is not a usable pair of times.'
local OUTSIDE = 'The range for the chain is not inside that item.'
local BAD_FADE = 'The fade must be a whole number of milliseconds from 0 to 500.'

-- Writes chain files under the fake resource path's FXChains folder: each entry is a path relative to it.
local function chains(s, names)
  local root = H.join(s.dir, 'FXChains')
  for _, name in ipairs(names) do
    local path, dir = root, root
    for part in name:gmatch('[^/]+') do
      host.makedirs(dir)
      path = H.join(path, part)
      dir = path
    end
    H.write_file(path, '<TAKEFX\n>\n')
  end
  return root
end

-- A chapter track with an intro (0-8), the item the words are in (10-30, two takes, the first playing) and a later item
-- (32-37), and a second track with an item across the range's time.
local function project()
  local s = H.session()
  local chapter = s.fake:add_track('Chapter 1')
  local other = s.fake:add_track('Chapter 2')
  local intro = s.fake:add_item(chapter, { position = 0, length = 8, source = 'intro.wav' })
  local item = s.fake:add_item(chapter, { position = 10, length = 20, source = 'ch1.wav', startoffs = 2, fadein = 0.5, fadeout = 0.25 })
  local alt = s.fake.reaper.AddTakeToMediaItem(item)
  alt.source = { file = 'ch1-retake.wav' }
  local later = s.fake:add_item(chapter, { position = 32, length = 5, source = 'ch1-b.wav' })
  local elsewhere = s.fake:add_item(other, { position = 12, length = 10, source = 'ch2.wav' })
  local root = chains(s, { CHAIN, 'Breath.RfxChain' })
  s.fake.calls = {}
  return s, { chapter = chapter, other = other, intro = intro, item = item, later = later, elsewhere = elsewhere, root = root }
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

local function by_guid(s, guid)
  for _, item in ipairs(s.fake.items) do
    if item.guid == guid then
      return item
    end
  end
  return nil
end

local function fx_count(item)
  local count = 0
  for _, take in ipairs(item.takes) do
    count = count + #(take.fx or {})
  end
  return count
end

-- What a refusal must leave as it was: the item list, no split, no FX, no undo point.
local function unchanged(s, p, items)
  H.eq(#s.fake.items, items, 'no item is added or removed')
  H.eq(calls_named(s, 'SplitMediaItem'), 0, 'nothing is split')
  H.eq(calls_named(s, 'TakeFX_AddByName'), 0, 'no FX is loaded')
  H.eq(calls_named(s, 'TakeFX_Delete'), 0, 'no FX is removed')
  H.eq(calls_named(s, 'DeleteTrackMediaItem'), 0, 'no item is deleted')
  H.eq(#s.fake.undo, 0, 'no undo point')
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(span(p.item), { 10, 20 })
  H.eq(fx_count(p.item), 0)
end

local function refused(s, p, sentence, ...)
  local items = #s.fake.items
  s:send('apply_fx_range', 'r1', ...)
  H.eq(s:events(), { { 'ERROR', 'r1', sentence } })
  unchanged(s, p, items)
end

-- Applies CHAIN to 14..16 and answers the middle piece and its take.
local function applied(s, p, fade)
  s:send('apply_fx_range', 'r1', p.item.guid, '14', '16', CHAIN, fade or '10')
  local event = s:events()[1]
  H.eq(event[1], 'RANGE_FX_APPLIED')
  return by_guid(s, event[3]), event
end

-- 1. apply-splits-and-loads-the-saved-chain-on-the-middle-piece ------------------------------------------------------

H.test('apply-splits-and-loads-the-saved-chain-on-the-middle-piece: split at both ends, the chain by its full path on the middle take', function()
  local s, p = project()
  s:send('apply_fx_range', 'r1', p.item.guid, '14', '16', CHAIN, '10')
  local events = s:events()
  H.eq(#events, 1)
  local middle = by_guid(s, events[1][3])
  H.truthy(middle, 'the answer names the middle piece')
  local take = middle.takes[1]
  H.eq(events[1], { 'RANGE_FX_APPLIED', 'r1', middle.guid, take.guid, CHAIN, '1' })
  H.eq(span(middle), { 14, 2 }, 'the middle piece is the range')
  H.eq(take.startoffs, 6, 'and plays the same audio')
  H.eq(span(p.item), { 10, 4 }, 'the left piece keeps the item and its GUID')
  local right = p.chapter.items[4]
  H.eq(span(right), { 16, 14 }, 'the right piece stays where it was')
  H.eq(#take.fx, 1)
  H.eq(take.fx[1].name, H.join(H.join(p.root, 'Voice'), 'Radio.RfxChain'), 'the chain is loaded by its full path, built here')
  local add = nil
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'TakeFX_AddByName' then
      add = call
    end
  end
  H.eq(add.instantiate, -1, 'always added, never looked up')
  H.eq(take.ext[CHAIN_KEY], CHAIN, 'the take records the chain')
  H.eq(take.ext[FX_KEY], take.fx[1].guid, 'and the FX it added')
  H.eq(s.fake:undo_labels(), { APPLY_LABEL }, 'one undo block')
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('a chain of several FX records every one it added', function()
  local s, p = project()
  s.fake.chain_fx_count = 3
  local middle = applied(s, p)
  local take = middle.takes[1]
  H.eq(#take.fx, 3)
  H.eq(take.ext[FX_KEY], take.fx[1].guid .. ' ' .. take.fx[2].guid .. ' ' .. take.fx[3].guid)
end)

H.test('the fade goes on the new seams only: the left fade-out, the middle piece both ends, the right fade-in', function()
  local s, p = project()
  local middle = applied(s, p, '20')
  local right = p.chapter.items[4]
  H.eq({ p.item.fadein, p.item.fadeout }, { 0.5, 0.02 }, 'the left piece keeps its fade-in')
  H.eq({ middle.fadein, middle.fadeout }, { 0.02, 0.02 })
  H.eq({ right.fadein, right.fadeout }, { 0.02, 0.25 }, 'the right piece keeps the item fade-out')
end)

H.test('a range from the item start splits once and the chain goes on the item itself', function()
  local s, p = project()
  s:send('apply_fx_range', 'r1', p.item.guid, '10.0000005', '12', CHAIN, '10')
  local events = s:events()
  H.eq(events, { { 'RANGE_FX_APPLIED', 'r1', p.item.guid, p.item.takes[1].guid, CHAIN, '1' } })
  H.eq(calls_named(s, 'SplitMediaItem'), 1)
  H.eq(span(p.item), { 10, 2 })
  H.eq(p.item.fadein, 0.5, 'the item keeps its own fade-in')
  H.eq(#p.item.takes[1].fx, 1)
end)

H.test('a range covering the whole item splits nothing', function()
  local s, p = project()
  s:send('apply_fx_range', 'r1', p.item.guid, '10', '30', CHAIN, '10')
  H.eq(s:events()[1][3], p.item.guid)
  H.eq(calls_named(s, 'SplitMediaItem'), 0)
  H.eq({ p.item.fadein, p.item.fadeout }, { 0.5, 0.25 }, 'no seam, so no fade changes')
end)

H.test('the chain goes on the take that plays', function()
  local s, p = project()
  p.item.active_index = 2
  local middle = applied(s, p)
  H.eq(#(middle.takes[1].fx or {}), 0)
  H.eq(#middle.takes[2].fx, 1)
  H.eq(calls_named(s, 'SetActiveTake'), 0, 'the active take is not changed')
end)

H.test('a chain that loads nothing is refused as failed, says one Undo rejoins the item, and closes its block', function()
  local s, p = project()
  s.fake.fx_load_fails = true
  s:send('apply_fx_range', 'r1', p.item.guid, '14', '16', CHAIN, '10')
  H.eq(s:events(), { { 'ERROR', 'r1', 'REAPER did not load the FX chain. The item was split: press Undo in REAPER to rejoin it.' } })
  H.eq(s.fake:undo_labels(), { APPLY_LABEL })
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(s.fake.ui_refresh_hold or 0, 0)
end)

H.test('a chain that loads nothing on an unsplit item is refused without the Undo hint', function()
  local s, p = project()
  s.fake.fx_load_fails = true
  s:send('apply_fx_range', 'r1', p.item.guid, '10', '30', CHAIN, '10')
  H.eq(s:events(), { { 'ERROR', 'r1', 'REAPER did not load the FX chain.' } })
end)

-- 2. chain-name-comes-from-the-listing ----------------------------------------------------------------------------------

H.test('chain-name-comes-from-the-listing: a name list_fx_chains would not list answers the bad-chain-name error', function()
  for _, name in ipairs({ 'Missing.RfxChain', 'Voice/Missing.RfxChain', 'radio.rfxchain', 'Voice/Radio.txt', 'VST3: ReaEQ (Cockos)' }) do
    local s, p = project()
    refused(s, p, BAD_CHAIN, p.item.guid, '14', '16', name, '10')
  end
end)

H.test('a chain deeper than the listing reaches is refused although its file is there', function()
  local s, p = project()
  chains(s, { 'a/b/c/d/Deep.RfxChain' })
  refused(s, p, BAD_CHAIN, p.item.guid, '14', '16', 'a/b/c/d/Deep.RfxChain', '10')
  chains(s, { 'a/b/c/Shallow.RfxChain' })
  s:send('apply_fx_range', 'r2', p.item.guid, '14', '16', 'a/b/c/Shallow.RfxChain', '10')
  H.eq(s:events()[1][1], 'RANGE_FX_APPLIED', 'three folders deep is listed')
end)

-- Each name opens on some file system but REAPER does not list it: a folder named like a chain (it opens on Linux), and a
-- listed chain in other letter case (it opens on Windows, whose names ignore case). Only the listing refuses both.
H.test("a name that is on disk but not in REAPER's file listing is refused: a folder, or a listed chain in other case", function()
  for _, name in ipairs({ 'Odd.RfxChain', 'BREATH.RfxChain', 'voice/radio.RfxChain' }) do
    local s, p = project()
    host.makedirs(H.join(p.root, 'Odd.RfxChain'))
    refused(s, p, BAD_CHAIN, p.item.guid, '14', '16', name, '10')
  end
end)

H.test('a chain added since the last listing is found (the listing cache is cleared)', function()
  local s, p = project()
  s:send('list_fx_chains', 'f1')
  s:events()
  chains(s, { 'New.RfxChain' })
  s:send('apply_fx_range', 'r1', p.item.guid, '14', '16', 'New.RfxChain', '10')
  H.eq(s:events()[1][1], 'RANGE_FX_APPLIED')
end)

-- The REAPER functions a tick touches while the bridge handles one command, by name.
local function reaper_keys_during(s, command, ...)
  local keys, real = {}, s.fake.reaper
  reaper = setmetatable({}, {
    __index = function(_, key)
      keys[key] = true
      return real[key]
    end,
  })
  s:send(command, ...)
  reaper = real
  return keys
end

H.test('a path, a separator or a control character is refused before any REAPER call', function()
  local s, p = project()
  H.write_file(H.join(s.dir, 'reaper.ini'), '[reaper]\n')
  -- What the bridge itself touches to read a command and answer it, whatever the command.
  local overhead = reaper_keys_during(s, 'no_such_command', 'r0')
  s:events()
  local names = {
    '../reaper.ini',
    '..\\reaper.ini',
    '/etc/passwd',
    H.join(p.root, 'Breath.RfxChain'),
    'C:\\Windows\\x.RfxChain',
    'C:Breath.RfxChain',
    'Voice/../Voice/Radio.RfxChain',
    'Voice//Radio.RfxChain',
    './Breath.RfxChain',
    'Voice\\Radio.RfxChain',
    'Breath.RfxChain\n',
    'Bre\tath.RfxChain',
    '',
  }
  for _, name in ipairs(names) do
    local keys = reaper_keys_during(s, 'apply_fx_range', 'r1', p.item.guid, '14', '16', name, '10')
    H.eq(s:events(), { { 'ERROR', 'r1', BAD_CHAIN } }, name)
    local touched = {}
    for key in pairs(keys) do
      if not overhead[key] then
        touched[#touched + 1] = key
      end
    end
    table.sort(touched)
    H.eq(touched, {}, 'no REAPER call for ' .. name)
  end
  unchanged(s, p, 4)
end)

-- 3. one-chain-one-piece-nothing-else-changes ---------------------------------------------------------------------------

H.test('one-chain-one-piece-nothing-else-changes: the neighbours and other items get no FX and do not move', function()
  local s, p = project()
  local middle = applied(s, p)
  local right = p.chapter.items[4]
  H.eq(fx_count(p.item), 0, 'the left piece gets no FX')
  H.eq(fx_count(right), 0, 'the right piece gets no FX')
  H.eq(fx_count(middle), 1)
  H.eq(span(p.intro), { 0, 8 }, 'an item before stays')
  H.eq(span(p.later), { 32, 5 }, 'an item after stays')
  H.eq(span(p.elsewhere), { 12, 10 }, 'an item on another track stays')
  for _, other in ipairs({ p.intro, p.later, p.elsewhere }) do
    H.eq(fx_count(other), 0)
  end
  H.eq(calls_named(s, 'DeleteTrackMediaItem'), 0, 'no media is deleted')
  H.eq(calls_named(s, 'MoveMediaItemToTrack'), 0)
end)

H.test('every piece keeps all the item takes, and undoing the block returns one whole item with no FX', function()
  local s, p = project()
  local middle = applied(s, p)
  local right = p.chapter.items[4]
  for _, piece in ipairs({ p.item, middle, right }) do
    H.eq(#piece.takes, 2)
    H.eq(piece.takes[2].source.file, 'ch1-retake.wav')
  end
  H.eq(s.fake:undo_last_block(), APPLY_LABEL)
  H.eq(span(p.item), { 10, 20 }, 'one Undo gives the item back whole')
  H.eq({ p.item.fadein, p.item.fadeout }, { 0.5, 0.25 })
  H.eq(#p.chapter.items, 3)
  H.eq(fx_count(p.item), 0)
end)

H.test('undoing a chain put on the item itself takes the FX and the record off it', function()
  local s, p = project()
  s:send('apply_fx_range', 'r1', p.item.guid, '10', '30', CHAIN, '10')
  s:events()
  H.eq(s.fake:undo_last_block(), APPLY_LABEL)
  H.eq(fx_count(p.item), 0)
  H.eq(p.item.takes[1].ext[CHAIN_KEY], nil)
end)

-- 4. remove-joins-the-piece-back ------------------------------------------------------------------------------------------

H.test('remove-joins-the-piece-back: the chain FX come off and the three pieces are one item again, in one block', function()
  local s, p = project()
  local middle = applied(s, p)
  s.fake.calls = {}
  s.fake.undo = {}
  s:send('remove_fx_range', 'r2', middle.guid, CHAIN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r2', p.item.guid, CHAIN, '1' } })
  H.eq(#p.chapter.items, 3, 'the pieces are folded back into the item')
  H.eq(span(p.item), { 10, 20 })
  H.eq({ p.item.fadein, p.item.fadeout }, { 0.5, 0.25 }, 'the item keeps its outer fades and no seam fade')
  H.eq(p.item.takes[1].startoffs, 2)
  H.eq(fx_count(p.item), 0)
  H.eq(#p.item.takes, 2, 'with both takes')
  H.eq(by_guid(s, middle.guid), nil)
  H.eq(s.fake:undo_labels(), { REMOVE_LABEL })
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(span(p.later), { 32, 5 })
end)

H.test('remove takes off only the FX the chain added, and keeps one the narrator put on the take', function()
  local s, p = project()
  local middle = applied(s, p)
  local take = middle.takes[1]
  s.fake.chain_fx_count = 1
  s.fake.reaper.TakeFX_AddByName(take, 'VST: Narrator EQ', -1)
  s:send('remove_fx_range', 'r2', middle.guid, CHAIN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r2', middle.guid, CHAIN, '1' } })
  H.eq(#take.fx, 1)
  H.eq(take.fx[1].name, 'VST: Narrator EQ')
  H.eq(take.ext[CHAIN_KEY] or '', '', 'the record is cleared')
  H.eq(take.ext[FX_KEY] or '', '')
  H.eq(by_guid(s, middle.guid) ~= nil, true, 'a piece with other FX is not joined to pieces without them')
end)

H.test('a piece whose neighbour moved is not joined to it', function()
  local s, p = project()
  local middle = applied(s, p)
  local right = p.chapter.items[4]
  right.position = 16.5
  s:send('remove_fx_range', 'r2', middle.guid, CHAIN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r2', p.item.guid, CHAIN, '1' } })
  H.eq(span(p.item), { 10, 6 }, 'joined to the left piece only')
  H.eq(span(right), { 16.5, 14 })
  H.eq(p.item.fadeout, 0.01, 'the piece keeps its fade-out at the edge that was not joined')
  H.eq(#p.chapter.items, 4)
end)

H.test('a neighbour that plays other audio is not joined', function()
  local s, p = project()
  local middle = applied(s, p)
  local right = p.chapter.items[4]
  right.takes[1].startoffs = right.takes[1].startoffs + 1
  p.item.takes[2].source = { file = 'other.wav' }
  s:send('remove_fx_range', 'r2', middle.guid, CHAIN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r2', middle.guid, CHAIN, '1' } })
  H.eq(#p.chapter.items, 5)
  H.eq(fx_count(middle), 0)
end)

H.test('a neighbour carrying another range chain is not joined', function()
  local s, p = project()
  local middle = applied(s, p)
  local right = p.chapter.items[4]
  s:send('apply_fx_range', 'r1', right.guid, '16', '30', 'Breath.RfxChain', '0')
  H.eq(s:events()[1][3], right.guid, 'the whole right piece carries the other chain')
  s:send('remove_fx_range', 'r2', middle.guid, CHAIN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r2', p.item.guid, CHAIN, '1' } })
  H.eq(span(p.item), { 10, 6 }, 'joined to the left piece only')
  H.eq(span(right), { 16, 14 })
  H.eq(fx_count(right), 1, 'the other chain stays on its piece')
end)

H.test('a neighbour with another gain, take volume, chain record or FX is not joined', function()
  local cases = {
    function(_, right)
      right.vol = 0.5
    end,
    function(_, right)
      right.takes[1].vol = 0.5
    end,
    function(_, right)
      right.takes[1].ext[CHAIN_KEY] = 'Breath.RfxChain'
    end,
  }
  for index, change in ipairs(cases) do
    local s, p = project()
    local middle = applied(s, p)
    local right = p.chapter.items[4]
    change(p.item, right)
    s:send('remove_fx_range', 'r2', middle.guid, CHAIN)
    local events = s:events()
    H.eq(events[1][1], 'RANGE_FX_REMOVED', index)
    H.truthy(by_guid(s, right.guid) ~= nil, 'the right piece stays, case ' .. index)
  end
end)

H.test('a neighbour whose FX the narrator swapped for another, as many, is not joined', function()
  local s, p = project()
  p.item.takes[1].fx = { { name = 'VST: ReaComp', guid = '{C1}' } }
  local middle = applied(s, p)
  local right = p.chapter.items[4]
  right.takes[1].fx = { { name = 'VST: ReaGate', guid = '{C2}' } }
  s:send('remove_fx_range', 'r2', middle.guid, CHAIN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r2', p.item.guid, CHAIN, '1' } })
  H.eq(span(p.item), { 10, 6 }, 'joined to the left piece only')
  H.eq(right.takes[1].fx[1].name, 'VST: ReaGate')
end)

H.test('a neighbour with the same FX names is joined, and the kept piece keeps them', function()
  local s, p = project()
  p.item.takes[1].fx = { { name = 'VST: ReaComp', guid = '{C1}' } }
  local middle = applied(s, p)
  s:send('remove_fx_range', 'r2', middle.guid, CHAIN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r2', p.item.guid, CHAIN, '1' } })
  H.eq(span(p.item), { 10, 20 })
  H.eq(p.item.takes[1].fx[1].name, 'VST: ReaComp')
end)

H.test('a neighbour the command did not split is never joined: a split the narrator made stays', function()
  local s, p = project()
  local second = s.fake.reaper.SplitMediaItem(p.item, 20)
  s:send('apply_fx_range', 'r1', second.guid, '20', '30', CHAIN, '0')
  H.eq(s:events()[1][3], second.guid, 'the whole piece, no split')
  s:send('remove_fx_range', 'r2', second.guid, CHAIN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r2', second.guid, CHAIN, '1' } })
  H.eq(span(p.item), { 10, 10 })
  H.eq(span(second), { 20, 10 })
  H.eq(calls_named(s, 'DeleteTrackMediaItem'), 0)
end)

H.test('a range from the item start joins back to the right piece only', function()
  local s, p = project()
  s:send('apply_fx_range', 'r1', p.item.guid, '10', '12', CHAIN, '10')
  s:events()
  s:send('remove_fx_range', 'r2', p.item.guid, CHAIN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r2', p.item.guid, CHAIN, '1' } })
  H.eq(span(p.item), { 10, 20 })
  H.eq({ p.item.fadein, p.item.fadeout }, { 0.5, 0.25 }, 'its own fade-in and the right piece fade-out')
  H.eq(#p.chapter.items, 3)
end)

H.test('a second chain on words that carry one is refused before any change', function()
  local s, p = project()
  local middle = applied(s, p)
  s.fake.calls = {}
  s.fake.undo = {}
  for _, range in ipairs({ { '14', '16' }, { '14.5', '15.5' } }) do
    s:send('apply_fx_range', 'r2', middle.guid, range[1], range[2], 'Breath.RfxChain', '0')
    H.eq(s:events(), { { 'ERROR', 'r2', 'Those words already have a chain on them. Take it off first.' } })
  end
  H.eq(calls_named(s, 'SplitMediaItem'), 0)
  H.eq(#s.fake.undo, 0)
  H.eq(fx_count(middle), 1)
end)

H.test('when REAPER keeps an FX it was asked to delete, the record stays, nothing is joined, and the answer says so', function()
  local s, p = project()
  local middle = applied(s, p)
  s.fake.fx_delete_fails = true
  s:send('remove_fx_range', 'r2', middle.guid, CHAIN)
  H.eq(s:events(), {
    { 'ERROR', 'r2', 'REAPER did not take off every FX of the chain. Press Undo in REAPER to put back what it took off.' },
  })
  H.eq(middle.takes[1].ext[CHAIN_KEY], CHAIN)
  H.eq(#p.chapter.items, 5)
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(s.fake.ui_refresh_hold or 0, 0)
end)

H.test('a piece that no longer carries the chain answers 0 and opens no block', function()
  local s, p = project()
  local middle = applied(s, p)
  s.fake.calls = {}
  s.fake.undo = {}
  s:send('remove_fx_range', 'r2', middle.guid, 'Breath.RfxChain')
  s:send('remove_fx_range', 'r3', p.item.guid, CHAIN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r2', middle.guid, 'Breath.RfxChain', '0' }, { 'RANGE_FX_REMOVED', 'r3', p.item.guid, CHAIN, '0' } })
  middle.takes[1].fx = {}
  s:send('remove_fx_range', 'r4', middle.guid, CHAIN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r4', middle.guid, CHAIN, '0' } }, 'the narrator took the FX off already')
  H.eq(#s.fake.undo, 0)
  H.eq(calls_named(s, 'TakeFX_Delete'), 0)
  H.eq(calls_named(s, 'DeleteTrackMediaItem'), 0)
end)

H.test('undoing a removal gives back the three pieces and the chain', function()
  local s, p = project()
  local middle = applied(s, p)
  s:send('remove_fx_range', 'r2', middle.guid, CHAIN)
  s:events()
  H.eq(s.fake:undo_last_block(), REMOVE_LABEL)
  H.eq(#p.chapter.items, 5)
  H.eq(span(p.item), { 10, 4 })
  H.eq(fx_count(middle), 1)
  H.eq(middle.takes[1].ext[CHAIN_KEY], CHAIN)
end)

-- 5. stale-bounds-and-recording-refusals --------------------------------------------------------------------------------

H.test('an item GUID that no longer resolves answers ITEM_STALE, for both commands, and changes nothing', function()
  local s, p = project()
  local gone = '{DEADBEEF-0000-4000-8000-000000000000}'
  s:send('apply_fx_range', 'r1', gone, '14', '16', CHAIN, '10')
  s:send('remove_fx_range', 'r2', gone, CHAIN)
  H.eq(s:events(), { { 'ITEM_STALE', 'r1', gone, 'item' }, { 'ITEM_STALE', 'r2', gone, 'item' } })
  unchanged(s, p, 4)
end)

H.test('an empty, reversed or non-finite range is refused before any change', function()
  for _, range in ipairs({ { '14', '14' }, { '16', '14' }, { 'nan', '16' }, { '14', '1e999' }, { '-1e999', '16' }, { 'x', '16' }, { '14', '' } }) do
    local s, p = project()
    refused(s, p, BAD_RANGE, p.item.guid, range[1], range[2], CHAIN, '10')
  end
end)

H.test('a range outside the item is refused before any change', function()
  for _, range in ipairs({ { '9', '12' }, { '28', '31' }, { '5', '40' } }) do
    local s, p = project()
    refused(s, p, OUTSIDE, p.item.guid, range[1], range[2], CHAIN, '10')
  end
end)

H.test('a fade outside 0 to 500 milliseconds, or not whole, is refused before any change', function()
  for _, fade in ipairs({ '-1', '501', '2.5', 'x', '', 'inf' }) do
    local s, p = project()
    refused(s, p, BAD_FADE, p.item.guid, '14', '16', CHAIN, fade)
  end
end)

H.test('nothing changes while REAPER records, for both commands', function()
  local s, p = project()
  local middle = applied(s, p)
  s.fake.calls = {}
  s.fake.undo = {}
  s.fake.play_state = 5
  s:send('apply_fx_range', 'r2', p.item.guid, '11', '12', CHAIN, '10')
  s:send('remove_fx_range', 'r3', middle.guid, CHAIN)
  H.eq(s:events(), { { 'ERROR', 'r2', 'REAPER is recording. Stop recording first.' }, { 'ERROR', 'r3', 'REAPER is recording. Stop recording first.' } })
  H.eq(#s.fake.undo, 0)
  H.eq(calls_named(s, 'SplitMediaItem'), 0)
  H.eq(calls_named(s, 'TakeFX_Delete'), 0)
  H.eq(fx_count(middle), 1)
end)

H.test('remove refuses a chain name that could be a path before any change', function()
  local s, p = project()
  local middle = applied(s, p)
  for _, name in ipairs({ '../x.RfxChain', '/etc/passwd', 'Voice\\Radio.RfxChain', 'Radio\0.RfxChain', '' }) do
    s:send('remove_fx_range', 'r2', middle.guid, name)
    H.eq(s:events(), { { 'ERROR', 'r2', BAD_CHAIN } }, name)
  end
  H.eq(fx_count(middle), 1)
end)

H.test('a REAPER without the calls refuses before any change', function()
  for _, api in ipairs({ 'TakeFX_AddByName', 'SplitMediaItem', 'TakeFX_GetFXGUID' }) do
    local s, p = project()
    s.fake:remove_api(api)
    refused(s, p, 'This REAPER version cannot put an FX chain on a range.', p.item.guid, '14', '16', CHAIN, '10')
  end
  for _, api in ipairs({ 'TakeFX_Delete', 'DeleteTrackMediaItem' }) do
    local s, p = project()
    local middle = applied(s, p)
    s.fake:remove_api(api)
    s:send('remove_fx_range', 'r2', middle.guid, CHAIN)
    H.eq(s:events(), { { 'ERROR', 'r2', 'This REAPER version cannot take an FX chain off a range.' } }, api)
    H.eq(fx_count(middle), 1)
  end
end)

H.test('neither command calls Main_OnCommand', function()
  local s, p = project()
  local middle = applied(s, p)
  s:send('remove_fx_range', 'r2', middle.guid, CHAIN)
  s:events()
  H.eq(calls_named(s, 'Main_OnCommand'), 0)
end)

-- fx_range_params, fx_range_set_param and fx_range_bypass (SN-E104): the settings of the chain apply_fx_range put on a
-- piece, one setting changed, and the chain bypassed or turned back on. Each finds the chain by the item and take GUIDs
-- apply_fx_range answered (an empty take GUID: the item's take that carries the chain) and the FX GUIDs the take records.

local SET_LABEL = 'Narration Utils: change effect setting'
local BYPASS_LABEL = 'Narration Utils: bypass effect'
local ENABLE_LABEL = 'Narration Utils: turn effect back on'

-- Applies CHAIN to 14..16 with no call or undo point left over, and answers the piece and its take.
local function applied_clean(s, p)
  local middle = applied(s, p)
  s.fake.calls = {}
  s.fake.undo = {}
  return middle, middle.takes[1]
end

local function param_lines(fx, name)
  return {
    { 'RANGE_FX_PARAM', 'p1', fx, name, '0', 'Gain', '0', '-24', '24', '0', '0 dB' },
    { 'RANGE_FX_PARAM', 'p1', fx, name, '1', 'Mix', '1', '0', '1', '0', '1' },
    { 'RANGE_FX_PARAM', 'p1', fx, name, '2', 'Mode', '0', '0', '3', '1', '0' },
  }
end

-- What an edit that was refused or found nothing to do must leave: no setter call and no undo point.
local function untouched(s, take)
  H.eq(calls_named(s, 'TakeFX_SetParam'), 0, 'no setting is changed')
  H.eq(calls_named(s, 'TakeFX_SetEnabled'), 0, 'no FX is switched')
  H.eq(#s.fake.undo, 0, 'no undo point')
  H.eq(s.fake.open_undo_blocks, 0)
  for _, fx in ipairs(take.fx) do
    H.eq(fx.enabled, true)
    H.eq({ fx.params[1].value, fx.params[2].value, fx.params[3].value }, { 0, 1, 0 })
  end
end

H.test("fx_range_params lists the applied chain's parameters", function()
  local s, p = project()
  s.fake.chain_fx_count = 2
  local middle, take = applied_clean(s, p)
  local path = take.fx[1].name
  s:send('fx_range_params', 'p1', middle.guid, take.guid, CHAIN)
  local want = {}
  for fx = 0, 1 do
    for _, line in ipairs(param_lines(tostring(fx), path)) do
      want[#want + 1] = line
    end
  end
  want[#want + 1] = { 'RANGE_FX_PARAMS', 'p1', middle.guid, take.guid, CHAIN, '6', '0', '0' }
  H.eq(s:events(), want)
  H.eq(#s.fake.undo, 0, 'a read adds no undo point')
  H.eq(calls_named(s, 'TakeFX_SetParam') + calls_named(s, 'TakeFX_SetEnabled'), 0)
end)

H.test('fx_range_params reads only the FX the chain added, in the order it recorded them, and says when it is bypassed', function()
  local s, p = project()
  local middle, take = applied_clean(s, p)
  -- An FX the narrator put on the take in REAPER first, ahead of the chain's.
  table.insert(take.fx, 1, { name = 'ReaComp', guid = s.fake:new_guid(), enabled = true, params = { { name = 'Ratio', value = 4, min = 1, max = 20 } } })
  take.fx[2].enabled = false
  s:send('fx_range_params', 'p1', middle.guid, take.guid, CHAIN)
  local events = s:events()
  H.eq(#events, 4)
  H.eq(events[1][3], '0', 'the chain FX is numbered within the chain')
  H.eq(events[1][6], 'Gain')
  H.eq(events[4], { 'RANGE_FX_PARAMS', 'p1', middle.guid, take.guid, CHAIN, '3', '0', '1' })
end)

H.test('fx_range_params with no take GUID reads the take on the item that carries the chain', function()
  local s, p = project()
  p.item.active_index = 2
  local middle, take = applied_clean(s, p)
  take = middle.takes[2]
  s:send('fx_range_params', 'p1', middle.guid, '', CHAIN)
  local events = s:events()
  H.eq(events[#events], { 'RANGE_FX_PARAMS', 'p1', middle.guid, take.guid, CHAIN, '3', '0', '0' })
end)

H.test('fx_range_params stops at 512 parameters and says it was cut short', function()
  local s, p = project()
  local template = {}
  for index = 1, 600 do
    template[index] = { name = 'P' .. index, value = 0, min = 0, max = 1 }
  end
  s.fake.fx_param_template = template
  local middle, take = applied_clean(s, p)
  s:send('fx_range_params', 'p1', middle.guid, take.guid, CHAIN)
  local events = s:events()
  H.eq(#events, 513)
  H.eq(events[513], { 'RANGE_FX_PARAMS', 'p1', middle.guid, take.guid, CHAIN, '512', '1', '0' })
end)

H.test('fx_range_set_param and fx_range_bypass change one thing as one undo point', function()
  local s, p = project()
  s.fake.chain_fx_count = 2
  local middle, take = applied_clean(s, p)
  s:send('fx_range_set_param', 's1', middle.guid, take.guid, CHAIN, '1', '0', '-6.5')
  H.eq(s:events(), { { 'RANGE_FX_PARAM_SET', 's1', middle.guid, take.guid, '1', '0', '-6.5', '-6.5 dB', '1' } })
  H.eq(take.fx[2].params[1].value, -6.5, 'the second FX of the chain has the value')
  H.eq(take.fx[1].params[1].value, 0, 'the first is as it was')
  H.eq({ take.fx[2].params[2].value, take.fx[2].params[3].value }, { 1, 0 }, 'and its other settings too')
  H.eq(calls_named(s, 'TakeFX_SetParam'), 1)
  H.eq(s.fake.calls[#s.fake.calls].in_block, true)
  H.eq(s.fake:undo_labels(), { SET_LABEL })
  H.eq(s.fake:undo_last_block(), SET_LABEL)
  H.eq(take.fx[2].params[1].value, 0, 'one Undo puts the value back')

  s.fake.calls = {}
  s:send('fx_range_bypass', 'b1', middle.guid, take.guid, CHAIN, '1')
  H.eq(s:events(), { { 'RANGE_FX_BYPASSED', 'b1', middle.guid, take.guid, CHAIN, '1', '1' } })
  H.eq({ take.fx[1].enabled, take.fx[2].enabled }, { false, false }, 'every FX of the chain is bypassed')
  H.eq(calls_named(s, 'TakeFX_SetEnabled'), 2)
  H.eq(s.fake:undo_labels(), { BYPASS_LABEL })
  s:send('fx_range_bypass', 'b2', middle.guid, take.guid, CHAIN, '0')
  H.eq(s:events(), { { 'RANGE_FX_BYPASSED', 'b2', middle.guid, take.guid, CHAIN, '0', '1' } })
  H.eq({ take.fx[1].enabled, take.fx[2].enabled }, { true, true })
  H.eq(s.fake:undo_labels(), { BYPASS_LABEL, ENABLE_LABEL })
  H.eq(s.fake:undo_last_block(), ENABLE_LABEL)
  H.eq({ take.fx[1].enabled, take.fx[2].enabled }, { false, false }, 'one Undo bypasses it again')
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('the edits leave the item, its neighbours and an FX outside the chain as they were', function()
  local s, p = project()
  local middle, take = applied_clean(s, p)
  local own = { name = 'ReaComp', guid = s.fake:new_guid(), enabled = true, params = { { name = 'Ratio', value = 4, min = 1, max = 20 } } }
  take.fx[#take.fx + 1] = own
  s:send('fx_range_set_param', 's1', middle.guid, take.guid, CHAIN, '0', '1', '0.25')
  s:send('fx_range_bypass', 'b1', middle.guid, take.guid, CHAIN, '1')
  s:events()
  H.eq({ own.enabled, own.params[1].value }, { true, 4 }, 'the narrator FX is not the chain')
  H.eq(span(middle), { 14, 2 })
  H.eq(span(p.item), { 10, 4 })
  H.eq(#s.fake.items, 6)
  H.eq(calls_named(s, 'SplitMediaItem') + calls_named(s, 'DeleteTrackMediaItem') + calls_named(s, 'Main_OnCommand'), 0)
end)

H.test('a value REAPER rounds is answered as REAPER holds it', function()
  local s, p = project()
  local middle, take = applied_clean(s, p)
  s.fake.param_quantum = 0.5
  s:send('fx_range_set_param', 's1', middle.guid, take.guid, CHAIN, '0', '0', '3.3')
  H.eq(s:events(), { { 'RANGE_FX_PARAM_SET', 's1', middle.guid, take.guid, '0', '0', '3.5', '3.5 dB', '1' } })
end)

H.test('a setting already at the value, or a chain already bypassed, adds no undo point', function()
  local s, p = project()
  local middle, take = applied_clean(s, p)
  s:send('fx_range_set_param', 's1', middle.guid, take.guid, CHAIN, '0', '1', '1')
  s:send('fx_range_bypass', 'b1', middle.guid, take.guid, CHAIN, '0')
  H.eq(s:events(), {
    { 'RANGE_FX_PARAM_SET', 's1', middle.guid, take.guid, '0', '1', '1', '1', '0' },
    { 'RANGE_FX_BYPASSED', 'b1', middle.guid, take.guid, CHAIN, '0', '0' },
  })
  untouched(s, take)
end)

H.test('the fx_range edits refuse a stale effect and change nothing', function()
  local s, p = project()
  local middle, take = applied_clean(s, p)
  local gone = '{DEADBEEF-0000-4000-8000-000000000000}'
  local function each(item, take_guid)
    return {
      { 'fx_range_params', 'r1', item, take_guid, CHAIN },
      { 'fx_range_set_param', 'r2', item, take_guid, CHAIN, '0', '0', '3' },
      { 'fx_range_bypass', 'r3', item, take_guid, CHAIN, '1' },
    }
  end
  local function all_stale(item, take_guid, answer_guid, reason)
    for _, command in ipairs(each(item, take_guid)) do
      s:send(table.unpack(command))
      H.eq(s:events(), { { 'ITEM_STALE', command[2], answer_guid, reason } }, command[1] .. ' ' .. reason)
    end
    untouched(s, take)
  end
  all_stale(gone, take.guid, gone, 'item')
  all_stale(middle.guid, gone, gone, 'take')
  -- The left piece is a real item, but the chain is not on it.
  all_stale(p.item.guid, p.item.takes[1].guid, p.item.guid, 'fx')
  all_stale(p.item.guid, '', p.item.guid, 'fx')
  -- Another chain's name: the take carries a chain, not that one.
  chains(s, { 'Breath.RfxChain' })
  for _, command in ipairs(each(middle.guid, take.guid)) do
    command[5] = 'Breath.RfxChain'
    s:send(table.unpack(command))
    H.eq(s:events(), { { 'ITEM_STALE', command[2], middle.guid, 'fx' } }, command[1] .. ' other chain')
  end
  -- An FX of the chain the narrator deleted in REAPER.
  local kept = take.fx[1]
  take.fx = {}
  all_stale(middle.guid, take.guid, middle.guid, 'fx')
  take.fx = { kept }
  -- The chain taken off since.
  s:send('remove_fx_range', 'x', middle.guid, CHAIN)
  s:events()
  s.fake.calls, s.fake.undo = {}, {}
  for _, command in ipairs(each(middle.guid, take.guid)) do
    s:send(table.unpack(command))
    H.eq(s:events()[1][1], 'ITEM_STALE', command[1] .. ' after the chain came off')
  end
  H.eq(#s.fake.undo, 0)
end)

H.test('a bad setting, value or switch is refused before any change', function()
  local s, p = project()
  local middle, take = applied_clean(s, p)
  local cases = {
    { { '1', '0', '3' }, 'That effect has no such setting.' },
    { { '0', '3', '3' }, 'That effect has no such setting.' },
    { { 'x', '0', '3' }, 'That effect has no such setting.' },
    { { '-1', '0', '3' }, 'That effect has no such setting.' },
    { { '0', '0.5', '3' }, 'That effect has no such setting.' },
    { { '0', '0', 'nan' }, 'The value for that setting is not a number.' },
    { { '0', '0', 'inf' }, 'The value for that setting is not a number.' },
    { { '0', '0', '' }, 'The value for that setting is not a number.' },
    { { '0', '0', '25' }, 'That value is outside what the setting takes.' },
    { { '0', '1', '-0.1' }, 'That value is outside what the setting takes.' },
    { { '0', '0', '3|4' }, 'That effect has no such setting.' },
  }
  for _, case in ipairs(cases) do
    s:send('fx_range_set_param', 's1', middle.guid, take.guid, CHAIN, table.unpack(case[1]))
    H.eq(s:events(), { { 'ERROR', 's1', case[2] } }, table.concat(case[1], ' '))
  end
  for _, on in ipairs({ '', '2', 'yes', 'true' }) do
    s:send('fx_range_bypass', 'b1', middle.guid, take.guid, CHAIN, on)
    H.eq(s:events(), { { 'ERROR', 'b1', 'Bypass must be 1 (on) or 0 (off).' } }, on)
  end
  for _, command in ipairs({ { 'fx_range_params', 'p1' }, { 'fx_range_bypass', 'b1' } }) do
    s:send(command[1], command[2], middle.guid, take.guid, '../x.RfxChain', '1')
    H.eq(s:events(), { { 'ERROR', command[2], BAD_CHAIN } })
  end
  untouched(s, take)
end)

H.test('the edits change nothing while REAPER records, and a read still answers', function()
  local s, p = project()
  local middle, take = applied_clean(s, p)
  s.fake.play_state = 5
  s:send('fx_range_set_param', 's1', middle.guid, take.guid, CHAIN, '0', '0', '3')
  s:send('fx_range_bypass', 'b1', middle.guid, take.guid, CHAIN, '1')
  H.eq(s:events(), { { 'ERROR', 's1', 'REAPER is recording. Stop recording first.' }, { 'ERROR', 'b1', 'REAPER is recording. Stop recording first.' } })
  untouched(s, take)
  s:send('fx_range_params', 'p1', middle.guid, take.guid, CHAIN)
  H.eq(s:events()[4][1], 'RANGE_FX_PARAMS')
end)

H.test('a setting REAPER does not take is an error, and its block is closed', function()
  local s, p = project()
  local middle, take = applied_clean(s, p)
  s.fake.param_set_fails = true
  s:send('fx_range_set_param', 's1', middle.guid, take.guid, CHAIN, '0', '0', '3')
  H.eq(s:events(), { { 'ERROR', 's1', 'REAPER did not change the setting.' } })
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(take.fx[1].params[1].value, 0)
end)

H.test('a REAPER without the calls refuses the edits before any change', function()
  for _, api in ipairs({ 'TakeFX_GetNumParams', 'TakeFX_SetParam', 'TakeFX_SetEnabled', 'TakeFX_GetFormattedParamValue' }) do
    local s, p = project()
    local middle, take = applied_clean(s, p)
    s.fake:remove_api(api)
    s:send('fx_range_params', 'p1', middle.guid, take.guid, CHAIN)
    s:send('fx_range_set_param', 's1', middle.guid, take.guid, CHAIN, '0', '0', '3')
    s:send('fx_range_bypass', 'b1', middle.guid, take.guid, CHAIN, '1')
    local sentence = 'This REAPER version cannot read or change an effect on words.'
    H.eq(s:events(), { { 'ERROR', 'p1', sentence }, { 'ERROR', 's1', sentence }, { 'ERROR', 'b1', sentence } }, api)
    untouched(s, take)
  end
end)
