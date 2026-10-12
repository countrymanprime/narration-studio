-- Take housekeeping (narration_takes.lua): hide_takes mutes every take of an item but the kept one, as volume 0 with
-- the old volume saved in the take's P_EXT, in one undo block, and deletes nothing (PRD SND-5a, DQ-8).

local H = require('harness')

local ITEM = '{AAAAAAAA-0000-4000-8000-000000000001}'
local STALE = '{FFFFFFFF-0000-4000-8000-00000000FFFF}'
local HIDDEN = 'narration_utils_take_hidden_volume'
local LABEL = 'Narration Utils: hide other takes'

local function new_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local track = s.fake:add_track('Chapter 1')
  return s, track
end

-- An item with `count` takes, the first active; take n has volume n / 10 so a restore can be told apart.
local function takes(s, track, count)
  local item = s.fake:add_item(track, { guid = ITEM, position = 10, length = 5, source = 'one.wav' })
  for n = 2, count do
    s.fake.reaper.AddTakeToMediaItem(item).source = { file = 'take' .. n .. '.wav' }
  end
  for n, take in ipairs(item.takes) do
    take.vol = n / 10
  end
  return item
end

-- Replaces the global `reaper` the bridge calls with one that records every call by name, with whether an undo block
-- was open at the time, so a test can assert the whole call list.
local function record_calls(s)
  local log, api = {}, s.fake.reaper
  reaper = setmetatable({}, {
    __index = function(_, name)
      local value = api[name]
      if type(value) ~= 'function' then
        return value
      end
      return function(...)
        log[#log + 1] = { name = name, in_block = s.fake.open_undo_blocks > 0 }
        return value(...)
      end
    end,
  })
  return log
end

local function names_of(log)
  local seen, names = {}, {}
  for _, call in ipairs(log) do
    if not seen[call.name] then
      seen[call.name] = true
      names[#names + 1] = call.name
    end
  end
  table.sort(names)
  return names
end

local function volumes(item)
  local out = {}
  for n, take in ipairs(item.takes) do
    out[n] = take.vol
  end
  return out
end

H.test('hide-takes-mutes-every-take-but-the-kept-one, in one undo block, answering the number hidden', function()
  local s, track = new_session()
  local item = takes(s, track, 3)
  local keep = item.takes[2]
  s:send('hide_takes', 'h1', ITEM:lower(), keep.guid)
  H.eq(s:events(), { { 'TAKES_HIDDEN', 'h1', ITEM, '2', '1' } })
  H.eq(#item.takes, 3, 'no take is removed')
  H.eq(item.active_index, 2, 'the kept take is the active one')
  H.eq(volumes(item), { 0, 0.2, 0 })
  H.eq(item.takes[1].ext[HIDDEN], '0.10000000000000001', 'the old volume is kept exactly, to restore')
  H.eq(item.takes[3].ext[HIDDEN], '0.29999999999999999')
  H.eq(keep.ext[HIDDEN], nil, 'the kept take is never hidden')
  H.eq(s.fake:undo_labels(), { LABEL })
  H.eq(s.fake.open_undo_blocks, 0)
  H.truthy((s.fake.item_updates or 0) > 0, 'the item is refreshed after the change')
end)

H.test('hide-is-never-delete: only volume, extension data and the active take change, all inside the undo block', function()
  local s, track = new_session()
  local item = takes(s, track, 3)
  local sources = { item.takes[1].source, item.takes[2].source, item.takes[3].source }
  -- The handler is called directly, so the log holds its calls and none of the bridge's polling loop.
  local handler = s.bridge.new_registry().lookup('hide_takes')
  local log = record_calls(s)
  handler({ session_dir = s.dir }, { 'h1', ITEM, item.takes[1].guid })
  H.eq(s:events(), { { 'TAKES_HIDDEN', 'h1', ITEM, '2', '1' } })
  H.eq(names_of(log), {
    'APIExists',
    'CountMediaItems',
    'CountTakes',
    'GetActiveTake',
    'GetMediaItem',
    'GetMediaItemTakeInfo_Value',
    'GetPlayState',
    'GetSetMediaItemInfo_String',
    'GetSetMediaItemTakeInfo_String',
    'GetTake',
    'SetMediaItemTakeInfo_Value',
    'Undo_BeginBlock2',
    'Undo_EndBlock2',
    'UpdateArrange',
    'UpdateItemInProject',
  })
  for _, call in ipairs(log) do
    if call.name == 'SetMediaItemTakeInfo_Value' or call.name == 'SetActiveTake' then
      H.truthy(call.in_block, 'every write is inside the undo block')
    end
  end
  H.eq(#s.fake.items, 1, 'no item is removed')
  H.eq(#item.takes, 3)
  for n, take in ipairs(item.takes) do
    H.truthy(take.source == sources[n], 'take ' .. n .. ' keeps its source')
  end
  H.eq({ item.position, item.length }, { 10, 5 }, 'the item does not move')
end)

H.test('stale-and-recording-refusals: a gone item or a keep take not on the item change nothing', function()
  local s, track = new_session()
  local item = takes(s, track, 2)
  local other = s.fake:add_item(track, { position = 20, length = 5, source = 'x.wav' })
  s:send('hide_takes', 'h1', STALE, item.takes[1].guid)
  s:send('hide_takes', 'h2', ITEM, STALE)
  s:send('hide_takes', 'h3', ITEM, other.takes[1].guid)
  H.eq(s:events(), {
    { 'ITEM_STALE', 'h1', STALE, 'item' },
    { 'ITEM_STALE', 'h2', STALE, 'take' },
    { 'ITEM_STALE', 'h3', other.takes[1].guid, 'take' },
  })
  H.eq(volumes(item), { 0.1, 0.2 })
  H.eq(#s.fake.undo, 0)
end)

H.test('stale-and-recording-refusals: refused while REAPER records, and on a REAPER without SetActiveTake', function()
  local s, track = new_session()
  local item = takes(s, track, 2)
  s.fake.play_state = 5
  s:send('hide_takes', 'h1', ITEM, item.takes[1].guid)
  H.eq(s:events(), { { 'ERROR', 'h1', 'REAPER is recording. Stop recording first.' } })
  s.fake.play_state = 0
  s.fake:remove_api('SetActiveTake')
  s:send('hide_takes', 'h2', ITEM, item.takes[1].guid)
  H.eq(s:events(), { { 'ERROR', 'h2', 'This REAPER version cannot choose the active take.' } })
  H.eq(volumes(item), { 0.1, 0.2 })
  H.eq(#s.fake.undo, 0)
end)

H.test('nothing-to-hide-opens-no-undo-block: one take, or the others already hidden; a repeat is idempotent', function()
  local s, track = new_session()
  local item = takes(s, track, 1)
  s:send('hide_takes', 'h1', ITEM, item.takes[1].guid)
  H.eq(s:events(), { { 'TAKES_HIDDEN', 'h1', ITEM, '0', '0' } })
  H.eq(#s.fake.undo, 0)

  local t, track2 = new_session()
  local many = takes(t, track2, 3)
  t:send('hide_takes', 'h1', ITEM, many.takes[1].guid)
  t:send('hide_takes', 'h2', ITEM, many.takes[1].guid)
  H.eq(t:events(), { { 'TAKES_HIDDEN', 'h1', ITEM, '2', '1' }, { 'TAKES_HIDDEN', 'h2', ITEM, '0', '0' } })
  H.eq(t.fake:undo_labels(), { LABEL }, 'the repeat adds no undo point')
  H.eq(volumes(many), { 0.1, 0, 0 }, 'a hidden take is not hidden again, so its saved volume is not overwritten with 0')
  H.eq(many.takes[2].ext[HIDDEN], '0.20000000000000001')
end)

H.test('hidden-state-survives-and-is-reversible: keeping a hidden take brings its volume back, in one block', function()
  local s, track = new_session()
  local item = takes(s, track, 3)
  s:send('hide_takes', 'h1', ITEM, item.takes[1].guid)
  s:send('hide_takes', 'h2', ITEM, item.takes[3].guid)
  H.eq(s:events(), { { 'TAKES_HIDDEN', 'h1', ITEM, '2', '1' }, { 'TAKES_HIDDEN', 'h2', ITEM, '1', '1' } })
  H.eq(item.active_index, 3)
  H.eq(volumes(item), { 0, 0, 0.3 }, 'the kept take plays at its own volume again; take 2 stays hidden')
  H.eq(item.takes[3].ext[HIDDEN], '', 'the kept take is no longer marked hidden')
  H.eq(item.takes[2].ext[HIDDEN], '0.20000000000000001', 'take 2 keeps the volume it had before the first hide')
  H.eq(s.fake:undo_labels(), { LABEL, LABEL }, 'one undo point per command')
end)

H.test('the kept take is made active when another take was active', function()
  local s, track = new_session()
  local item = takes(s, track, 2)
  item.takes[2].vol = 0
  item.takes[2].ext[HIDDEN] = '1'
  s:send('hide_takes', 'h1', ITEM, item.takes[1].guid)
  H.eq(s:events(), { { 'TAKES_HIDDEN', 'h1', ITEM, '0', '0' } })
  H.eq(#s.fake.undo, 0, 'already active and the other already hidden: nothing changes')
  item.active_index = 2
  s:send('hide_takes', 'h2', ITEM, item.takes[1].guid)
  H.eq(s:events(), { { 'TAKES_HIDDEN', 'h2', ITEM, '0', '1' } })
  H.eq(item.active_index, 1)
  H.eq(s.fake:undo_labels(), { LABEL }, 'switching the active take is a change, so it is one undo point')
end)

H.test('a saved volume that does not read as a number is never overwritten, and a kept take holding one is left alone', function()
  local s, track = new_session()
  local item = takes(s, track, 3)
  item.takes[2].vol = 0
  item.takes[2].ext[HIDDEN] = 'not a number'
  s:send('hide_takes', 'h1', ITEM, item.takes[1].guid)
  H.eq(s:events(), { { 'TAKES_HIDDEN', 'h1', ITEM, '1', '1' } })
  H.eq(item.takes[2].ext[HIDDEN], 'not a number', 'a take with any saved value counts as hidden')
  H.eq(volumes(item), { 0.1, 0, 0 })
  item.active_index = 2
  s:send('hide_takes', 'h2', ITEM, item.takes[2].guid)
  s:events()
  H.eq(item.takes[2].ext[HIDDEN], 'not a number', 'a kept take whose saved volume is unreadable keeps its key')
  H.eq(item.takes[2].vol, 0, 'and its volume is not guessed')
end)
