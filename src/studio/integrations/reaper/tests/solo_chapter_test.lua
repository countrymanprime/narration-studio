-- Solo in place on the chapter the narrator records: solo_chapter and solo_restore (narration_solo_chapter.lua). One I_SOLO write on the chapter's folder;
-- nothing inside the chapter or in another chapter is written, a solo or mute the narrator set is never changed, and only what was soloed is put back,
-- and only where the track still reads what was set.

local H = require('harness')

local LEDGER = 'narration_solo_ledger.txt'

-- Chapter 1 is a folder of two voices, Chapter 2 a folder of one, and Pickups a plain track.
local function new_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local fake = s.fake
  local t = {
    ch1 = fake:add_track('Chapter 1'),
    a = fake:add_track('Voice A'),
    b = fake:add_track('Voice B'),
    ch2 = fake:add_track('Chapter 2'),
    c = fake:add_track('Voice C'),
    pickups = fake:add_track('Pickups'),
  }
  t.ch1.folder_depth, t.b.folder_depth = 1, -1
  t.ch2.folder_depth, t.c.folder_depth = 1, -1
  return s, t
end

local function solos(s)
  local out = {}
  for _, track in ipairs(s.fake.tracks) do
    out[#out + 1] = track.solo or 0
  end
  return out
end

local function mutes(s)
  local out = {}
  for _, track in ipairs(s.fake.tracks) do
    out[#out + 1] = track.muted and true or false
  end
  return out
end

local function row(track)
  return track.guid .. '\t0\n'
end

local function ledger(s)
  return H.read_text(s:path(LEDGER))
end

-- Counts what REAPER would see as a write: only I_SOLO on one track is allowed.
local function writes(s)
  local out = {}
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'SetMediaTrackInfo_Value' then
      out[#out + 1] = call.key .. '=' .. tostring(call.value)
    end
  end
  return out
end

-- solo_chapter ---------------------------------------------------------------------------------------------------

H.test('solo_chapter soloes the folder in place with one write, and changes no mute, selection, undo point or project change', function()
  local s, t = new_session()
  t.a.muted = true
  t.pickups.muted = true
  local changes, muted = s.fake.change_count, mutes(s)
  s.fake.calls = {}
  s:send('solo_chapter', 'c1', t.ch1.guid)
  H.eq(s:events(), { { 'CHAPTER_SOLOED', 'c1', t.ch1.guid, '1', '0' } })
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 })
  H.eq(writes(s), { 'I_SOLO=2' }, 'one write on the chapter folder, nothing else')
  H.eq(mutes(s), muted, 'a mute the narrator set stays, and nothing inside the chapter is muted')
  H.eq(#s.fake.undo, 0)
  H.eq(s.fake.change_count, changes)
  H.eq(ledger(s), row(t.ch1))
end)

H.test('solo_chapter on a chapter that is one plain track soloes that track', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.pickups.guid)
  H.eq(solos(s), { 0, 0, 0, 0, 0, 2 })
end)

H.test('solo_chapter accepts the guid without braces and in lower case, and answers the one the bridge uses', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', (t.ch1.guid:gsub('[{}]', ''):lower()))
  H.eq(s:events(), { { 'CHAPTER_SOLOED', 'c1', t.ch1.guid, '1', '0' } })
end)

H.test('solo_chapter on a track that is gone answers TRACK_STALE and changes nothing', function()
  local s = new_session()
  s:send('solo_chapter', 'c1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}')
  H.eq(s:events(), { { 'TRACK_STALE', 'c1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' } })
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('solo_chapter with no track answers TRACK_STALE', function()
  local s = new_session()
  s:send('solo_chapter', 'c1')
  H.eq(s:events(), { { 'TRACK_STALE', 'c1', '' } })
end)

H.test('a folder the narrator soloed is left as it is, is not on the ledger and is not put back', function()
  for _, value in ipairs({ 1, 2, 5, 6 }) do
    local s, t = new_session()
    t.ch1.solo = value
    s:send('solo_chapter', 'c1', t.ch1.guid)
    H.eq(s:events(), { { 'CHAPTER_SOLOED', 'c1', t.ch1.guid, '0', '0' } })
    H.eq(ledger(s), nil)
    s:send('solo_restore', 'r1')
    H.eq(s:events(), { { 'SOLO_RESTORED', 'r1', '0', '0', '0' } })
    H.eq(t.ch1.solo, value, "the narrator's solo stays")
  end
end)

H.test("another chapter the narrator soloed stays soloed: the narrator's choice of what is heard is theirs", function()
  local s, t = new_session()
  t.pickups.solo = 1
  s:send('solo_chapter', 'c1', t.ch1.guid)
  H.eq(solos(s), { 2, 0, 0, 0, 0, 1 })
  s:send('solo_restore', 'r1')
  H.eq(solos(s), { 0, 0, 0, 0, 0, 1 })
end)

H.test('a folder the narrator muted is soloed and put back, and its mute is never touched', function()
  local s, t = new_session()
  t.ch1.muted = true
  s:send('solo_chapter', 'c1', t.ch1.guid)
  H.eq(t.ch1.muted, true)
  s:send('solo_restore', 'r1')
  H.eq(t.ch1.muted, true)
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
end)

H.test('soloing the same chapter again changes nothing and still puts it back once', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s:events()
  s:send('solo_chapter', 'c2', t.ch1.guid)
  H.eq(s:events(), { { 'CHAPTER_SOLOED', 'c2', t.ch1.guid, '0', '0' } })
  s:send('solo_restore', 'r1')
  H.eq(s:events(), { { 'SOLO_RESTORED', 'r1', '1', '0', '0' } })
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
end)

H.test('the narrator turned the solo off by hand and the chapter is entered again: it is soloed again and put back once', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  t.ch1.solo = 0
  s:send('solo_chapter', 'c2', t.ch1.guid)
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), row(t.ch1), 'one row, not two')
end)

