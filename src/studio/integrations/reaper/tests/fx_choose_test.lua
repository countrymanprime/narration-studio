-- choose_range_fx and range_fx_chosen (narration_range.lua, docs/research/reaper-item-fx-dialog-2026-10-24.md): any plug-in
-- REAPER has, chosen by the narrator in REAPER's own FX dialog for a range of words. The bridge splits the item in one
-- undo block, opens the dialog on the middle piece and reads back what the narrator added; remove_fx_range and the
-- fx_range edits work on those FX under the chain name CHOSEN.

local H = require('harness')

local CHOSEN = 'chosen in REAPER'
local CHOOSE_LABEL = H.brand.name .. ': choose FX in REAPER'
local REMOVE_LABEL = H.brand.name .. ': remove chain from range'
local CHAIN_KEY = H.brand.identity.reaperExtPrefix .. 'fx_range_chain'
local BEFORE_KEY = H.brand.identity.reaperExtPrefix .. 'fx_range_before'
local SHOW_FX_CHAIN = 40638
local OUTSIDE = 'The range for the chain is not inside that item.'
local BAD_RANGE = 'The range for the chain is not a usable pair of times.'
local BAD_FADE = 'The fade must be a whole number of milliseconds from 0 to 500.'

-- A chapter track with an intro (0-8, selected by the narrator) and the item the words are in (10-30).
local function project()
  local s = H.session()
  local chapter = s.fake:add_track('Chapter 1')
  local intro = s.fake:add_item(chapter, { position = 0, length = 8, source = 'intro.wav' })
  local item = s.fake:add_item(chapter, { position = 10, length = 20, source = 'ch1.wav', startoffs = 2 })
  intro.selected = true
  s.fake.calls = {}
  return s, { chapter = chapter, intro = intro, item = item }
end

local function by_guid(s, guid)
  for _, item in ipairs(s.fake.items) do
    if item.guid == guid then
      return item
    end
  end
  return nil
end

