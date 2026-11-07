-- Voice sample regions: keep_voice_sample and read_voice_samples (narration_voice_sample_region.lua). A sample kept in the
-- DAW is a region named for the character and label; the host adds it, moves it and reads it back. Phase 6 of
-- docs/prds/character-voice-samples.prd.md. What the fake cannot prove (the saved .rpp, a region when its item moves) is
-- in docs/research/reaper-voice-sample-region-check.md.

local H = require('harness')

local PREFIX = 'Voice sample: '

local function new_session()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  s.fake:add_track('Narrator')
  return s
end

local function regions(s)
  local out = {}
  for _, marker in ipairs(s.fake.markers) do
    if marker.is_region then
      out[#out + 1] = { marker.index, marker.pos, marker.rgnend, marker.name }
    end
  end
  return out
end

H.test('keep_voice_sample needs AddProjectMarker2 and SetProjectMarker4', function()
  for _, name in ipairs({ 'AddProjectMarker2', 'SetProjectMarker4' }) do
    local s = new_session()
    s.fake:remove_api(name)
    s:send('keep_voice_sample', 'k1', '', '1', '4', PREFIX .. 'Hatter - angry')
    H.eq(s:events(), { { 'ERROR', 'k1', 'This REAPER version cannot keep a voice sample as a region.' } }, name)
  end
end)

H.test('keep_voice_sample adds one region named for the character and label, in one undo point', function()
  local s = new_session()
  s:send('keep_voice_sample', 'k1', '', '12.5', '19.25', PREFIX .. 'Hatter - angry, to the Duke')
  H.eq(s:events(), { { 'VOICE_SAMPLE_KEPT', 'k1', '1', 'created' } })
  H.eq(regions(s), { { 1, 12.5, 19.25, PREFIX .. 'Hatter - angry, to the Duke' } })
  H.eq(s.fake:undo_labels(), { H.brand.name .. ': keep voice sample' })
end)

H.test('keep_voice_sample keeps a pipe, a percent sign and non-ASCII text in the name whole', function()
  local s = new_session()
  local name = PREFIX .. 'Zoë | 100% sure - "why?"'
  s:send('keep_voice_sample', 'k1', '', '1', '2', name)
  H.eq(s.fake.markers[1].name, name)
end)

H.test('keep_voice_sample is idempotent: the same name and bounds within 0.01 s answers existing and makes no undo point', function()
  local s = new_session()
  s:send('keep_voice_sample', 'k1', '', '12.5', '19.25', PREFIX .. 'Hatter - angry')
  s:events()
  s:send('keep_voice_sample', 'k2', '', '12.505', '19.255', PREFIX .. 'Hatter - angry')
  H.eq(s:events(), { { 'VOICE_SAMPLE_KEPT', 'k2', '1', 'existing' } })
  H.eq(#s.fake.markers, 1)
  H.eq(#s.fake.undo, 1)
end)

H.test('keep_voice_sample adds a second region for the same label at other bounds', function()
  local s = new_session()
  s:send('keep_voice_sample', 'k1', '', '1', '2', PREFIX .. 'Hatter - angry')
  s:send('keep_voice_sample', 'k2', '', '5', '6', PREFIX .. 'Hatter - angry')
  H.eq(s:events()[2], { 'VOICE_SAMPLE_KEPT', 'k2', '2', 'created' })
end)

H.test('keep_voice_sample refuses a range or name REAPER would take wrongly, and changes nothing', function()
  local s = new_session()
  for _, case in ipairs({ { '-1', '2', 'x' }, { '5', '5', 'x' }, { '6', '5', 'x' }, { 'nan', '5', 'x' }, { '1', '2', '  ' }, { '1', '2', '' } }) do
    s:send('keep_voice_sample', 'k1', '', case[1], case[2], case[3])
    H.eq(s:events(), { { 'ERROR', 'k1', 'The voice sample range or name is not valid.' } }, table.concat(case, ','))
  end
  H.eq(#s.fake.markers, 0)
  H.eq(#s.fake.undo, 0)
end)

H.test('keep_voice_sample refuses while REAPER records', function()
  local s = new_session()
  s.fake.play_state = 5
  s:send('keep_voice_sample', 'k1', '', '1', '2', PREFIX .. 'Hatter - angry')
  H.eq(s:events(), { { 'ERROR', 'k1', 'REAPER is recording. Stop recording first.' } })
  H.eq(#s.fake.markers, 0)
end)

H.test('keep_voice_sample reports a region REAPER refuses to add as an error and adds none', function()
  local s = new_session()
  s.fake.add_marker_fails = true
  s:send('keep_voice_sample', 'k1', '', '1', '2', PREFIX .. 'Hatter - angry')
  H.eq(s:events(), { { 'ERROR', 'k1', 'REAPER could not add the region.' } })
  H.eq(#s.fake.markers, 0)
end)

H.test('keep_voice_sample with a number moves and renames that sample region, keeping its colour, in one more undo point', function()
  local s = new_session()
  s:send('keep_voice_sample', 'k1', '', '40', '45', PREFIX .. 'Hatter - angry')
  s:events()
  s.fake.markers[1].color = 12345
  s:send('keep_voice_sample', 'k2', '1', '41', '46.5', PREFIX .. 'Hatter - furious')
  H.eq(s:events(), { { 'VOICE_SAMPLE_KEPT', 'k2', '1', 'moved' } })
  H.eq(regions(s), { { 1, 41, 46.5, PREFIX .. 'Hatter - furious' } })
  H.eq(s.fake.markers[1].color, 12345)
  H.eq(s.fake:undo_labels(), { H.brand.name .. ': keep voice sample', H.brand.name .. ': move voice sample' })
end)

H.test('keep_voice_sample with a number never moves a region that is not a voice sample', function()
  local s = new_session()
  s.fake:add_region(0, 30, 'Chapter 1')
  s:send('keep_voice_sample', 'k1', '1', '41', '46.5', PREFIX .. 'Hatter - furious')
  H.eq(s:events(), { { 'VOICE_SAMPLE_STALE', 'k1', '1' } })
  H.eq(regions(s), { { 1, 0, 30, 'Chapter 1' } })
  H.eq(#s.fake.undo, 0)
end)

H.test('keep_voice_sample with a number is unchanged, with no undo point, when the region already matches', function()
  local s = new_session()
  s:send('keep_voice_sample', 'k1', '', '40', '45', PREFIX .. 'Hatter - angry')
  s:events()
  s:send('keep_voice_sample', 'k2', '1', '40', '45', PREFIX .. 'Hatter - angry')
  H.eq(s:events(), { { 'VOICE_SAMPLE_KEPT', 'k2', '1', 'unchanged' } })
  H.eq(#s.fake.undo, 1)
end)

H.test('keep_voice_sample with a number the project no longer has answers stale and changes nothing', function()
  local s = new_session()
  s:send('keep_voice_sample', 'k1', '9', '1', '2', PREFIX .. 'Hatter - angry')
  H.eq(s:events(), { { 'VOICE_SAMPLE_STALE', 'k1', '9' } })
  H.eq(#s.fake.markers, 0)
  H.eq(#s.fake.undo, 0)
end)

H.test('keep_voice_sample does not move a plain marker that shares the number', function()
  local s = new_session()
  s.fake:insert_marker({ is_region = false, pos = 3, rgnend = 0, name = PREFIX .. 'Hatter - angry', color = 0 })
  s:send('keep_voice_sample', 'k1', '1', '1', '2', PREFIX .. 'Hatter - angry')
  H.eq(s:events(), { { 'VOICE_SAMPLE_STALE', 'k1', '1' } })
  H.eq(s.fake.markers[1].pos, 3)
end)

H.test('read_voice_samples lists the regions whose name starts with the prefix, in project order, and ends with the count and change count', function()
  local s = new_session()
  s.fake:add_region(0, 30, 'Chapter 1')
  s:send('keep_voice_sample', 'k1', '', '50', '55', PREFIX .. 'Alice - calm')
  s:send('keep_voice_sample', 'k2', '', '40', '45', PREFIX .. 'Hatter | angry')
  s.fake:insert_marker({ is_region = false, pos = 41, rgnend = 0, name = PREFIX .. 'a marker, not a region', color = 0 })
  s:events()
  local undo_points = #s.fake.undo
  s:send('read_voice_samples', 'r1', PREFIX)
  local events = s:events()
  local count = events[#events][4]
  H.eq(events, {
    { 'VOICE_SAMPLE_REGION', 'r1', '3', '40.000000', '45.000000', PREFIX .. 'Hatter | angry' },
    { 'VOICE_SAMPLE_REGION', 'r1', '2', '50.000000', '55.000000', PREFIX .. 'Alice - calm' },
    { 'VOICE_SAMPLES_READ', 'r1', '2', count },
  })
  H.eq(#s.fake.undo, undo_points, 'reading adds no undo point')
end)

H.test('read_voice_samples with nothing kept answers a count of 0', function()
  local s = new_session()
  s:send('read_voice_samples', 'r1', PREFIX)
  local events = s:events()
  H.eq(#events, 1)
  H.eq({ events[1][1], events[1][2], events[1][3] }, { 'VOICE_SAMPLES_READ', 'r1', '0' })
end)

H.test('read_voice_samples refuses an empty prefix, which would list every region', function()
  local s = new_session()
  s.fake:add_region(0, 30, 'Chapter 1')
  s:send('read_voice_samples', 'r1', '')
  H.eq(s:events(), { { 'ERROR', 'r1', 'The voice sample prefix is missing.' } })
end)

H.test('read_voice_samples reads a prefix with pattern characters literally and stops at 500 regions', function()
  local s = new_session()
  s.fake:add_region(0, 1, 'Voice (sample): x')
  s.fake:add_region(1, 2, 'Voice sample: y')
  s:send('read_voice_samples', 'r1', 'Voice (sample): ')
  H.eq(s:events()[1][6], 'Voice (sample): x')
  for i = 1, 520 do
    s.fake:add_region(10 + i, 10.5 + i, PREFIX .. i)
  end
  s:send('read_voice_samples', 'r2', PREFIX)
  local events = s:events()
  H.eq(#events, 501)
  H.eq({ events[501][1], events[501][2], events[501][3] }, { 'VOICE_SAMPLES_READ', 'r2', '500' })
end)

-- delete_voice_sample_region <run> <number>: removes the region a number names, only when its name starts with the prefix, so a removed
-- sample takes its region with it and a stale number can never delete a chapter region (docs issue 3122).

H.test('delete_voice_sample_region needs DeleteProjectMarker', function()
  local s = new_session()
  s.fake:remove_api('DeleteProjectMarker')
  s:send('delete_voice_sample_region', 'd1', '1')
  H.eq(s:events(), { { 'ERROR', 'd1', 'This REAPER version cannot remove a voice sample region.' } })
end)

H.test('delete_voice_sample_region removes the sample region it names, in one undo point, and leaves the others', function()
  local s = new_session()
  s.fake:add_region(0, 30, 'Chapter 1')
  s:send('keep_voice_sample', 'k1', '', '40', '45', PREFIX .. 'Hatter - angry')
  s:send('keep_voice_sample', 'k2', '', '50', '55', PREFIX .. 'Alice - calm')
  s:events()
  local before = #s.fake.undo
  s:send('delete_voice_sample_region', 'd1', '2')
  H.eq(s:events(), { { 'VOICE_SAMPLE_REMOVED', 'd1', '2', 'deleted' } })
  H.eq(regions(s), { { 1, 0, 30, 'Chapter 1' }, { 3, 50, 55, PREFIX .. 'Alice - calm' } })
  H.eq(#s.fake.undo, before + 1)
  H.eq(s.fake:undo_labels()[before + 1], H.brand.name .. ': delete voice sample')
end)

H.test('delete_voice_sample_region is idempotent: a number the project no longer has is unchanged, with no undo point', function()
  local s = new_session()
  s:send('keep_voice_sample', 'k1', '', '40', '45', PREFIX .. 'Hatter - angry')
  s:events()
  local before = #s.fake.undo
  s:send('delete_voice_sample_region', 'd1', '9')
  H.eq(s:events(), { { 'VOICE_SAMPLE_REMOVED', 'd1', '9', 'unchanged' } })
  s:send('delete_voice_sample_region', 'd2', '1')
  s:send('delete_voice_sample_region', 'd3', '1')
  local events = s:events()
  H.eq(events, { { 'VOICE_SAMPLE_REMOVED', 'd2', '1', 'deleted' }, { 'VOICE_SAMPLE_REMOVED', 'd3', '1', 'unchanged' } })
  H.eq(#s.fake.undo, before + 1)
end)

H.test('delete_voice_sample_region never removes a region that is not a voice sample, and answers stale', function()
  local s = new_session()
  s.fake:add_region(0, 30, 'Chapter 1')
  s:send('delete_voice_sample_region', 'd1', '1')
  H.eq(s:events(), { { 'VOICE_SAMPLE_STALE', 'd1', '1' } })
  H.eq(regions(s), { { 1, 0, 30, 'Chapter 1' } })
  H.eq(#s.fake.undo, 0)
end)

H.test('delete_voice_sample_region does not remove a plain marker that shares the number and the prefix', function()
  local s = new_session()
  s.fake:insert_marker({ is_region = false, pos = 3, rgnend = 0, name = PREFIX .. 'Hatter - angry', color = 0 })
  s:send('delete_voice_sample_region', 'd1', '1')
  H.eq(s:events(), { { 'VOICE_SAMPLE_REMOVED', 'd1', '1', 'unchanged' } })
  H.eq(#s.fake.markers, 1)
  H.eq(#s.fake.undo, 0)
end)

H.test('delete_voice_sample_region refuses a number that is not a positive whole number, and changes nothing', function()
  local s = new_session()
  s:send('keep_voice_sample', 'k1', '', '40', '45', PREFIX .. 'Hatter - angry')
  s:events()
  for _, number in ipairs({ '', '0', '-1', '1.5', 'x', 'nan', 'inf' }) do
    s:send('delete_voice_sample_region', 'd1', number)
    H.eq(s:events(), { { 'ERROR', 'd1', 'The voice sample region number is not valid.' } }, number)
  end
  H.eq(#s.fake.markers, 1)
end)

H.test('delete_voice_sample_region refuses while REAPER records, and removes nothing', function()
  local s = new_session()
  s:send('keep_voice_sample', 'k1', '', '40', '45', PREFIX .. 'Hatter - angry')
  s:events()
  s.fake.play_state = 5
  s:send('delete_voice_sample_region', 'd1', '1')
  H.eq(s:events(), { { 'ERROR', 'd1', 'REAPER is recording. Stop recording first.' } })
  H.eq(#s.fake.markers, 1)
end)

H.test('delete_voice_sample_region reports a region REAPER refuses to delete as an error', function()
  local s = new_session()
  s:send('keep_voice_sample', 'k1', '', '40', '45', PREFIX .. 'Hatter - angry')
  s:events()
  s.fake.delete_marker_fails = true
  s:send('delete_voice_sample_region', 'd1', '1')
  H.eq(s:events(), { { 'ERROR', 'd1', 'REAPER could not delete the region.' } })
  H.eq(#s.fake.markers, 1)
end)
