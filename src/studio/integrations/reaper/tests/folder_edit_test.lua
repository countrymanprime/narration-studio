-- The item-editing commands on a chapter whose audio is on voice tracks inside a folder (#3043). Every one of them names its item by GUID and
-- acts on that item's own track, so an item on a child of the chapter folder, or of a folder inside it, is edited where it is and the other
-- voices are not touched. The commands that move the audio after the edit (delete_range in close mode, replace_range, stack_takes) shift the
-- later items of THAT track only: the other voices stay where they were, which is why the host refuses them while a chapter's audio is on
-- more than one track (src/studio/desktop/bindings_daw_ripple.go). The last test pins that behaviour so a change to it is a decision.

local H = require('harness')

local ITEM = '{AAAAAAAA-0000-4000-8000-000000000001}'
local TAKE = '{AAAAAAAA-0000-4000-8000-000000000002}'

-- Chapter 1 folder > Narrator (an intro 0-8, the item 10-20, a later item 24-30), Crowd folder > Guard (an item 12-18), Hero (an item 10-20, a
-- later item 24-30), then Chapter 2 (an item 0-5). `where` picks which voice carries the item under test.
local function project(where)
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local fake = s.fake
  local folder = fake:add_track('Chapter 1')
  local narrator = fake:add_track('Narrator')
  local crowd = fake:add_track('Crowd')
  local guard = fake:add_track('Guard')
  local hero = fake:add_track('Hero')
  local after = fake:add_track('Chapter 2')
  folder.folder_depth, crowd.folder_depth, guard.folder_depth, hero.folder_depth = 1, 1, -1, -1
  local p = { folder = folder, narrator = narrator, guard = guard, hero = hero, after = after }
  local mine = ({ narrator = narrator, guard = guard, hero = hero })[where or 'narrator']
  fake:add_item(narrator, { position = 0, length = 8, source = 'intro.wav' })
  p.item = fake:add_item(mine, { guid = ITEM, take_guid = TAKE, position = 10, length = 10, source = 'take.wav', startoffs = 2 })
  p.take = p.item.takes[1]
  p.later = fake:add_item(mine, { position = 24, length = 6, source = 'later.wav' })
  p.other_hero = where == 'hero' and nil or fake:add_item(hero, { position = 24, length = 6, source = 'hero-later.wav' })
  p.after_item = fake:add_item(after, { position = 0, length = 5, source = 'ch2.wav' })
  fake.calls = {}
  return s, p
end

local function span(item)
  return { item.position, item.length }
end

for _, where in ipairs({ 'narrator', 'guard', 'hero' }) do
  local voice = where == 'guard' and 'a voice inside a nested folder' or 'a voice of the folder'

  H.test('split_take on ' .. voice .. ' (' .. where .. ') splits the item where it is and moves nothing', function()
    local s, p = project(where)
    local path = s:path('twice.wav')
    H.write_file(path, 'RIFF')
    p.take.source.file = path -- split_take refuses a file that is not on disk
    s:send('split_take', 'p1', ITEM, TAKE, '15.5')
    local events = s:events()
    H.eq(events[1], { 'TAKE_SPLIT', 'p1', ITEM, TAKE, events[1][5], '15.500', '1' })
    H.eq(span(p.item), { 10, 5.5 }, 'the item ends at the cut')
    H.eq(#p.item.takes, 2, 'the new take is on the same item')
    H.eq(span(p.later), { 24, 6 }, 'the later item on its track does not move')
    H.eq(s.fake:undo_labels(), { H.brand.name .. ': split take' }, 'one undo point')
  end)

  H.test('reduce_range_gain on ' .. voice .. ' (' .. where .. ') lowers the take and leaves every other track alone', function()
    local s, p = project(where)
    s:send('reduce_range_gain', 'g1', ITEM, TAKE, '6', '4:5')
    H.eq(s:events(), { { 'RANGE_GAIN_REDUCED', 'g1', ITEM, TAKE, '1', '6.0', '1' } })
    H.truthy(p.take.volume_env, 'the take got its envelope')
    H.eq(s.fake:undo_labels(), { H.brand.name .. ': lower stretches' }, 'one undo point')
  end)

  H.test('repair_click on ' .. voice .. ' (' .. where .. ') smooths the click in one undo point', function()
    local s = project(where)
    s:send('repair_click', 'c1', ITEM, TAKE, '4:4.003')
    H.eq(s:events(), { { 'CLICKS_REPAIRED', 'c1', ITEM, TAKE, '1', '1' } })
    H.eq(#s.fake:undo_labels(), 1, 'one undo point')
  end)

  H.test('delete_range in gap mode on ' .. voice .. ' (' .. where .. ') cuts the middle to Cuts and moves no other item', function()
    local s, p = project(where)
    s:send('delete_range', 'c1', ITEM, '14', '16', 'gap', '10')
    local events = s:events()
    H.eq(events[1][1], 'RANGE_CUT')
    H.eq(span(p.item), { 10, 4 }, 'the left piece keeps the item')
    H.eq(span(p.later), { 24, 6 }, 'a gap moves nothing')
    if p.other_hero then
      H.eq(span(p.other_hero), { 24, 6 }, 'nor does it touch another voice')
    end
    H.eq(span(p.after_item), { 0, 5 }, 'nor the next chapter')
    H.eq(#s.fake:undo_labels(), 1, 'one undo block')
  end)
end

H.test('hide_takes on a voice of the folder hides the other takes of its item', function()
  local s, p = project('hero')
  local second = s.fake.reaper.AddTakeToMediaItem(p.item)
  second.source = { file = 'take2.wav' }
  s:send('hide_takes', 'h1', ITEM, second.guid)
  H.eq(s:events()[1][1], 'TAKES_HIDDEN')
  H.eq(#s.fake:undo_labels(), 1, 'one undo block')
end)

H.test('delete_range in close mode shifts the later items of the cut item’s own track only (why the host refuses it for several voices)', function()
  local s, p = project('narrator')
  s:send('delete_range', 'c1', ITEM, '14', '16', 'close', '10')
  H.eq(s:events()[1][1], 'RANGE_CUT')
  H.eq(span(p.later), { 22, 6 }, 'the narrator’s later item moves up by the cut length')
  H.eq(span(p.other_hero), { 24, 6 }, 'the hero’s item at the same time does not: the voices would drift apart')
  H.eq(span(p.after_item), { 0, 5 }, 'the next chapter is untouched')
end)