H.test('moving to another chapter puts the earlier chapter back and soloes the new one', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s:send('solo_chapter', 'c2', t.ch2.guid)
  H.eq(solos(s), { 0, 0, 0, 2, 0, 0 })
  H.eq(ledger(s), row(t.ch2))
end)

H.test('moving to another chapter keeps a solo the narrator set on the earlier chapter meanwhile', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  t.ch1.solo = 1
  s:send('solo_chapter', 'c2', t.ch2.guid)
  H.eq(solos(s), { 1, 0, 0, 2, 0, 0 })
end)

H.test('two quick chapter steps leave exactly the last chapter soloed', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s:send('solo_chapter', 'c2', t.ch2.guid)
  s:send('solo_chapter', 'c3', t.ch1.guid)
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 })
  s:send('solo_restore', 'r1')
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
end)

-- solo_restore ---------------------------------------------------------------------------------------------------

H.test('solo_restore with nothing soloed answers zero and changes nothing', function()
  local s, t = new_session()
  t.pickups.solo = 1
  s:send('solo_restore', 'r1')
  H.eq(s:events(), { { 'SOLO_RESTORED', 'r1', '0', '0', '0' } })
  H.eq(solos(s), { 0, 0, 0, 0, 0, 1 })
end)

H.test('solo_restore puts back the chapter and removes the ledger, with one write', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s:events()
  s.fake.calls = {}
  s:send('solo_restore', 'r1')
  H.eq(s:events(), { { 'SOLO_RESTORED', 'r1', '1', '0', '0' } })
  H.eq(writes(s), { 'I_SOLO=0' })
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), nil)
  H.eq(#s.fake.undo, 0)
end)

H.test('solo_restore keeps a solo the narrator changed since, and a second restore puts back nothing', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  t.ch1.solo = 1
  s:send('solo_restore', 'r1')
  H.eq(s:events()[2], { 'SOLO_RESTORED', 'r1', '0', '1', '0' })
  H.eq(t.ch1.solo, 1)
  t.ch1.solo = 2
  s:send('solo_restore', 'r2')
  H.eq(s:events()[1], { 'SOLO_RESTORED', 'r2', '0', '0', '0' })
  H.eq(t.ch1.solo, 2, 'a solo the narrator gave the chapter after the restore is theirs')
end)

H.test('solo_restore keeps a solo the narrator took off by hand, and puts nothing back', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  t.ch1.solo = 0
  s:send('solo_restore', 'r1')
  H.eq(s:events()[2], { 'SOLO_RESTORED', 'r1', '0', '1', '0' })
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
end)

-- recording and a play ---------------------------------------------------------------------------------------------

