-- The carry-over of the app's P_EXT keys from the product's name before the rename (narration_rename.lua). The load-bearing
-- tests: a value under an old key reaches the current key before the first command reads it, a value already under the current
-- key wins, the old key is cleared, it runs once per project, and every key the bridge writes is one the carry-over knows.

local H = require('harness')
local rename = dofile(H.join(host.reaper_dir, 'narration_rename.lua'))
local OLD, NEW = rename.OLD_PREFIX, rename.NEW_PREFIX

-- A project saved by a build from before the rename: a track with cuts, an item with a line id, a take with a stack record,
-- and a take that already has the current key too.
local function old_project(path)
  local s = H.session({ project_path = H.join(host.tmpdir(), path or 'Book.rpp') })
  s.track = s.fake:add_track('Narration')
  s.track.ext = { [OLD .. 'cuts'] = '1' }
  s.item = s.fake:add_item(s.track, { source = 'take1.wav', position = 0, length = 3 })
  s.item.ext[OLD .. 'line_id'] = 'line-000004'
  s.item.ext[OLD .. 'line_text'] = 'Down the rabbit hole 🐇 — مرحبا'
  s.take = s.item.takes[1]
  s.take.ext[OLD .. 'stacked_from'] = 'old record'
  s.take.ext[NEW .. 'stacked_from'] = 'new record'
  s.take.ext[OLD .. 'take_hidden_volume'] = '0.5'
  return s
end

H.test('a project saved before the rename has its keys carried over before the first command runs', function()
  local s = old_project()
  s:send('ping', 'r1')
  H.eq(s.track.ext[NEW .. 'cuts'], '1', 'track key carried')
  H.eq(s.item.ext[NEW .. 'line_id'], 'line-000004', 'item key carried')
  H.eq(s.item.ext[NEW .. 'line_text'], 'Down the rabbit hole 🐇 — مرحبا', 'emoji and right-to-left text carried as they are')
  H.eq(s.take.ext[NEW .. 'take_hidden_volume'], '0.5', 'take key carried')
  H.eq(s.take.ext[NEW .. 'stacked_from'], 'new record', 'a value already under the current key wins')
  for _, ext in ipairs({ s.track.ext, s.item.ext, s.take.ext }) do
    for key, value in pairs(ext) do
      if key:sub(1, #OLD) == OLD then
        H.eq(value, '', 'old key ' .. key .. ' cleared')
      end
    end
  end
end)

H.test('the carry-over runs once per project: a later old value is left alone', function()
  local s = old_project()
  s:send('ping', 'r1')
  s.item.ext[OLD .. 'line_id'] = 'written by an old build afterwards'
  s:send('ping', 'r2')
  H.eq(s.item.ext[NEW .. 'line_id'], 'line-000004', 'not carried a second time')
  -- Another project in the same session is carried over on its own first command.
  s.fake.project_path = H.join(host.tmpdir(), 'Other.rpp')
  s:send('ping', 'r3')
  H.eq(s.item.ext[NEW .. 'line_id'], 'line-000004', 'the current key still wins')
  H.eq(s.item.ext[OLD .. 'line_id'], '', 'the new project was carried over')
end)

H.test('a project with nothing to carry over is not touched', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'New.rpp') })
  local track = s.fake:add_track('Narration')
  local item = s.fake:add_item(track, { source = 'a.wav' })
  item.ext[NEW .. 'line_id'] = 'line-000001'
  s:send('ping', 'r1')
  for _, call in ipairs(s.fake.calls) do
    H.eq(call.name == 'GetSetMediaTrackInfo_String', false, 'no track value was set')
  end
  H.eq(item.ext[NEW .. 'line_id'], 'line-000001')
  H.eq(rename.carry_over(s.fake), 0, 'nothing moved')
end)

H.test('every P_EXT key a bridge file writes is one the carry-over knows', function()
  local known = {}
  for _, list in ipairs({ rename.TRACK_KEYS, rename.ITEM_KEYS, rename.TAKE_KEYS }) do
    for _, key in ipairs(list) do
      known[key] = true
    end
  end
  local found = 0
  for _, name in ipairs(host.listdir(host.reaper_dir)) do
    if name:match('%.lua$') then
      local text = H.read_file(H.join(host.reaper_dir, name))
      for key in text:gmatch('P_EXT:' .. NEW:gsub('%p', '%%%0') .. "([%w_]+)'") do
        found = found + 1
        H.eq(known[key], true, name .. ' writes P_EXT:' .. NEW .. key .. ', which narration_rename.lua does not carry over')
      end
    end
  end
  H.eq(found >= 13, true, 'the scan found the bridge keys')
end)

H.run('rename_test.lua')