local function calls_named(s, name)
  local found = {}
  for _, call in ipairs(s.fake.calls) do
    if call.name == name then
      found[#found + 1] = call
    end
  end
  return found
end

-- Sends choose_range_fx for 14..16 and runs the cycle that opens the dialog; answers the middle piece and its take.
local function chosen(s, p)
  s:send('choose_range_fx', 'c1', p.item.guid, '14', '16', '10')
  local event = s:events()[1]
  H.eq(event[1], 'RANGE_FX_CHOOSING', table.concat(event, '|'))
  s:tick()
  local middle = by_guid(s, event[3])
  return middle, middle.takes[1]
end

H.test('choose_range_fx splits the range in one undo block, answers, and only then opens the Add FX browser on the middle piece', function()
  local s, p = project()
  s:send('choose_range_fx', 'c1', p.item.guid, '14', '16', '10')
  local events = s:events()
  H.eq(#events, 1)
  local middle = by_guid(s, events[1][3])
  H.truthy(middle, 'the answer names the middle piece')
  local take = middle.takes[1]
  H.eq(events[1], { 'RANGE_FX_CHOOSING', 'c1', middle.guid, take.guid, '1' })
  H.eq({ middle.position, middle.length }, { 14, 2 })
  H.eq(take.startoffs, 6, 'the piece plays the same audio')
  H.eq({ middle.fadein, middle.fadeout }, { 0.01, 0.01 }, 'the fade goes on the new seams')
  H.eq(take.ext[CHAIN_KEY], CHOSEN, 'the take records the choice')
  H.eq(take.ext[BEFORE_KEY], '', 'and that it had no FX of its own')
  H.eq(s.fake:undo_labels(), { CHOOSE_LABEL })
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(#calls_named(s, 'Main_OnCommand'), 0, 'nothing opens before the answer is written')
  H.eq(#calls_named(s, 'TakeFX_AddByName'), 0, 'the bridge adds no FX')
  s:tick()
  H.eq(calls_named(s, 'Main_OnCommand'), { { name = 'Main_OnCommand', command_id = SHOW_FX_CHAIN, flag = 0 } })
  H.truthy(s.fake.fx_browser and s.fake.fx_browser.take == take, 'the browser is for the middle piece')
  H.eq({ p.intro.selected, middle.selected, p.item.selected }, { true, false, false }, "the narrator's selection is put back")
  H.eq(s.fake:undo_labels(), { CHOOSE_LABEL }, 'opening adds no undo point, not even REAPER\'s "Unselect all items"')
  s:tick()
  H.eq(#calls_named(s, 'Main_OnCommand'), 1, 'the dialog opens once')
end)

H.test('the plug-in the narrator adds is read back, and the read changes nothing', function()
  local s, p = project()
  local middle, take = chosen(s, p)
  s:send('range_fx_chosen', 'r1', middle.guid, take.guid)
  H.eq(s:events(), { { 'RANGE_FX_CHOSEN', 'r1', middle.guid, take.guid, '0', '0', '0' } }, 'nothing chosen yet; the browser is not the chain')
  s.fake:choose_fx('VST: ReaComp (Cockos)')
  s.fake.fx_browser = { take = take } -- the chain window's Add
  s.fake:choose_fx('JS: Pipe|Name')
  take.fx[2].enabled = false
  local undo = #s.fake.undo
  s.fake.calls = {}
  s:send('range_fx_chosen', 'r2', middle.guid, '')
  H.eq(s:events(), {
    { 'RANGE_FX_CHOSEN_FX', 'r2', '0', 'VST: ReaComp (Cockos)', '1' },
    { 'RANGE_FX_CHOSEN_FX', 'r2', '1', 'JS: Pipe|Name', '0' },
    { 'RANGE_FX_CHOSEN', 'r2', middle.guid, take.guid, '2', '1', '0' },
  })
  H.eq(#s.fake.undo, undo, 'no undo point')
  for _, call in ipairs(s.fake.calls) do
    H.truthy(not call.name:match('Set') and call.name ~= 'TakeFX_Show' and call.name ~= 'Main_OnCommand', 'the read calls ' .. call.name)
  end
end)

H.test('a plug-in the piece inherited from the item is not the choice, and stays when the choice comes off', function()
  local s, p = project()
  s.fake.reaper.TakeFX_AddByName(p.item.takes[1], 'Voice/Room.RfxChain', -1)
  local inherited = p.item.takes[1].fx[1].guid
  local middle, take = chosen(s, p)
  H.eq(take.ext[BEFORE_KEY], inherited)
  H.eq(take.chain_visible, 0, 'a take with FX shows its chain, where the narrator clicks Add')
  H.eq(s.fake.fx_browser, nil)
  s.fake.fx_browser = { take = take }
  s.fake:choose_fx('VST: ReaEQ (Cockos)')
  s:send('range_fx_chosen', 'r1', middle.guid, take.guid)
  H.eq(s:events(), {
    { 'RANGE_FX_CHOSEN_FX', 'r1', '0', 'VST: ReaEQ (Cockos)', '1' },
    { 'RANGE_FX_CHOSEN', 'r1', middle.guid, take.guid, '1', '1', '0' },
  })
  s:send('remove_fx_range', 'r2', middle.guid, CHOSEN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r2', p.item.guid, CHOSEN, '1' } })
  H.eq({ p.item.position, p.item.length }, { 10, 20 }, 'the pieces are joined')
  H.eq(#p.item.takes[1].fx, 1)
  H.eq(p.item.takes[1].fx[1].guid, inherited, "the item's own FX stays")
end)

H.test('remove_fx_range takes the choice off and joins the item in one undo block, and after a Cancel joins it with nothing to take off', function()
  local s, p = project()
  local middle, take = chosen(s, p)
  s.fake:choose_fx('VST: ReaComp (Cockos)')
  s:send('remove_fx_range', 'r1', middle.guid, CHOSEN)
  H.eq(s:events(), { { 'RANGE_FX_REMOVED', 'r1', p.item.guid, CHOSEN, '1' } })
  H.eq({ p.item.position, p.item.length, #p.chapter.items }, { 10, 20, 2 })
  H.eq(#(p.item.takes[1].fx or {}), 0)
  H.eq(s.fake.undo[#s.fake.undo].label, REMOVE_LABEL)
  local s2, p2 = project()
  local middle2 = chosen(s2, p2)
  s2.fake:cancel_fx_browser()
  s2:send('remove_fx_range', 'r1', middle2.guid, CHOSEN)
  H.eq(s2:events(), { { 'RANGE_FX_REMOVED', 'r1', p2.item.guid, CHOSEN, '1' } })
  H.eq({ p2.item.position, p2.item.length, #p2.chapter.items }, { 10, 20, 2 }, 'a cancelled choice still joins')
  H.eq(s2.fake:undo_labels(), { CHOOSE_LABEL, REMOVE_LABEL })
  s2:send('remove_fx_range', 'r2', p2.item.guid, CHOSEN)
  H.eq(s2:events(), { { 'RANGE_FX_REMOVED', 'r2', p2.item.guid, CHOSEN, '0' } }, 'a second removal changes nothing')
  H.eq(#s2.fake.undo, 2)
end)

H.test('the fx_range edits read and bypass the plug-ins chosen in REAPER, and nothing else', function()
  local s, p = project()
  s.fake.reaper.TakeFX_AddByName(p.item.takes[1], 'Voice/Room.RfxChain', -1)
  local middle, take = chosen(s, p)
  s.fake.fx_browser = { take = take }
  s.fake:choose_fx('VST: ReaEQ (Cockos)')
  s:send('fx_range_bypass', 'b1', middle.guid, take.guid, CHOSEN, '1')
  H.eq(s:events(), { { 'RANGE_FX_BYPASSED', 'b1', middle.guid, take.guid, CHOSEN, '1', '1' } })
  H.eq({ take.fx[1].enabled, take.fx[2].enabled }, { true, false }, 'only the chosen plug-in is bypassed')
  s:send('fx_range_params', 'p1', middle.guid, take.guid, CHOSEN)
  local last = s:events()
  H.eq(last[#last][1], 'RANGE_FX_PARAMS')
  H.eq(last[1][4], 'VST: ReaEQ (Cockos)', 'the settings are the chosen plug-in’s')
end)

H.test('with nothing chosen the edits answer stale, and range_fx_chosen refuses a piece that was not opened for a choice', function()
  local s, p = project()
  local middle, take = chosen(s, p)
  s:send('fx_range_bypass', 'b1', middle.guid, take.guid, CHOSEN, '1')
  H.eq(s:events(), { { 'ITEM_STALE', 'b1', middle.guid, 'fx' } })
  s:send('range_fx_chosen', 'r1', p.intro.guid, '')
  H.eq(s:events(), { { 'ITEM_STALE', 'r1', p.intro.guid, 'fx' } })
  s:send('range_fx_chosen', 'r1b', p.intro.guid, p.intro.takes[1].guid)
  H.eq(s:events(), { { 'ITEM_STALE', 'r1b', p.intro.guid, 'fx' } }, 'a named take that was not opened for a choice')
  s:send('range_fx_chosen', 'r2', '{00000000-0000-0000-0000-000000000000}', '')
  H.eq(s:events(), { { 'ITEM_STALE', 'r2', '{00000000-0000-0000-0000-000000000000}', 'item' } })
  s:send('range_fx_chosen', 'r3', middle.guid, '{00000000-0000-0000-0000-000000000000}')
  H.eq(s:events(), { { 'ITEM_STALE', 'r3', '{00000000-0000-0000-0000-000000000000}', 'take' } })
end)

H.test('when action 40638 is not named as REAPER 7.82 names it, the chain window opens with TakeFX_Show and no action runs', function()
  local s, p = project()
  s.fake.action_texts[SHOW_FX_CHAIN] = 'Something else'
  local _, take = chosen(s, p)
  H.eq(#calls_named(s, 'Main_OnCommand'), 0)
  H.eq(calls_named(s, 'TakeFX_Show'), { { name = 'TakeFX_Show', index = 0, flag = 1 } })
  H.eq(take.chain_visible, -2)
  H.eq(p.intro.selected, true, 'the selection is not touched')
end)

H.test('a piece deleted before the dialog opens opens nothing', function()
  local s, p = project()
  s:send('choose_range_fx', 'c1', p.item.guid, '14', '16', '10')
  local middle = by_guid(s, s:events()[1][3])
  s.fake.reaper.DeleteTrackMediaItem(p.chapter, middle)
  s:tick()
  H.eq(#calls_named(s, 'Main_OnCommand'), 0)
  H.eq(#calls_named(s, 'TakeFX_Show'), 0)
end)

H.test('choose_range_fx refuses a bad range, fade, item, recording, a piece already carrying a chain and an old REAPER, changing nothing', function()
  local cases = {
    { { 'x', '16', '10' }, BAD_RANGE },
    { { '16', '14', '10' }, BAD_RANGE },
    { { '14', '16', '501' }, BAD_FADE },
    { { '5', '16', '10' }, OUTSIDE },
    { { '14', '31', '10' }, OUTSIDE },
  }
  for _, case in ipairs(cases) do
    local s, p = project()
    s:send('choose_range_fx', 'c1', p.item.guid, table.unpack(case[1]))
    H.eq(s:events(), { { 'ERROR', 'c1', case[2] } }, table.concat(case[1], ' '))
    H.eq(#s.fake.items, 2)
    H.eq(#s.fake.undo, 0)
    s:tick()
    H.eq(#calls_named(s, 'Main_OnCommand'), 0)
  end
  local s, p = project()
  s:send('choose_range_fx', 'c1', '{00000000-0000-0000-0000-000000000000}', '14', '16', '10')
  H.eq(s:events(), { { 'ITEM_STALE', 'c1', '{00000000-0000-0000-0000-000000000000}', 'item' } })
  s.fake.play_state = 5
  s:send('choose_range_fx', 'c2', p.item.guid, '14', '16', '10')
  H.eq(s:events(), { { 'ERROR', 'c2', 'REAPER is recording. Stop recording first.' } })
  s.fake.play_state = 0
  local middle = chosen(s, p)
  s:send('choose_range_fx', 'c3', middle.guid, '14.5', '15.5', '10')
  H.eq(s:events(), { { 'ERROR', 'c3', 'Those words already have a chain on them. Take it off first.' } })
  local old, op = project()
  old.fake.missing_api.TakeFX_GetChainVisible = true
  old:send('choose_range_fx', 'c1', op.item.guid, '14', '16', '10')
  H.eq(old:events(), { { 'ERROR', 'c1', 'This REAPER version cannot open its FX dialog for a range.' } })
  H.eq(#old.fake.items, 2)
end)

H.test('apply_fx_range refuses the chosen-in-REAPER name: it is no file in FXChains', function()
  local s, p = project()
  s:send('apply_fx_range', 'a1', p.item.guid, '14', '16', CHOSEN, '10')
  H.eq(s:events(), { { 'ERROR', 'a1', 'That FX chain is not in the FXChains folder REAPER lists.' } })
end)

H.test('both commands change nothing while REAPER records, and the read still answers', function()
  local s, p = project()
  local middle, take = chosen(s, p)
  s.fake.play_state = 5
  s:send('range_fx_chosen', 'r1', middle.guid, take.guid)
  H.eq(s:events(), { { 'RANGE_FX_CHOSEN', 'r1', middle.guid, take.guid, '0', '0', '0' } })
end)