H.test('solo_chapter while REAPER records touches nothing, answers waiting, and soloes on the first tick after the stop', function()
  local s, t = new_session()
  s.fake.play_state = 5
  s:send('solo_chapter', 'c1', t.ch1.guid)
  H.eq(s:events(), { { 'CHAPTER_SOLOED', 'c1', t.ch1.guid, '0', '1' } })
  s:tick()
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), nil)
  s.fake.play_state = 0
  s:tick()
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), row(t.ch1))
end)

H.test('solo_chapter while a record_start waits for REAPER touches nothing', function()
  local s, t = new_session()
  s.fake.record_delay_ticks = 3
  t.a.armed = true
  s:send('record_start', 'r1', t.a.guid)
  s:events()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  H.eq(s:events(), { { 'CHAPTER_SOLOED', 'c1', t.ch1.guid, '0', '1' } })
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
end)

H.test('a waiting solo is replaced by a newer one and dropped by a restore', function()
  local s, t = new_session()
  s.fake.play_state = 5
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s:send('solo_chapter', 'c2', t.ch2.guid)
  s.fake.play_state = 0
  s:tick()
  H.eq(solos(s), { 0, 0, 0, 2, 0, 0 }, 'the newest wins')
  s:send('solo_restore', 'r1')
  s.fake.play_state = 5
  s:send('solo_chapter', 'c3', t.ch1.guid)
  s:send('solo_restore', 'r2')
  s.fake.play_state = 0
  s:tick()
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 }, 'the narrator left before the take ended')
end)

H.test('solo_restore while REAPER records touches nothing and puts the chapter back on the first tick after the stop', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s:events()
  s.fake.play_state = 5
  s:send('solo_restore', 'r1')
  H.eq(s:events(), { { 'SOLO_RESTORED', 'r1', '0', '0', '1' } })
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 })
  s:tick()
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 }, 'still recording')
  s.fake.play_state = 0
  s:tick()
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('a restore that waited does not take back a chapter soloed after the recording stopped', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s.fake.play_state = 5
  s:send('solo_restore', 'r1')
  s.fake.play_state = 0
  s:send('solo_chapter', 'c2', t.ch1.guid)
  s:tick()
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 }, 'the Booth was entered again')
end)

H.test('a restore with nothing to put back answers zero while REAPER records', function()
  local s = new_session()
  s.fake.play_state = 5
  s:send('solo_restore', 'r1')
  H.eq(s:events(), { { 'SOLO_RESTORED', 'r1', '0', '0', '0' } })
end)

-- A play (narration_transport.lua) writes I_SOLO on every track and puts back what it set. The two layers must not restore each other's state.
local function with_audio(s, t)
  s.fake:add_item(t.ch1, { position = 0, length = 100, source = 'c1.wav' })
  s.fake:add_item(t.ch2, { position = 0, length = 100, source = 'c2.wav' })
end

H.test('solo_chapter during a play waits, and soloes once the play has put its isolation back', function()
  local s, t = new_session()
  with_audio(s, t)
  t.pickups.solo = 1
  s:send('play_from', 'p1', '10', t.ch2.guid)
  s:events()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  H.eq(s:events(), { { 'CHAPTER_SOLOED', 'c1', t.ch1.guid, '0', '1' } })
  H.eq(solos(s), { 0, 0, 0, 2, 0, 0 }, "the play's isolation only")
  s:send('stop_play', 'sp1')
  s:tick()
  H.eq(solos(s), { 2, 0, 0, 0, 0, 1 }, 'the chapter is soloed over what the narrator had, and the narrator solo is back')
end)

H.test('a play inside the soloed chapter puts our solo back, and the restore after it puts back the narrator', function()
  local s, t = new_session()
  with_audio(s, t)
  t.pickups.solo = 1
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s:send('play_from', 'p1', '10', t.ch2.guid)
  H.eq(solos(s), { 0, 0, 0, 2, 0, 0 })
  s:send('stop_play', 'sp1')
  H.eq(solos(s), { 2, 0, 0, 0, 0, 1 }, "the play put the chapter's solo back, which is ours")
  s:send('solo_restore', 'r1')
  H.eq(solos(s), { 0, 0, 0, 0, 0, 1 })
end)

