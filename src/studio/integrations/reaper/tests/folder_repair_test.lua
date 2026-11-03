-- Moving chapter tracks out of another chapter's folder (narration_track_create.lua, chapter_folders; #2838). A project nested by the
-- append bug (every chapter added after a folder left open at the end landed inside it) is put right by changing only the folder depth
-- (I_FOLDERDEPTH) of the track just before each nested chapter, in one undo point, after a preview the narrator confirmed.

local H = require('harness')

local LABEL = H.brand.name .. ': move chapters out of folders'

local function depths(s)
  local out = {}
  for _, track in ipairs(s.fake.tracks) do
    out[#out + 1] = { track.name, track.folder_depth or 0 }
  end
  return out
end

-- The fake's tracks, by name, from { name, I_FOLDERDEPTH } rows.
local function project(rows)
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local by = {}
  for _, row in ipairs(rows) do
    local track = s.fake:add_track(row[1])
    track.folder_depth = row[2]
    by[row[1]] = track
  end
  return s, by
end

local function guids(by, names)
  local out = {}
  for _, name in ipairs(names) do
    out[#out + 1] = by[name].guid
  end
  return table.concat(out, ',')
end

-- The owner's project: Chapter 3's folder was left open at the end (Veyra at 0), and the chapters the app added afterwards landed inside it.
local OWNER = {
  { 'Chapter 1', 0 },
  { 'Chapter 2', 0 },
  { 'Chapter 3', 1 },
  { 'Narrator', 0 },
  { 'Veyra', 0 },
  { 'Chapter 4', 0 },
  { 'Chapter 5', 0 },
  { 'Chapter 6', 0 },
}
local CHAPTERS = { 'Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Chapter 5', 'Chapter 6' }

-- The last event the command answered (s:events() drains the log, so it is read once).
local function last(s)
  local events = s:events()
  return events[#events]
end

local function moves(events, tag)
  local out = {}
  for _, event in ipairs(events) do
    if event[1] == 'FOLDER_MOVE' then
      out[#out + 1] = { event[3], event[5], event[7] }
    end
  end
  return out, events[#events][1] == tag and events[#events] or nil
end

H.test("chapter_folders preview lists every chapter inside another chapter's folder and changes nothing", function()
  local s, by = project(OWNER)
  local before = depths(s)
  s:send('chapter_folders', 'p1', 'preview', guids(by, CHAPTERS))
  local listed, final = moves(s:events(), 'FOLDERS_PLANNED')
  H.eq(listed, {
    { by['Chapter 4'].guid, by['Chapter 3'].guid, '' },
    { by['Chapter 5'].guid, by['Chapter 3'].guid, '' },
    { by['Chapter 6'].guid, by['Chapter 3'].guid, '' },
  })
  H.eq(final, { 'FOLDERS_PLANNED', 'p1', '3' })
  H.eq(depths(s), before)
  H.eq(s.fake:undo_labels(), {})
end)

H.test('chapter_folders apply closes Chapter 3 on its last voice, so every later chapter is at the top level again, in one undo point', function()
  local s, by = project(OWNER)
  local expected = guids(by, { 'Chapter 4', 'Chapter 5', 'Chapter 6' })
  s:send('chapter_folders', 'a1', 'apply', guids(by, CHAPTERS), expected)
  local _, final = moves(s:events(), 'FOLDERS_REPAIRED')
  H.eq(final, { 'FOLDERS_REPAIRED', 'a1', '3' })
  H.eq(depths(s), {
    { 'Chapter 1', 0 },
    { 'Chapter 2', 0 },
    { 'Chapter 3', 1 },
    { 'Narrator', 0 },
    { 'Veyra', -1 },
    { 'Chapter 4', 0 },
    { 'Chapter 5', 0 },
    { 'Chapter 6', 0 },
  })
  local parents = H.parents(s)
  H.eq({ parents.Narrator, parents.Veyra, parents['Chapter 4'], parents['Chapter 6'] }, { 'Chapter 3', 'Chapter 3', '', '' })
  H.eq(s.fake:undo_labels(), { LABEL })
  H.eq(s.fake.open_undo_blocks, 0)
end)

H.test('a nested chapter that is itself a folder moves out with its own voices, which stay inside it', function()
  local s, by = project({
    { 'Chapter 3', 1 },
    { 'Narrator', 0 },
    { 'Chapter 4', 1 },
    { 'C4 Narrator', 0 },
    { 'C4 Alice', -1 },
    { 'Chapter 5', 0 },
  })
  local chapters = guids(by, { 'Chapter 3', 'Chapter 4', 'Chapter 5' })
  s:send('chapter_folders', 'a1', 'apply', chapters, guids(by, { 'Chapter 4', 'Chapter 5' }))
  H.eq(last(s), { 'FOLDERS_REPAIRED', 'a1', '2' })
  H.eq(depths(s), {
    { 'Chapter 3', 1 },
    { 'Narrator', -1 },
    { 'Chapter 4', 1 },
    { 'C4 Narrator', 0 },
    { 'C4 Alice', -1 },
    { 'Chapter 5', 0 },
  })
  local parents = H.parents(s)
  H.eq({ parents['C4 Narrator'], parents['C4 Alice'], parents['Chapter 4'], parents['Chapter 5'] }, { 'Chapter 4', 'Chapter 4', '', '' })
end)

H.test('chapters inside a Book folder move out of the chapter folder only, and stay in the Book', function()
  local s, by = project({
    { 'Book', 1 },
    { 'Chapter 3', 1 },
    { 'Narrator', 0 },
    { 'Chapter 4', 0 },
  })
  s:send('chapter_folders', 'a1', 'apply', guids(by, { 'Chapter 3', 'Chapter 4' }), guids(by, { 'Chapter 4' }))
  H.eq(depths(s), { { 'Book', 1 }, { 'Chapter 3', 1 }, { 'Narrator', -1 }, { 'Chapter 4', 0 } })
  H.eq(H.parents(s)['Chapter 4'], 'Book')
end)

H.test('a project with no chapter inside another is left alone: no moves, no undo point', function()
  local s, by = project({ { 'Chapter 3', 1 }, { 'Narrator', -1 }, { 'Chapter 4', 0 } })
  local before = depths(s)
  s:send('chapter_folders', 'a1', 'apply', guids(by, { 'Chapter 3', 'Chapter 4' }), '')
  H.eq(s:events(), { { 'FOLDERS_REPAIRED', 'a1', '0' } })
  H.eq(depths(s), before)
  H.eq(s.fake:undo_labels(), {})
end)

H.test('a voice track inside a chapter folder is never moved, only chapter tracks are', function()
  local s, by = project({ { 'Chapter 3', 1 }, { 'Narrator', 0 }, { 'Veyra', 0 }, { 'Chapter 4', 0 } })
  s:send('chapter_folders', 'p1', 'preview', guids(by, { 'Chapter 3', 'Chapter 4' }))
  local listed = moves(s:events(), 'FOLDERS_PLANNED')
  H.eq(listed, { { by['Chapter 4'].guid, by['Chapter 3'].guid, '' } })
end)

H.test('apply refuses as stale when the project changed since the preview, and writes nothing', function()
  local s, by = project(OWNER)
  local before = depths(s)
  -- The preview the narrator confirmed listed only Chapter 4; Chapters 5 and 6 are nested too now.
  s:send('chapter_folders', 'a1', 'apply', guids(by, CHAPTERS), guids(by, { 'Chapter 4' }))
  H.eq(last(s), { 'FOLDERS_STALE', 'a1' })
  H.eq(depths(s), before)
  H.eq(s.fake:undo_labels(), {})
end)

H.test('chapter_folders refuses while REAPER records, and an unknown mode, and writes nothing', function()
  local s, by = project(OWNER)
  local before = depths(s)
  s.fake.play_state = 5
  s:send('chapter_folders', 'a1', 'apply', guids(by, CHAPTERS), guids(by, { 'Chapter 4', 'Chapter 5', 'Chapter 6' }))
  H.eq(s:events()[1][1], 'ERROR')
  s.fake.play_state = 0
  s:send('chapter_folders', 'a2', 'tidy', guids(by, CHAPTERS))
  H.eq(s:events()[1][1], 'ERROR')
  H.eq(depths(s), before)
end)

H.test('each move names the track and both folders as REAPER holds them now', function()
  local s, by = project(OWNER)
  s:send('chapter_folders', 'p1', 'preview', guids(by, CHAPTERS))
  H.eq(s:events()[1], { 'FOLDER_MOVE', 'p1', by['Chapter 4'].guid, 'Chapter 4', by['Chapter 3'].guid, 'Chapter 3', '', '' })
end)

H.test('a GUID the project does not hold is ignored, not a chapter', function()
  local s, by = project(OWNER)
  s:send('chapter_folders', 'p1', 'preview', guids(by, { 'Chapter 3', 'Chapter 4' }) .. ',{DEAD0000-0000-4000-8000-000000000000}')
  H.eq(last(s), { 'FOLDERS_PLANNED', 'p1', '1' })
end)

H.test("a chapter two levels down, inside a voice folder of another chapter's folder, is lifted both levels", function()
  local s, by = project({ { 'Chapter 3', 1 }, { 'Crowd', 1 }, { 'Chapter 4', 0 } })
  s:send('chapter_folders', 'a1', 'apply', guids(by, { 'Chapter 3', 'Chapter 4' }), guids(by, { 'Chapter 4' }))
  H.eq(last(s), { 'FOLDERS_REPAIRED', 'a1', '1' })
  H.eq(depths(s), { { 'Chapter 3', 1 }, { 'Crowd', -1 }, { 'Chapter 4', 0 } })
  H.eq(H.parents(s)['Chapter 4'], '')
  H.eq(H.parents(s)['Crowd'], 'Chapter 3')
end)
