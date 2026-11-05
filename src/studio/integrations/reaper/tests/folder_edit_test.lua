-- The item-editing commands on a chapter whose audio is on voice tracks inside a folder (#3043). Every one of them names its item by GUID and
-- acts on that item's own track, so an item on a child of the chapter folder, or of a folder inside it, is edited where it is and the other
-- voices are not touched. The commands that move the audio after the edit (delete_range in close mode, replace_range, stack_takes) shift the
-- later items of THAT track only unless the chapter's folder is named (#3043); the host names it for a folder-linked chapter. The last test pins that behaviour so a change to it is a decision.

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

H.test('delete_range in close mode without a folder shifts the later items of the cut item’s own track only (why the host sends the folder)', function()
  local s, p = project('narrator')
  s:send('delete_range', 'c1', ITEM, '14', '16', 'close', '10')
  H.eq(s:events()[1][1], 'RANGE_CUT')
  H.eq(span(p.later), { 22, 6 }, 'the narrator’s later item moves up by the cut length')
  H.eq(span(p.other_hero), { 24, 6 }, 'the hero’s item at the same time does not: the voices would drift apart')
  H.eq(span(p.after_item), { 0, 5 }, 'the next chapter is untouched')
end)

-- With the chapter's folder as the fourth part of the fade field (fade|pad|room_tone|folder), a close cut moves the later items of every track inside it.
local function close_with_folder(s, p, item_guid, from, to)
  s:send('delete_range', 'c1', item_guid or ITEM, from or '14', to or '16', 'close', '10|0|0|' .. p.folder.guid)
end

for _, where in ipairs({ 'narrator', 'guard', 'hero' }) do
  H.test('delete_range close with the folder moves the later items of every voice inside it (the cut is on ' .. where .. '), in one undo block', function()
    local s, p = project(where)
    local guard_later = s.fake:add_item(p.guard, { position = 30, length = 2, source = 'guard-later.wav' })
    local hero_item = where == 'hero' and p.later or p.other_hero
    local mine_later = p.later
    s:send('delete_range', 'c1', ITEM, '14', '16', 'close', '10|0|0|' .. p.folder.guid)
    H.eq(s:events()[1][1], 'RANGE_CUT')
    H.eq(span(mine_later), { 22, 6 }, 'the cut voice’s later item moves up by the cut length')
    H.eq(span(hero_item), { 22, 6 }, 'so does the hero’s item')
    H.eq(span(guard_later), { 28, 2 }, 'and the nested folder’s voice')
    H.eq(span(p.after_item), { 0, 5 }, 'the next chapter is not in the folder and stays')
    local cuts
    for _, track in ipairs(s.fake.tracks) do
      if track.name == 'Cuts' then
        cuts = track
      end
    end
    H.eq(span(cuts.items[1]), { 14, 2 }, 'the cut piece sits on Cuts, which does not ripple')
    H.eq(#s.fake:undo_labels(), 1, 'one undo block for every track')
    H.eq(s.fake.open_undo_blocks, 0)
  end)
end

H.test('delete_range close with the folder refuses when another voice has audio in the range, and changes nothing', function()
  local s, p = project('narrator')
  s.fake:add_item(p.hero, { position = 13, length = 2, source = 'hero-line.wav' })
  s.fake.calls = {}
  close_with_folder(s, p)
  H.eq(s:events(), { { 'ERROR', 'c1', 'Another voice in the folder has audio in the range to cut, so nothing was cut.' } })
  H.eq(span(p.item), { 10, 10 })
  H.eq(span(p.later), { 24, 6 })
  H.eq(#s.fake.undo, 0, 'no undo point')
end)

H.test('delete_range with a folder that is gone is stale and one the item is not inside is refused; nothing changes', function()
  local s, p = project('narrator')
  s:send('delete_range', 'c1', ITEM, '14', '16', 'close', '10|0|0|{FFFFFFFF-0000-4000-8000-00000000FFFF}')
  H.eq(s:events(), { { 'TRACK_STALE', 'c1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
  s:send('delete_range', 'c1', ITEM, '14', '16', 'close', '10|0|0|' .. p.hero.guid)
  H.eq(s:events(), { { 'ERROR', 'c1', 'The item is not inside the chapter folder, so nothing was cut.' } })
  H.eq(span(p.item), { 10, 10 })
  H.eq(#s.fake.undo, 0)
end)

H.test('delete_range in gap mode with a folder moves nothing, as without it', function()
  local s, p = project('narrator')
  s:send('delete_range', 'c1', ITEM, '14', '16', 'gap', '10|0|0|' .. p.folder.guid)
  H.eq(s:events()[1][1], 'RANGE_CUT')
  H.eq(span(p.later), { 24, 6 })
  H.eq(span(p.other_hero), { 24, 6 })
end)

-- replace_range and restore_replacement ripple the whole folder when it is named (#3043 part 3): the folder GUID is a sixth part of replace_range's
-- last field (source_start|source_end|fade_ms|gain_db|id|folder) and the id field of restore_replacement (id|folder).
local REPLACE_ID = 'r-0001'

-- Their file on a track outside the chapter folder (a co-narrator's), 0-200 s, from 2 s into the file.
local function with_their_audio(s)
  local eric = s.fake:add_track('Eric Leach')
  local source = s.fake:add_item(eric, { position = 0, length = 200, source = 'leach_01.mp3', startoffs = 2 })
  s.fake.calls = {}
  return source
end

local function replace_with_folder(s, p, source, folder)
  s:send('replace_range', 'r1', ITEM, '14', '16', source.guid, '164.2|167.2|10|0|' .. REPLACE_ID .. '|' .. (folder or p.folder.guid))
end

for _, where in ipairs({ 'narrator', 'guard', 'hero' }) do
  H.test(
    'replace_range with the folder moves the later items of every voice by the difference in length (the words are on ' .. where .. '), one undo block',
    function()
      local s, p = project(where)
      local source = with_their_audio(s)
      local guard_later = s.fake:add_item(p.guard, { position = 30, length = 2, source = 'guard-later.wav' })
      local hero_item = where == 'hero' and p.later or p.other_hero
      replace_with_folder(s, p, source)
      H.eq(s:events()[1][1], 'RANGE_REPLACED')
      H.eq(span(p.later), { 25, 6 }, 'the replaced voice’s later item moves 1 s later (their read is 1 s longer)')
      H.eq(span(hero_item), { 25, 6 }, 'so does the hero’s')
      H.eq(span(guard_later), { 31, 2 }, 'and the nested folder’s voice')
      H.eq(span(p.after_item), { 0, 5 }, 'the next chapter is not in the folder')
      H.eq(#s.fake:undo_labels(), 1, 'one undo block for every track')
      H.eq(s.fake.open_undo_blocks, 0)
    end
  )
end

H.test('replace_range without the folder moves only the item’s own track (why the host sends it)', function()
  local s, p = project('narrator')
  local source = with_their_audio(s)
  s:send('replace_range', 'r1', ITEM, '14', '16', source.guid, '164.2|167.2|10|0|' .. REPLACE_ID)
  H.eq(s:events()[1][1], 'RANGE_REPLACED')
  H.eq(span(p.later), { 25, 6 })
  H.eq(span(p.other_hero), { 24, 6 })
end)

H.test('replace_range with the folder refuses when another voice has audio under the words, and changes nothing', function()
  local s, p = project('narrator')
  local source = with_their_audio(s)
  s.fake:add_item(p.hero, { position = 15, length = 3, source = 'hero-line.wav' })
  s.fake.calls = {}
  replace_with_folder(s, p, source)
  H.eq(s:events(), { { 'ERROR', 'r1', 'Another voice in the folder has audio under the words to replace, so nothing changed.' } })
  H.eq(span(p.item), { 10, 10 })
  H.eq(span(p.later), { 24, 6 })
  H.eq(#s.fake.undo, 0)
  H.eq(s.fake.sources_created, s.fake.sources_destroyed, 'no source is left open')
end)

H.test('replace_range with a folder that is gone is stale, and one the item is not inside is refused; nothing changes', function()
  local s, p = project('narrator')
  local source = with_their_audio(s)
  replace_with_folder(s, p, source, '{FFFFFFFF-0000-4000-8000-00000000FFFF}')
  H.eq(s:events(), { { 'TRACK_STALE', 'r1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
  replace_with_folder(s, p, source, p.hero.guid)
  H.eq(s:events(), { { 'ERROR', 'r1', 'The item is not inside the chapter folder, so nothing changed.' } })
  H.eq(span(p.later), { 24, 6 })
  H.eq(#s.fake.undo, 0)
end)

H.test('replace_range with more than six parts in the last field is refused as a bad id', function()
  local s, p = project('narrator')
  local source = with_their_audio(s)
  s:send('replace_range', 'r1', ITEM, '14', '16', source.guid, '164.2|167.2|10|0|' .. REPLACE_ID .. '|' .. p.folder.guid .. '|x')
  H.eq(s:events()[1][1], 'ERROR')
  H.eq(#s.fake.undo, 0)
end)

H.test('restore_replacement with the folder moves every voice back, and refuses when another voice has audio where the replacement is', function()
  local s, p = project('narrator')
  local source = with_their_audio(s)
  replace_with_folder(s, p, source)
  local new_guid = s:events()[1][3]
  -- A voice with audio under the replacement: refused, nothing moves.
  local clash = s.fake:add_item(p.hero, { position = 15, length = 1, source = 'hero-line.wav' })
  s.fake.calls = {}
  s:send('restore_replacement', 'p1', new_guid, REPLACE_ID .. '|' .. p.folder.guid)
  H.eq(s:events(), { { 'ERROR', 'p1', 'Another voice in the folder has audio where the replacement is, so nothing changed.' } })
  H.eq(span(p.later), { 25, 6 })
  H.eq(#s.fake.undo, 1, 'only the replace has an undo point')
  clash.position = 100 -- it moves away
  s:send('restore_replacement', 'p2', new_guid, REPLACE_ID .. '|' .. p.folder.guid)
  H.eq(s:events()[1][1], 'REPLACEMENT_RESTORED')
  H.eq(span(p.later), { 24, 6 }, 'the replaced voice’s later item is back')
  H.eq(span(p.other_hero), { 24, 6 }, 'and so is the hero’s')
  H.eq(#s.fake:undo_labels(), 2, 'one undo block for the restore')
end)

H.test('restore_replacement with a folder that is gone is stale; nothing changes', function()
  local s, p = project('narrator')
  local source = with_their_audio(s)
  replace_with_folder(s, p, source)
  local new_guid = s:events()[1][3]
  s:send('restore_replacement', 'p1', new_guid, REPLACE_ID .. '|{FFFFFFFF-0000-4000-8000-00000000FFFF}')
  H.eq(s:events(), { { 'TRACK_STALE', 'p1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
  H.eq(span(p.later), { 25, 6 })
  H.eq(#s.fake.undo, 1)
end)

-- stack_takes and unstack_takes ripple the whole folder when the payload names it (#3043 part 4): a `folder|GUID` line right after the `shift` line.
local function guid(n)
  return string.format('{%08X-0000-4000-8000-%012X}', 0xB0000000 + n, n)
end
local BASE, BASE_TAKE, RETRY, RETRY_TAKE = guid(1), guid(2), guid(3), guid(4)

-- Chapter 1 folder > Narrator (the first read 10-15, a retry 16-20, a later item 30-35), Crowd folder > Guard (an item 40-42), Hero (an item 30-35).
local function stack_project()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local fake = s.fake
  local folder = fake:add_track('Chapter 1')
  local narrator = fake:add_track('Narrator')
  local crowd = fake:add_track('Crowd')
  local guard = fake:add_track('Guard')
  local hero = fake:add_track('Hero')
  local after = fake:add_track('Chapter 2')
  folder.folder_depth, crowd.folder_depth, guard.folder_depth, hero.folder_depth = 1, 1, -1, -1
  local file = s:path('retry.wav')
  H.write_file(file, 'RIFF')
  local p = { folder = folder, narrator = narrator, guard = guard, hero = hero }
  p.base = fake:add_item(narrator, { guid = BASE, take_guid = BASE_TAKE, position = 10, length = 5, source = 'read1.wav' })
  p.retry = fake:add_item(narrator, { guid = RETRY, take_guid = RETRY_TAKE, position = 16, length = 4, source = file })
  p.later = fake:add_item(narrator, { position = 30, length = 5, source = 'later.wav' })
  p.guard_item = fake:add_item(guard, { position = 40, length = 2, source = 'guard.wav' })
  p.hero_item = fake:add_item(hero, { position = 30, length = 5, source = 'hero.wav' })
  p.after_item = fake:add_item(after, { position = 0, length = 5, source = 'ch2.wav' })
  fake.calls = {}
  return s, p
end

local function stack_payload(s, name, lines)
  local path = s:path(name)
  H.write_file(path, table.concat(lines, '\n') .. '\n')
  return path
end

local function stack_lines(p, folder)
  local lines = { 'shift|-5' }
  if folder then
    lines[#lines + 1] = 'folder|' .. folder
  end
  lines[#lines + 1] = 'group|' .. BASE .. '|' .. BASE_TAKE
  lines[#lines + 1] = 'move|' .. RETRY_TAKE .. '|16|10|4'
  return lines
end

local function unstack_lines(folder)
  local lines = { 'shift|5' }
  if folder then
    lines[#lines + 1] = 'folder|' .. folder
  end
  lines[#lines + 1] = 'group|' .. BASE .. '|' .. BASE_TAKE
  lines[#lines + 1] = 'move|' .. RETRY_TAKE .. '|10|16|4'
  return lines
end

H.test('stack_takes with the folder moves the later items of every voice, in one undo block', function()
  local s, p = stack_project()
  s:send('stack_takes', 's1', stack_payload(s, 'stack.txt', stack_lines(p, p.folder.guid)))
  H.eq(s:events()[1][1], 'TAKES_STACKED')
  H.eq(span(p.later), { 25, 5 }, 'the narrator’s later item moves up by the 5 s the retry took')
  H.eq(span(p.hero_item), { 25, 5 }, 'so does the hero’s')
  H.eq(span(p.guard_item), { 35, 2 }, 'and the nested folder’s voice')
  H.eq(span(p.after_item), { 0, 5 }, 'the next chapter is not in the folder')
  H.eq(#s.fake:undo_labels(), 1, 'one undo block for every track')
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('stack_takes without the folder moves only the reads’ own track (why the host sends it)', function()
  local s, p = stack_project()
  s:send('stack_takes', 's1', stack_payload(s, 'stack.txt', stack_lines(p)))
  H.eq(s:events()[1][1], 'TAKES_STACKED')
  H.eq(span(p.later), { 25, 5 })
  H.eq(span(p.hero_item), { 30, 5 })
end)

H.test('stack_takes with the folder refuses when another voice has audio in the stretch the reads leave, and changes nothing', function()
  local s, p = stack_project()
  s.fake:add_item(p.hero, { position = 17, length = 1, source = 'hero-line.wav' })
  s.fake.calls = {}
  s:send('stack_takes', 's1', stack_payload(s, 'stack.txt', stack_lines(p, p.folder.guid)))
  H.eq(s:events(), { { 'ERROR', 's1', 'Another voice in the folder has audio where the stacked reads sit, so nothing changed.' } })
  H.eq(span(p.later), { 30, 5 })
  H.eq(#p.base.takes, 1, 'no take is added')
  H.eq(#s.fake.undo, 0)
end)

H.test('stack_takes with a folder that is gone is stale, and one the reads are not inside is refused; nothing changes', function()
  local s, p = stack_project()
  s:send('stack_takes', 's1', stack_payload(s, 'stack.txt', stack_lines(p, '{FFFFFFFF-0000-4000-8000-00000000FFFF}')))
  H.eq(s:events(), { { 'TRACK_STALE', 's1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
  s:send('stack_takes', 's2', stack_payload(s, 'stack2.txt', stack_lines(p, p.hero.guid)))
  H.eq(s:events(), { { 'ERROR', 's2', 'The item is not inside the chapter folder, so nothing changed.' } })
  H.eq(span(p.later), { 30, 5 })
  H.eq(#s.fake.undo, 0)
end)

H.test('a folder line anywhere but right after the shift line, or twice, is an unreadable request', function()
  local s, p = stack_project()
  local lines = stack_lines(p)
  lines[#lines + 1] = 'folder|' .. p.folder.guid
  s:send('stack_takes', 's1', stack_payload(s, 'late.txt', lines))
  H.eq(s:events()[1][1], 'ERROR')
  local twice =
    { 'shift|-5', 'folder|' .. p.folder.guid, 'folder|' .. p.folder.guid, 'group|' .. BASE .. '|' .. BASE_TAKE, 'move|' .. RETRY_TAKE .. '|16|10|4' }
  s:send('stack_takes', 's2', stack_payload(s, 'twice.txt', twice))
  H.eq(s:events()[1][1], 'ERROR')
  s:send(
    'stack_takes',
    's3',
    stack_payload(s, 'bad.txt', { 'shift|-5', 'folder|not-a-guid', 'group|' .. BASE .. '|' .. BASE_TAKE, 'move|' .. RETRY_TAKE .. '|16|10|4' })
  )
  H.eq(s:events()[1][1], 'ERROR')
  H.eq(span(p.later), { 30, 5 })
  H.eq(#s.fake.undo, 0)
end)

H.test('unstack_takes with the folder puts every voice back, and one more stack and unstack round trips', function()
  local s, p = stack_project()
  s:send('stack_takes', 's1', stack_payload(s, 'stack.txt', stack_lines(p, p.folder.guid)))
  H.eq(s:events()[1][1], 'TAKES_STACKED')
  s:send('unstack_takes', 'u1', stack_payload(s, 'unstack.txt', unstack_lines(p.folder.guid)))
  H.eq(s:events()[1][1], 'TAKES_UNSTACKED')
  H.eq(span(p.later), { 30, 5 })
  H.eq(span(p.hero_item), { 30, 5 })
  H.eq(span(p.guard_item), { 40, 2 })
  H.eq(span(p.retry), { 16, 4 }, 'the retry is back where it was recorded')
  H.eq(#s.fake:undo_labels(), 2, 'one undo block each')
end)

H.test('unstack_takes with the folder refuses when another voice has audio where the reads go back, and changes nothing', function()
  local s, p = stack_project()
  s:send('stack_takes', 's1', stack_payload(s, 'stack.txt', stack_lines(p, p.folder.guid)))
  s:events()
  s.fake:add_item(p.hero, { position = 16, length = 1, source = 'hero-line.wav' })
  s.fake.calls = {}
  s:send('unstack_takes', 'u1', stack_payload(s, 'unstack.txt', unstack_lines(p.folder.guid)))
  H.eq(s:events(), { { 'ERROR', 'u1', 'Another voice in the folder has audio where the stacked reads sit, so nothing changed.' } })
  H.eq(span(p.later), { 25, 5 })
  H.eq(#s.fake.undo, 1, 'only the stack has an undo point')
end)