H.test('solo_restore during a play waits and does not restore under the isolation', function()
  local s, t = new_session()
  with_audio(s, t)
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s:send('play_from', 'p1', '10', t.ch2.guid)
  s:events()
  s:send('solo_restore', 'r1')
  H.eq(s:events(), { { 'SOLO_RESTORED', 'r1', '0', '0', '1' } })
  s:send('stop_play', 'sp1')
  s:tick()
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 }, 'after the play the chapter is put back once, with no solo left over')
end)

H.test('a leftover play isolation is put back before a leftover solo ledger', function()
  local s, t = new_session()
  with_audio(s, t)
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s:send('play_from', 'p1', '10', t.ch2.guid)
  local solo_file, play_file = H.read_file(s:path(LEDGER)), H.read_file(s:path('narration_play_isolation.txt'))
  H.truthy(play_file, 'the play wrote its isolation file')
  -- A new bridge on the same REAPER: both files are leftovers, REAPER's tracks hold what the play left.
  local s2 = H.session({ project_path = s.fake.project_path })
  s2.fake.tracks = s.fake.tracks
  s2.fake.resource_path = s.fake.resource_path
  H.write_file(H.join(s2.fake.resource_path, LEDGER), solo_file)
  H.write_file(H.join(s2.fake.resource_path, 'narration_play_isolation.txt'), play_file)
  s2:send('solo_restore', 'r1')
  H.eq(solos(s2), { 0, 0, 0, 0, 0, 0 }, "the narrator's own state, not the chapter's solo")
  H.eq(H.read_file(H.join(s2.fake.resource_path, LEDGER)), nil)
end)

-- the ledger on disk ---------------------------------------------------------------------------------------------

H.test('a REAPER that closed with a chapter soloed is put right by the next bridge tick, and a narrator solo is kept', function()
  local s, t = new_session()
  H.write_file(s:path(LEDGER), row(t.ch1) .. row(t.ch2) .. 'not a row\n')
  t.ch1.solo, t.ch2.solo = 2, 1
  s:tick()
  H.eq(solos(s), { 0, 0, 0, 1, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('a leftover ledger is put back before the first solo_chapter writes its own', function()
  local s, t = new_session()
  H.write_file(s:path(LEDGER), row(t.ch2))
  t.ch2.solo = 2
  s:send('solo_chapter', 'c1', t.ch1.guid)
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 }, "the crashed REAPER's chapter went back and the new one is soloed")
  H.eq(ledger(s), row(t.ch1), 'the file holds this bridge chapter only')
end)

H.test('a leftover ledger is put back when the first command is solo_restore', function()
  local s, t = new_session()
  H.write_file(s:path(LEDGER), row(t.ch2))
  t.ch2.solo = 2
  s:send('solo_restore', 'r1')
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('the ledger a running bridge wrote is not read back as a leftover', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s:tick()
  s:tick()
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 })
end)

H.test('the leftover ledger is not read while REAPER records, and is put back after the stop', function()
  local s, t = new_session()
  H.write_file(s:path(LEDGER), row(t.ch1))
  t.ch1.solo = 2
  s.fake.play_state = 5
  s:tick()
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 })
  H.truthy(ledger(s), 'the file is kept')
  s.fake.play_state = 0
  s:tick()
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('a damaged ledger row cannot write any value but the off a chapter had', function()
  local s, t = new_session()
  H.write_file(s:path(LEDGER), t.ch1.guid .. '\t99\n' .. t.ch2.guid .. '\t1\n' .. t.pickups.guid .. '\t-3\n')
  t.ch1.solo, t.ch2.solo, t.pickups.solo = 2, 2, 2
  s:tick()
  H.eq(solos(s), { 2, 0, 0, 2, 0, 2 })
end)

H.test('a leftover whose track is not there stays on the ledger as a ghost, and is put back once its project is in front', function()
  local s, t = new_session()
  local wanted = t.ch1.guid
  local tracks = s.fake.tracks
  s.fake.tracks = {}
  H.write_file(s:path(LEDGER), wanted .. '\t0\n')
  s:tick()
  H.eq(ledger(s), wanted .. '\t0\n', 'its project is not in front: the row waits')
  s.fake.tracks = tracks
  t.ch1.solo = 2
  s:tick()
  H.eq(t.ch1.solo, 0)
  H.eq(ledger(s), nil)
end)

