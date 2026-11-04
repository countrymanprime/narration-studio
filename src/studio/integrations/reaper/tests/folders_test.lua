-- The bridge core's folder helpers (narration_bridge_core.lua): each track's folder from the I_FOLDERDEPTH changes, and the guard every
-- track insert passes before it writes, so no chapter can be moved into another chapter's folder (#2251).

local H = require('harness')

local function load_core()
  return dofile(H.join(host.reaper_dir, 'narration_bridge_core.lua'))
end

H.test('folder_parents reads each track folder from the depth changes, including a close of several levels at once', function()
  local core = load_core()
  -- Book { Chapter 3 { Narrator } } Chapter 4 { C4 Narrator } Chapter 5
  H.eq(core.folder_parents({ 1, 1, -2, 1, -1, 0 }), { 0, 1, 2, 0, 4, 0 })
end)

H.test('folder_parents keeps a close past the top level at the top level, as REAPER reads it', function()
  local core = load_core()
  H.eq(core.folder_parents({ -1, 1, -1, 0 }), { 0, 0, 2, 0 })
end)

H.test('folder_parents puts every track after a folder left open at the end inside it', function()
  local core = load_core()
  H.eq(core.folder_parents({ 1, 0, 0 }), { 0, 1, 1 })
end)

H.test('insert_keeps_parents accepts a new last child of a middle folder whose old last child no longer closes it', function()
  local core = load_core()
  -- Chapter 3 { Narrator } Chapter 4 { C4 Narrator } -> Chapter 3 { Narrator, Added } Chapter 4 { C4 Narrator }
  H.eq(core.insert_keeps_parents({ 1, -1, 1, -1 }, { 1, 0, -1, 1, -1 }, 3, 1), true)
end)

H.test('insert_keeps_parents refuses a new track that leaves the folder open and swallows the next chapter', function()
  local core = load_core()
  -- The new track does not close Chapter 3: Chapter 4 and its child would move inside Chapter 3.
  H.eq(core.insert_keeps_parents({ 1, -1, 1, -1 }, { 1, 0, 0, 1, -1 }, 3, 1), false)
end)

H.test('insert_keeps_parents refuses a new track in the wrong folder even when every other track keeps its own', function()
  local core = load_core()
  -- Asked for inside Chapter 3 (position 1), the new track lands at the top level after it.
  H.eq(core.insert_keeps_parents({ 1, -1, 0 }, { 1, -1, 0, 0 }, 3, 1), false)
end)

H.test('insert_keeps_parents refuses a change that takes an existing child out of its folder', function()
  local core = load_core()
  -- Narrator closes Chapter 3 one track early, so Veyra (an existing child) would fall out to the top level.
  H.eq(core.insert_keeps_parents({ 1, 0, -1 }, { 1, -1, 0, -1 }, 3, 1), false)
end)

H.test('insert_keeps_parents accepts an append at the top level after the open folders were closed', function()
  local core = load_core()
  H.eq(core.insert_keeps_parents({ 1, 0 }, { 1, -1, 0 }, 3, 0), true)
end)
