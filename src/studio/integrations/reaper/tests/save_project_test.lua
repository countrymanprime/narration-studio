-- save_project (see narration_save_project.lua): the app's one way to make REAPER write the open project to its own file.

local H = require('harness')

local function session(path)
  local s = H.session({ project_path = path })
  local track = s.fake:add_track('Chapter 1')
  s.fake:add_item(track, { position = 0, length = 3 })
  return s
end

local function saved_after(s)
  return (s.fake.saves or 0)
end

H.test('save_project saves the linked project, tells how much it holds and adds no undo point', function()
  local path = H.join(host.tmpdir(), 'Book.rpp')
  local s = session(path)
  s.fake.change_count = 5
  s:send('save_project', 's1', path)
  H.eq(s:events(), { { 'SAVED', 's1', '1', '1' } })
  H.eq(saved_after(s), 1)
  H.eq(s.fake.saved_count, 5)
  H.eq(#s.fake.undo, 0)
  H.eq(s.fake.open_undo_blocks, 0)
  H.eq(s.fake.dialog_opened, nil)
end)

H.test('save_project never asks REAPER to save as, which would open a file dialog', function()
  local path = H.join(host.tmpdir(), 'Book.rpp')
  local s = session(path)
  s:send('save_project', 's1', path)
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'Main_SaveProject' then
      H.eq(call.force_save_as, false)
    end
  end
end)

H.test('save_project matches the linked path with slashes and case folded', function()
  local s = session('C:/Books/Book.rpp')
  s:send('save_project', 's1', 'c:\\books\\BOOK.rpp')
  H.eq(s:events()[1][1], 'SAVED')
end)

H.test('save_project refuses a project that was never saved, and opens no file dialog', function()
  local s = session('')
  s:send('save_project', 's1', 'Book.rpp')
  local events = s:events()
  H.eq(events[1][1], 'ERROR')
  H.contains(events[1][3], 'never been saved')
  H.eq(saved_after(s), 0)
  H.eq(s.fake.dialog_opened, nil)
end)

H.test('save_project refuses when REAPER has another project open, so the wrong file is never written', function()
  local s = session(H.join(host.tmpdir(), 'Other.rpp'))
  s.fake.change_count = 2
  s:send('save_project', 's1', H.join(host.tmpdir(), 'Book.rpp'))
  H.contains(s:events()[1][3], 'different project')
  H.eq(saved_after(s), 0)
end)

H.test('save_project refuses with no path from the app', function()
  local s = session(H.join(host.tmpdir(), 'Book.rpp'))
  s:send('save_project', 's1')
  H.eq(s:events()[1][1], 'ERROR')
  s:send('save_project', 's2', '')
  H.eq(s:events()[1][1], 'ERROR')
  H.eq(saved_after(s), 0)
end)

H.test('save_project refuses while REAPER records', function()
  local path = H.join(host.tmpdir(), 'Book.rpp')
  local s = session(path)
  s.fake.play_state = 4
  s:send('save_project', 's1', path)
  H.eq(s:events(), { { 'ERROR', 's1', 'REAPER is recording. Stop recording first.' } })
  H.eq(saved_after(s), 0)
end)

H.test('save_project refuses, and says so, when REAPER still has unsaved changes afterwards', function()
  local path = H.join(host.tmpdir(), 'Book.rpp')
  local s = session(path)
  s.fake.change_count = 3
  s.fake.save_fails = true
  s:send('save_project', 's1', path)
  local events = s:events()
  H.eq(events[1][1], 'ERROR')
  H.contains(events[1][3], 'could not save')
end)

H.test('save_project needs the save API', function()
  local path = H.join(host.tmpdir(), 'Book.rpp')
  local s = session(path)
  s.fake:remove_api('Main_SaveProject')
  s:send('save_project', 's1', path)
  H.eq(s:events()[1][1], 'ERROR')
end)

H.test('save_project saves again when asked again: a second save is the same answer', function()
  local path = H.join(host.tmpdir(), 'Book.rpp')
  local s = session(path)
  s:send('save_project', 's1', path)
  s:send('save_project', 's2', path)
  H.eq(s:events(), { { 'SAVED', 's1', '1', '1' }, { 'SAVED', 's2', '1', '1' } })
end)