H.test('a chapter soloed in a project that is then switched away from is kept as a ghost and put back when that project returns', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  local tracks, book = s.fake.tracks, s.fake.project_path
  s.fake.tracks, s.fake.project_path = {}, '/elsewhere/Other.rpp'
  s:send('solo_restore', 'r1')
  H.eq(s:events()[2], { 'SOLO_RESTORED', 'r1', '0', '0', '0' })
  H.eq(ledger(s), row(t.ch1), 'the row stays on the ledger')
  s.fake.tracks, s.fake.project_path = tracks, book
  s:tick()
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), nil)
end)

H.test('a Save as while soloed keeps the chapter findable: the row is the track, not the file', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s.fake.project_path = H.join(host.tmpdir(), 'Book2.rpp')
  s:send('solo_restore', 'r1')
  H.eq(s:events()[2], { 'SOLO_RESTORED', 'r1', '1', '0', '0' })
end)

H.test('the ledger holds at most 64 rows and drops the oldest', function()
  local s = new_session()
  local lines = {}
  for index = 1, 70 do
    lines[#lines + 1] = string.format('{FFFFFFFF-0000-4000-8000-%012X}\t0\n', index)
  end
  H.write_file(s:path(LEDGER), table.concat(lines))
  s:tick()
  local kept = H.lines(ledger(s))
  H.eq(#kept, 64)
  H.eq(kept[1], string.format('{FFFFFFFF-0000-4000-8000-%012X}\t0', 7), 'the six oldest are gone')
end)

H.test('the chapter is not soloed when the ledger that puts it back cannot be written', function()
  local s, t = new_session()
  host.makedirs(s:path(LEDGER))
  s:send('solo_chapter', 'c1', t.ch1.guid)
  H.eq(
    s:events(),
    { { 'ERROR', 'c1', "The chapter's track could not be soloed because REAPER's resource folder is not writable, so the other chapters stay as they were." } }
  )
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
  s:send('solo_restore', 'r1')
  H.eq(s:events(), { { 'SOLO_RESTORED', 'r1', '0', '0', '0' } })
end)

H.test('a chapter already on the ledger is soloed again when the ledger cannot be rewritten', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  os.remove(s:path(LEDGER))
  host.makedirs(s:path(LEDGER))
  t.ch1.solo = 0
  s:send('solo_chapter', 'c2', t.ch1.guid)
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 })
end)

-- A row for a track of another project stays on the ledger; when its file cannot be written the bridge tries again on the ticks that follow. The
-- write is refused by io.open itself (a directory cannot be removed the same way on every system): `blocked.on` says whether it is, `blocked.tries` counts.
local function unwritable_with_a_ghost()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  local blocked = { on = true, tries = 0 }
  local real_open = io.open
  io.open = function(path, mode, ...)
    if blocked.on and tostring(path):find(LEDGER, 1, true) and (mode or 'r'):find('w', 1, true) then
      blocked.tries = blocked.tries + 1
      return nil, 'blocked'
    end
    return real_open(path, mode, ...)
  end
  s.fake.tracks = {}
  s:send('solo_restore', 'r1')
  return s, t, blocked, function()
    io.open = real_open
  end
end

H.test('a ledger that could not be written is written again on a later tick', function()
  local s, t, blocked, undo = unwritable_with_a_ghost()
  blocked.on = false
  for _ = 1, 8 do
    s:tick()
  end
  undo()
  H.eq(ledger(s), row(t.ch1))
end)

H.test('a ledger that stays unwritable is not opened on every tick', function()
  local s, _, blocked, undo = unwritable_with_a_ghost()
  local before = blocked.tries
  for _ = 1, 40 do
    s:tick()
  end
  undo()
  H.truthy(blocked.tries - before < 12, 'the retries are spaced out by a count of ticks, got ' .. (blocked.tries - before))
  H.truthy(blocked.tries - before > 0, 'it is still tried')
end)

-- a chapter that cannot be soloed ------------------------------------------------------------------------------------

H.test('a stale chapter answers TRACK_STALE and puts the chapter soloed before back', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s:events()
  s:send('solo_chapter', 'c2', '{00000000-0000-4000-8000-00000000DEAD}')
  H.eq(s:events(), { { 'TRACK_STALE', 'c2', '{00000000-0000-4000-8000-00000000DEAD}' } })
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 }, 'the other chapters are not left quiet for a chapter that cannot be soloed')
  H.eq(ledger(s), nil)
end)

H.test('a stale answer drops the chapter that waits for the take, so the previous one is not soloed after it', function()
  local s, t = new_session()
  s.fake.play_state = 5
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s:send('solo_chapter', 'c2', '{00000000-0000-4000-8000-00000000DEAD}')
  s.fake.play_state = 0
  s:tick()
  s:tick()
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), nil)
end)

-- an unwritable ledger ---------------------------------------------------------------------------------------------

H.test('a solo that waited for the take and could not write its ledger stays pending and is soloed once the ledger can be written', function()
  local s, t = new_session()
  s.fake.play_state = 5
  s:send('solo_chapter', 'c1', t.ch1.guid)
  host.makedirs(s:path(LEDGER))
  s.fake.play_state = 0
  s:tick()
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 }, 'nothing is soloed without its ledger')
  os.remove(s:path(LEDGER))
  for _ = 1, 8 do
    s:tick()
  end
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), row(t.ch1))
end)

H.test('a ledger that still lists a chapter put back is not reported as removed, and is removed on a later tick', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  os.remove(s:path(LEDGER))
  host.makedirs(H.join(s:path(LEDGER), 'held'))
  s:send('solo_restore', 'r1')
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
  H.truthy(host.listdir(s:path(LEDGER)), 'the file that cannot be removed is still there')
  os.remove(H.join(s:path(LEDGER), 'held'))
  for _ = 1, 8 do
    s:tick()
  end
  H.eq(io.open(s:path(LEDGER), 'r'), nil, 'the retry removed it')
end)

-- the project in front changes while a chapter is soloed ---------------------------------------------------------

H.test('a chapter soloed in a project that is switched away from becomes a ghost on a tick, and is put back when that project returns', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  local tracks, book = s.fake.tracks, s.fake.project_path
  s.fake.tracks, s.fake.project_path = {}, '/elsewhere/Other.rpp'
  s:tick()
  H.eq(ledger(s), row(t.ch1), 'the row stays on the ledger')
  s.fake.tracks, s.fake.project_path = tracks, book
  s:tick()
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 }, 'put back without a restore command')
  H.eq(ledger(s), nil)
end)

H.test('a Save as while soloed keeps the chapter soloed: the tick does not move its row away', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  s.fake.project_path = H.join(host.tmpdir(), 'Book2.rpp')
  s:tick()
  s:tick()
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), row(t.ch1))
end)

H.test('a chapter that is a ghost and is entered again is the live row, and the tick does not put it back', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  local tracks, book = s.fake.tracks, s.fake.project_path
  s.fake.tracks, s.fake.project_path = {}, '/elsewhere/Other.rpp'
  s:send('solo_restore', 'r1')
  s.fake.tracks, s.fake.project_path = tracks, book
  s:send('solo_chapter', 'c2', t.ch1.guid)
  s:tick()
  s:tick()
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 }, 'the chapter stays soloed')
  H.eq(ledger(s), row(t.ch1), 'one row')
end)

-- a project saved while a chapter is soloed ----------------------------------------------------------------------

H.test('save_project writes the project with the chapter put back and soloes it again, so the file never holds the solo', function()
  local s, t = new_session()
  s:send('solo_chapter', 'c1', t.ch1.guid)
  local on_disk
  local real = reaper.Main_SaveProject
  reaper.Main_SaveProject = function(...)
    on_disk = solos(s)
    return real(...)
  end
  s:send('save_project', 's1', s.fake.project_path)
  reaper.Main_SaveProject = real
  H.eq(on_disk, { 0, 0, 0, 0, 0, 0 }, 'the solo is not in the file')
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 }, 'it is back after the save')
  H.eq(ledger(s), row(t.ch1), 'the row stays on the ledger throughout')
  H.eq(s:events()[2][1], 'SAVED')
end)

H.test('save_project with nothing soloed by this bridge writes nothing to any track', function()
  local s, t = new_session()
  t.ch1.solo = 2
  s.fake.calls = {}
  s:send('save_project', 's1', s.fake.project_path)
  H.eq(writes(s), {})
  H.eq(solos(s), { 2, 0, 0, 0, 0, 0 })
end)

H.test(
  "a project saved while soloed without the bridge (the narrator's own save) reopens soloed, and that solo is read as the narrator's own: the limit",
  function()
    local s, t = new_session()
    s:send('solo_chapter', 'c1', t.ch1.guid)
    s:send('solo_restore', 'r1')
    t.ch1.solo = 2
    s:events()
    s:send('solo_chapter', 'c2', t.ch1.guid)
    H.eq(s:events(), { { 'CHAPTER_SOLOED', 'c2', t.ch1.guid, '0', '0' } })
    H.eq(ledger(s), nil, 'no row: it is never put back')
  end
)

-- a play's isolation left while another project was in front ---------------------------------------------------

H.test('a play isolation whose project was not in front at the first command is put back before the next solo is written', function()
  local s0, t0 = new_session()
  with_audio(s0, t0)
  t0.ch1.solo = 1
  s0:send('play_from', 'p1', '10', t0.ch2.guid)
  local play_file = H.read_file(s0:path('narration_play_isolation.txt'))
  H.truthy(play_file, 'the play wrote its isolation file')
  -- Another bridge start, the same tracks as the play left them (the narrator's solo on Chapter 1 turned off by it); another project is in front first.
  local s, t = new_session()
  with_audio(s, t)
  t.ch2.solo = 2
  H.write_file(s:path('narration_play_isolation.txt'), play_file)
  local tracks = s.fake.tracks
  s.fake.tracks = {}
  s:send('solo_restore', 'r1')
  s.fake.tracks = tracks
  H.eq(solos(s), { 0, 0, 0, 2, 0, 0 }, 'not put back yet: its project was not in front')
  s:send('solo_chapter', 'c1', t.ch1.guid)
  H.eq(s:events()[2], { 'CHAPTER_SOLOED', 'c1', t.ch1.guid, '0', '0' }, "the narrator's own solo is found, so it is neither changed nor taken over")
  H.eq(solos(s), { 1, 0, 0, 0, 0, 0 })
  H.eq(ledger(s), nil)
end)

-- a write or a close of the ledger that fails after the file opened -----------------------------------------------

local function with_failing_handle(fails, body)
  local real_open = io.open
  io.open = function(path, mode, ...)
    if tostring(path):find(LEDGER, 1, true) and (mode or 'r'):find('w', 1, true) then
      return {
        write = function(self)
          if fails == 'write' then
            return nil, 'disk full'
          end
          return self
        end,
        close = function()
          if fails == 'close' then
            return nil, 'disk full'
          end
          return true
        end,
      }
    end
    return real_open(path, mode, ...)
  end
  local ok, err = pcall(body)
  io.open = real_open
  if not ok then
    error(err, 0)
  end
end

H.test('a ledger whose write fails after it opened is not reported as written: nothing is soloed', function()
  local s, t = new_session()
  with_failing_handle('write', function()
    s:send('solo_chapter', 'c1', t.ch1.guid)
  end)
  H.eq(s:events()[1][1], 'ERROR')
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
end)

H.test('a ledger whose close fails after it opened is not reported as written: nothing is soloed', function()
  local s, t = new_session()
  with_failing_handle('close', function()
    s:send('solo_chapter', 'c1', t.ch1.guid)
  end)
  H.eq(s:events()[1][1], 'ERROR')
  H.eq(solos(s), { 0, 0, 0, 0, 0, 0 })
end)

H.test('solo_restore also puts back a play isolation whose project was not in front earlier', function()
  local s0, t0 = new_session()
  with_audio(s0, t0)
  t0.pickups.solo = 1
  s0:send('play_from', 'p1', '10', t0.ch2.guid)
  local play_file = H.read_file(s0:path('narration_play_isolation.txt'))
  local s, t = new_session()
  with_audio(s, t)
  t.ch2.solo, t.pickups.solo = 2, 0
  H.write_file(s:path('narration_play_isolation.txt'), play_file)
  local tracks = s.fake.tracks
  s.fake.tracks = {}
  s:send('solo_restore', 'r1')
  s.fake.tracks = tracks
  s:send('solo_restore', 'r2')
  H.eq(solos(s), { 0, 0, 0, 0, 0, 1 })
end)
