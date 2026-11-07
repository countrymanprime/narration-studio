-- The mastering port's DAW row: master_chain_read and render_with_fx
-- (narration_master_render.lua). master_chain_read lists the FX a render runs and changes nothing. render_with_fx is the
-- bridge's one render: it renders named regions through the project's track and master FX, only with an approval the host
-- was just given (used once), only into an empty folder the app made inside the project, never over a file, and puts the
-- narrator's render settings back afterwards. What REAPER itself does with the settings (tails, sample rate, what
-- RENDER_TARGETS answers for custom bounds) is the owner's scripted pass on #510, not this file.

local H = require('harness')

local APPROVAL = '0123456789abcdef0123456789abcdef'
local OTHER_APPROVAL = 'fedcba9876543210fedcba9876543210'
local SEP = package.config:sub(1, 1)

local function new_session()
  return H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
end

-- A project folder with the app's run folder made in it, the way the daw row makes it before it asks for a render.
local function run_folder(s, name)
  local project = s:path('Book')
  local folder = H.join(H.join(H.join(project, H.brand.identity.projectFolder), 'mastering'), name or 'run1')
  host.makedirs(folder)
  return folder, project
end

local function rendered(s)
  return s.fake.renders or {}
end

local function render_triggers(s)
  local count = 0
  for _, call in ipairs(s.fake.calls) do
    if call.name == 'Main_OnCommand' then
      count = count + 1
    end
  end
  return count
end

-- The narrator's own render settings before the command, so a test can check they are back afterwards.
local function narrator_settings(s)
  s.fake.render_info_string['RENDER_FILE'] = 'C:/Renders'
  s.fake.render_info_string['RENDER_PATTERN'] = '$region'
  s.fake.render_info['RENDER_BOUNDSFLAG'] = 3
  s.fake.render_info['RENDER_STARTPOS'] = 1
  s.fake.render_info['RENDER_ENDPOS'] = 2
  s.fake.render_info['RENDER_SETTINGS'] = 3
  s.fake.render_info['RENDER_ADDTOPROJ'] = 1
end

local function settings_are_the_narrators(s)
  H.eq({
    s.fake.render_info_string['RENDER_FILE'],
    s.fake.render_info_string['RENDER_PATTERN'],
    s.fake.render_info['RENDER_BOUNDSFLAG'],
    s.fake.render_info['RENDER_STARTPOS'],
    s.fake.render_info['RENDER_ENDPOS'],
    s.fake.render_info['RENDER_SETTINGS'],
    s.fake.render_info['RENDER_ADDTOPROJ'],
  }, { 'C:/Renders', '$region', 3, 1, 2, 3, 1 }, "the narrator's render settings are put back")
end

local function slash(path)
  return (path:gsub('\\', '/'))
end

-- master_chain_read ------------------------------------------------------------------------------------------------

-- The fingerprints below were computed outside Lua (scratch Python mirroring the algorithm): "<count>:<a>:<b>", two polynomial
-- hashes over each value's token and a ';'. A token is the value to six decimals ('%.6f', -0 as 0), or 'nan', 'inf', '-inf', or
-- 'n' for a missing or non-number answer, so no two of those collide and a large value never wraps. An FX's is over its offline
-- state and then its normalized parameters; a track's mix is over D_VOL, D_PAN, B_PHASE, B_MAINSEND, I_FOLDERDEPTH, I_FXEN,
-- I_PANMODE, D_PANLAW, D_WIDTH, D_DUALPANL, D_DUALPANR and I_NCHAN, then its sends and its receives, each with mute, phase,
-- mono, volume, pan, mode and channels (#2995). The literals pin the algorithm, so a change to it is a change the host's digest
-- sees.
local NO_PARAMS = '1:912281302:1180657038' -- online, no parameters
local EQ_PARAMS = '3:45416079:345875843' -- online, { 0.5, 0.25 }
local EQ_PARAMS_MOVED = '3:2117683731:1362960462' -- online, { 0.5, 0.26 }
local EQ_OFFLINE = '3:1076015632:1492863399' -- offline, { 0.5, 0.25 }
local DEFAULT_MIX = '14:901518076:553555570' -- unity, centre, the default pan mode and law, stereo, FX on, no sends or receives
local QUIETER_MIX = '14:424772828:127370515' -- the same at half volume
local FX_OFF_MIX = '14:888714186:288596514' -- the default with the track's FX chain switched off (I_FXEN 0)
local SENDING_MIX = '22:955495191:887128309' -- the default, with one send at unity
local RECEIVING_MIX = '22:974159987:443539302' -- the default, with that send as its one receive
local NIL_MAINSEND_MIX = '14:1787110357:1166252907' -- the default, with B_MAINSEND answering nil
-- 2147.483647 is the old modulo's period: it must not collide with 0, nor NaN with 2147.483646 (lua review, L3).
local COLLIDING = {
  { 0 / 0, '2:1691458664:1638330890' },
  { 2147.483646, '2:1010942015:325426705' },
  { 0.0, '2:1123506415:976916890' },
  { 2147.483647, '2:1010942146:325426842' },
  { math.huge, '2:1680440254:1625717026' },
  { -math.huge, '2:593117722:1858032743' },
}

H.test('master_chain_read lists every track and then the master, each with its mute, solo and mix, and each slot with its parameters', function()
  local s = new_session()
  local voice = s.fake:add_track('Voice')
  voice.fx = { { name = 'VST: ReaEQ (Cockos)', params = { 0.5, 0.25 } }, { name = 'VST: ReaComp (Cockos)', enabled = false } }
  local room = s.fake:add_track('Room tone')
  s.fake.master.fx = { { name = 'VST: ReaLimit (Cockos)' } }
  s:send('master_chain_read', 'c1')
  H.eq(s:events(), {
    { 'MASTER_CHAIN_TRACK', 'c1', voice.guid, 'Voice', '0', '0', DEFAULT_MIX },
    { 'MASTER_CHAIN_FX', 'c1', voice.guid, 'Voice', 'VST: ReaEQ (Cockos)', '1', EQ_PARAMS },
    { 'MASTER_CHAIN_FX', 'c1', voice.guid, 'Voice', 'VST: ReaComp (Cockos)', '0', NO_PARAMS },
    { 'MASTER_CHAIN_TRACK', 'c1', room.guid, 'Room tone', '0', '0', DEFAULT_MIX },
    { 'MASTER_CHAIN_TRACK', 'c1', 'master', 'MASTER', '0', '0', DEFAULT_MIX },
    { 'MASTER_CHAIN_FX', 'c1', 'master', 'MASTER', 'VST: ReaLimit (Cockos)', '1', NO_PARAMS },
    { 'MASTER_CHAIN_READ', 'c1', '3', '0', '3' },
  })
end)

H.test('master_chain_read lists the tracks and the master of a project with no FX', function()
  local s = new_session()
  local voice = s.fake:add_track('Voice')
  s:send('master_chain_read', 'c1')
  H.eq(s:events(), {
    { 'MASTER_CHAIN_TRACK', 'c1', voice.guid, 'Voice', '0', '0', DEFAULT_MIX },
    { 'MASTER_CHAIN_TRACK', 'c1', 'master', 'MASTER', '0', '0', DEFAULT_MIX },
    { 'MASTER_CHAIN_READ', 'c1', '0', '0', '2' },
  })
end)

local function line(events, tag, guid, name)
  for _, event in ipairs(events) do
    if event[1] == tag and event[3] == guid and (name == nil or event[5] == name) then
      return event
    end
  end
end

H.test('master_chain_read answers the same parameters twice, and other ones once one parameter moves', function()
  local s = new_session()
  local voice = s.fake:add_track('Voice')
  voice.fx = { { name = 'VST: ReaEQ (Cockos)', params = { 0.5, 0.25 } } }
  s:send('master_chain_read', 'c1')
  s:send('master_chain_read', 'c2')
  voice.fx[1].params[2] = 0.26
  s:send('master_chain_read', 'c3')
  local by_run = {}
  for _, event in ipairs(s:events()) do
    if event[1] == 'MASTER_CHAIN_FX' then
      by_run[event[2]] = event[7]
    end
  end
  H.eq(by_run, { c1 = EQ_PARAMS, c2 = EQ_PARAMS, c3 = EQ_PARAMS_MOVED })
end)

H.test("master_chain_read folds an FX's offline state into its parameters", function()
  local s = new_session()
  local voice = s.fake:add_track('Voice')
  voice.fx = { { name = 'VST: ReaEQ (Cockos)', params = { 0.5, 0.25 }, offline = true } }
  s:send('master_chain_read', 'c1')
  H.eq(line(s:events(), 'MASTER_CHAIN_FX', voice.guid)[7], EQ_OFFLINE)
end)

H.test("master_chain_read answers each track's mute and solo, and its mix moves with its volume and its FX switch", function()
  local s = new_session()
  local voice = s.fake:add_track('Voice')
  voice.muted = true
  voice.solo = 2
  local quiet = s.fake:add_track('Quiet')
  quiet.volume = 0.5
  local bypassed = s.fake:add_track('Bypassed')
  bypassed.fx_enabled = false
  s:send('master_chain_read', 'c1')
  local events = s:events()
  H.eq(line(events, 'MASTER_CHAIN_TRACK', voice.guid), { 'MASTER_CHAIN_TRACK', 'c1', voice.guid, 'Voice', '1', '2', DEFAULT_MIX })
  H.eq(line(events, 'MASTER_CHAIN_TRACK', quiet.guid), { 'MASTER_CHAIN_TRACK', 'c1', quiet.guid, 'Quiet', '0', '0', QUIETER_MIX })
  H.eq(line(events, 'MASTER_CHAIN_TRACK', bypassed.guid)[7], FX_OFF_MIX, "the track's whole FX chain switched off")
end)

H.test('master_chain_read moves a mix with each value it binds', function()
  local defaults = {}
  for _, key in ipairs({
    'D_VOL',
    'D_PAN',
    'B_PHASE',
    'B_MAINSEND',
    'I_FOLDERDEPTH',
    'I_FXEN',
    'I_PANMODE',
    'D_PANLAW',
    'D_WIDTH',
    'D_DUALPANL',
    'D_DUALPANR',
    'I_NCHAN',
  }) do
    local s = new_session()
    local voice = s.fake:add_track('Voice')
    voice.values = { [key] = 0.75 }
    s:send('master_chain_read', 'c1')
    local mix = line(s:events(), 'MASTER_CHAIN_TRACK', voice.guid)[7]
    H.truthy(mix ~= DEFAULT_MIX, key .. ' is bound')
    H.truthy(defaults[mix] == nil, key .. ' moves the mix differently from ' .. tostring(defaults[mix]))
    defaults[mix] = key
  end
end)

H.test('master_chain_read folds a send into the mix of the track that sends it and of the track that receives it', function()
  local s = new_session()
  local voice = s.fake:add_track('Voice')
  local bus = s.fake:add_track('Reverb bus')
  s.fake:add_send(voice, bus)
  s:send('master_chain_read', 'c1')
  local events = s:events()
  H.eq(line(events, 'MASTER_CHAIN_TRACK', voice.guid)[7], SENDING_MIX)
  H.eq(line(events, 'MASTER_CHAIN_TRACK', bus.guid)[7], RECEIVING_MIX)
end)

H.test('master_chain_read gives NaN, the infinities and values a modulo would wrap fingerprints of their own', function()
  for _, case in ipairs(COLLIDING) do
    local s = new_session()
    local voice = s.fake:add_track('Voice')
    voice.fx = { { name = 'JS: Odd', params = { case[1] } } }
    s:send('master_chain_read', 'c1')
    H.eq(line(s:events(), 'MASTER_CHAIN_FX', voice.guid)[7], case[2], tostring(case[1]))
  end
end)

H.test('master_chain_read reads a value REAPER answers as nil without failing', function()
  local s = new_session()
  s.fake.master.values = { B_MAINSEND = 'nil' }
  s:send('master_chain_read', 'c1')
  local events = s:events()
  H.eq(line(events, 'MASTER_CHAIN_TRACK', 'master')[7], NIL_MAINSEND_MIX)
  H.eq(events[#events], { 'MASTER_CHAIN_READ', 'c1', '0', '0', '1' })
end)

H.test('master_chain_read reads and changes nothing', function()
  local s = new_session()
  local voice = s.fake:add_track('Voice')
  voice.fx = { { name = 'VST: ReaEQ (Cockos)', params = { 0.5 } } }
  s.fake:add_send(voice, s.fake:add_track('Bus'))
  s:send('master_chain_read', 'c1')
  H.eq(#s.fake.undo, 0, 'no undo point')
  H.eq(render_triggers(s), 0, 'no action run')
  for _, call in ipairs(s.fake.calls) do
    H.truthy(not call.set, 'no project setting written: ' .. tostring(call.key))
    H.truthy(call.name ~= 'TrackFX_AddByName', 'no FX added')
    H.truthy(call.name ~= 'SetMediaTrackInfo_Value', 'no track value written: ' .. tostring(call.key))
    H.truthy(call.name ~= 'SetTrackSendInfo_Value', 'no send written')
  end
  H.eq(#voice.fx, 1)
  H.eq(voice.fx[1].params, { 0.5 })
end)

H.test('master_chain_read stops listing FX at its cap and says the list was cut short', function()
  local s = new_session()
  local voice = s.fake:add_track('Voice')
  voice.fx = {}
  for index = 1, 501 do
    voice.fx[index] = { name = 'FX ' .. index }
  end
  s:send('master_chain_read', 'c1')
  local events = s:events()
  H.eq(#events, 503, 'the voice track, 500 FX, the master track and the close')
  H.eq(events[#events], { 'MASTER_CHAIN_READ', 'c1', '500', '1', '2' })
end)

H.test('master_chain_read stops listing tracks at its cap and says the list was cut short', function()
  local s = new_session()
  for index = 1, 501 do
    s.fake:add_track('Track ' .. index)
  end
  s:send('master_chain_read', 'c1')
  local events = s:events()
  H.eq(#events, 501, '500 tracks and the close: the master is past the cap')
  H.eq(events[#events], { 'MASTER_CHAIN_READ', 'c1', '0', '1', '500' })
end)

-- Every parameter and every send or receive field read counts against one budget for the whole read (50000 values), so 500 FX
-- with thousands of parameters cannot hold REAPER's defer loop. Past it the read is refused (truncated 2), never cut short with
-- the rest unbound (lua review, L1). A send costs 16: its 8 fields read from the sending track and again from the receiving one.
local function many(count)
  local values = {}
  for index = 1, count do
    values[index] = (index % 100) / 100
  end
  return values
end

H.test('master_chain_read reads every setting up to its budget', function()
  local s = new_session()
  local voice = s.fake:add_track('Voice')
  voice.fx = { { name = 'VST: Big', params = many(49984) } }
  s.fake:add_send(voice, s.fake:add_track('Bus'))
  s:send('master_chain_read', 'c1')
  local events = s:events()
  H.truthy(line(events, 'MASTER_CHAIN_FX', voice.guid) ~= nil, 'the FX is listed')
  H.eq(events[#events], { 'MASTER_CHAIN_READ', 'c1', '1', '0', '3' })
end)

H.test('master_chain_read refuses a read past its settings budget', function()
  for _, case in ipairs({
    { label = 'parameters', params = 50001, sends = 0 },
    { label = 'a send past the budget', params = 49985, sends = 1 },
  }) do
    local s = new_session()
    local voice = s.fake:add_track('Voice')
    voice.fx = { { name = 'VST: Big', params = many(case.params) } }
    if case.sends > 0 then
      s.fake:add_send(voice, s.fake:add_track('Bus'))
    end
    s:send('master_chain_read', 'c1')
    local events = s:events()
    local close = events[#events]
    H.eq({ close[1], close[4] }, { 'MASTER_CHAIN_READ', '2' }, case.label .. ': refused as too many settings')
    for _, event in ipairs(events) do
      H.truthy(event[5] ~= 'VST: Big' or case.sends > 0, case.label .. ': the FX past the budget is not listed')
    end
  end
end)

-- A count below zero spends nothing: it never gives the budget back for a later FX to use (#3017 review round 2).
H.test('master_chain_read does not let a negative count refill its settings budget', function()
  local s = new_session()
  local voice = s.fake:add_track('Voice')
  voice.fx = { { name = 'VST: Odd', params = {}, num_params = -100000 }, { name = 'VST: Big', params = many(50001) } }
  s:send('master_chain_read', 'c1')
  local events = s:events()
  local close = events[#events]
  H.eq({ close[1], close[4] }, { 'MASTER_CHAIN_READ', '2' }, 'refused as too many settings')
end)

-- A NaN count spends nothing and leaves the budget a number, so a later FX past it is still refused (#3017 qa round 2, B5).
H.test('master_chain_read does not let a NaN count switch off its settings budget', function()
  local s = new_session()
  local voice = s.fake:add_track('Voice')
  voice.fx = { { name = 'VST: Odd', params = {}, num_params = 0 / 0 }, { name = 'VST: Big', params = many(50001) } }
  s:send('master_chain_read', 'c1')
  local events = s:events()
  local close = events[#events]
  H.eq({ close[1], close[4] }, { 'MASTER_CHAIN_READ', '2' }, 'refused as too many settings')
end)

-- A value too large to count in millionths is written to its 17 significant digits, not as hundreds of digits in %.6f, so a
-- budget of out-of-range values reads as quickly as ordinary ones and two of them still differ (#3017 qa round 2, B6).
H.test('master_chain_read stays quick for out-of-range parameter values', function()
  local huge = {}
  for index = 1, 50000 do
    huge[index] = 1.7e308
  end
  local s = new_session()
  local voice = s.fake:add_track('Voice')
  voice.fx = { { name = 'VST: Huge', params = huge } }
  s:send('master_chain_read', 'c1')
  local events = s:events()
  H.eq({ events[#events][1], events[#events][4] }, { 'MASTER_CHAIN_READ', '0' }, 'the read closes whole')
  local prints = {}
  for _, value in ipairs({ 1e20, 1e20 + 16384, 1e300 }) do
    local each = new_session()
    local track = each.fake:add_track('Voice')
    track.fx = { { name = 'JS: Odd', params = { value } } }
    each:send('master_chain_read', 'c1')
    prints[#prints + 1] = line(each:events(), 'MASTER_CHAIN_FX', track.guid)[7]
  end
  H.truthy(prints[1] ~= prints[2] and prints[2] ~= prints[3] and prints[1] ~= prints[3], 'large values keep fingerprints of their own')
end)

H.test('master_chain_read needs the track FX API', function()
  local s = new_session()
  s.fake:remove_api('TrackFX_GetFXName')
  s:send('master_chain_read', 'c1')
  H.eq(s:events(), { { 'ERROR', 'c1', 'This REAPER version cannot list FX.' } })
end)

H.test('master_chain_read needs every call it reads with', function()
  for _, name in ipairs({
    'TrackFX_GetFXName',
    'TrackFX_GetEnabled',
    'TrackFX_GetOffline',
    'TrackFX_GetNumParams',
    'TrackFX_GetParamNormalized',
    'GetTrackNumSends',
    'GetTrackSendInfo_Value',
  }) do
    local s = new_session()
    s.fake:remove_api(name)
    s:send('master_chain_read', 'c1')
    H.eq(s:events(), { { 'ERROR', 'c1', 'This REAPER version cannot list FX.' } }, name)
  end
end)

-- render_with_fx: the render -----------------------------------------------------------------------------------------

H.test('render_with_fx renders one region through the master mix into the run folder and says where', function()
  local s = new_session()
  s.fake:add_region(10, 70, 'Chapter 1')
  local folder = run_folder(s)
  s:send('render_with_fx', 'r1', APPROVAL, folder, 'Chapter 1')
  local file = H.join(folder, 'fx-01.wav')
  H.eq(s:events(), {
    { 'FX_RENDER_FILE', 'r1', 'Chapter 1', file },
    { 'FX_RENDERED', 'r1', folder, '1' },
  })
  H.truthy(H.read_file(file) ~= nil, 'the rendered file is in the run folder')
  local render = rendered(s)[1]
  H.eq(#rendered(s), 1)
  H.eq({ render.boundsflag, render.startpos, render.endpos }, { 0, 10, 70 }, "the region's own bounds")
  H.eq(render.settings, 0, 'the master mix, so every track and master FX runs')
  H.eq(render.addtoproj, 0, 'nothing rendered is added to the project')
end)

H.test('render_with_fx renders several regions in the order asked, one file each', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  s.fake:add_region(6, 9, 'Chapter 2')
  local folder = run_folder(s)
  s:send('render_with_fx', 'r1', APPROVAL, folder, 'Chapter 2\nChapter 1')
  H.eq(s:events(), {
    { 'FX_RENDER_FILE', 'r1', 'Chapter 2', H.join(folder, 'fx-01.wav') },
    { 'FX_RENDER_FILE', 'r1', 'Chapter 1', H.join(folder, 'fx-02.wav') },
    { 'FX_RENDERED', 'r1', folder, '2' },
  })
  H.eq({ rendered(s)[1].startpos, rendered(s)[2].startpos }, { 6, 0 })
end)

H.test("render_with_fx puts the narrator's render settings back after rendering", function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  narrator_settings(s)
  s:send('render_with_fx', 'r1', APPROVAL, run_folder(s), 'Chapter 1')
  H.eq(#rendered(s), 1)
  settings_are_the_narrators(s)
end)

H.test('render_with_fx opens no undo point and never reads the render stats', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  s:send('render_with_fx', 'r1', APPROVAL, run_folder(s), 'Chapter 1')
  H.eq(#s.fake.undo, 0)
  for _, call in ipairs(s.fake.calls) do
    H.truthy(call.key ~= 'RENDER_STATS' and call.key ~= 'RENDER_STATS_SUMMARY', 'RENDER_STATS can trigger a render (spike S5)')
    H.truthy(call.key ~= 'RENDER_FORMAT' or not call.set, "the narrator's render format is never written")
  end
end)

-- render_with_fx: the approval -----------------------------------------------------------------------------------------

H.test('render_with_fx refuses without the approval and renders nothing', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  narrator_settings(s)
  s:send('render_with_fx', 'r1', '', run_folder(s), 'Chapter 1')
  H.eq(s:events(), { { 'ERROR', 'r1', 'A render with FX needs your approval in the app.' } })
  H.eq(render_triggers(s), 0)
  settings_are_the_narrators(s)
end)

H.test('render_with_fx refuses an approval that is not one the host makes', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  local folder = run_folder(s)
  for _, approval in ipairs({ 'yes', '0123456789abcdef', 'zz23456789abcdef0123456789abcdef' }) do
    s:send('render_with_fx', 'r1', approval, folder, 'Chapter 1')
    H.eq(s:events(), { { 'ERROR', 'r1', 'A render with FX needs your approval in the app.' } }, approval)
  end
  H.eq(render_triggers(s), 0)
end)

H.test('render_with_fx renders once per approval: the same approval again is refused', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  s:send('render_with_fx', 'r1', APPROVAL, run_folder(s, 'run1'), 'Chapter 1')
  s:events()
  s:send('render_with_fx', 'r2', APPROVAL, run_folder(s, 'run2'), 'Chapter 1')
  H.eq(s:events(), { { 'ERROR', 'r2', 'This approval was already used. Approve the render again in the app.' } })
  H.eq(#rendered(s), 1)
  s:send('render_with_fx', 'r3', OTHER_APPROVAL, run_folder(s, 'run3'), 'Chapter 1')
  H.eq(s:events()[2][1], 'FX_RENDERED', 'a new approval renders')
end)

H.test('an approval that was refused for another reason is still used up', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  s:send('render_with_fx', 'r1', APPROVAL, run_folder(s), 'Chapter 9')
  s:events()
  s:send('render_with_fx', 'r2', APPROVAL, run_folder(s, 'run2'), 'Chapter 1')
  H.eq(s:events(), { { 'ERROR', 'r2', 'This approval was already used. Approve the render again in the app.' } })
  H.eq(render_triggers(s), 0)
end)

-- render_with_fx: the folder ---------------------------------------------------------------------------------------------

H.test('render_with_fx refuses a folder that is not a run folder the app made in the project', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  local folder, project = run_folder(s)
  local mastering = H.join(H.join(project, H.brand.identity.projectFolder), 'mastering')
  local refused = {
    '',
    H.brand.identity.projectFolder .. SEP .. 'mastering' .. SEP .. 'run1', -- relative
    project, -- the project folder itself
    H.join(project, 'Renders'), -- not the app's folder
    H.join(mastering, '..'), -- escapes
    H.join(H.join(mastering, '..'), 'run1'),
    H.join(H.join(mastering, 'run1'), 'deeper'),
    H.join(mastering, 'run 1!'),
  }
  for index, candidate in ipairs(refused) do
    s:send('render_with_fx', 'r1', string.format('%032x', index), candidate, 'Chapter 1')
    H.eq(s:events(), { { 'ERROR', 'r1', 'The render folder is not one the app made in the project.' } }, candidate)
  end
  H.eq(render_triggers(s), 0)
  H.truthy(folder ~= nil)
end)

H.test('render_with_fx refuses a run folder reached through a .. part, even one that exists', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  local _, project = run_folder(s)
  local elsewhere = H.join(H.join(H.join(H.join(project, 'Elsewhere'), H.brand.identity.projectFolder), 'mastering'), 'run1')
  host.makedirs(elsewhere)
  local mastering = H.join(H.join(project, H.brand.identity.projectFolder), 'mastering')
  local escaping = H.join(H.join(H.join(H.join(H.join(H.join(mastering, '..'), '..'), 'Elsewhere'), H.brand.identity.projectFolder), 'mastering'), 'run1')
  s:send('render_with_fx', 'r1', APPROVAL, escaping, 'Chapter 1')
  H.eq(s:events(), { { 'ERROR', 'r1', 'The render folder is not one the app made in the project.' } })
  H.eq(render_triggers(s), 0)
end)

H.test('render_with_fx refuses a run folder that does not exist', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  local _, project = run_folder(s)
  local missing = H.join(H.join(H.join(project, H.brand.identity.projectFolder), 'mastering'), 'run9')
  s:send('render_with_fx', 'r1', APPROVAL, missing, 'Chapter 1')
  H.eq(s:events(), { { 'ERROR', 'r1', 'The render folder is not one the app made in the project.' } })
  H.eq(render_triggers(s), 0)
end)

H.test('render_with_fx refuses a run folder that is not empty, so it never writes over a file', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  local folder = run_folder(s)
  local existing = H.join(folder, 'fx-01.wav')
  H.write_file(existing, 'keep')
  s:send('render_with_fx', 'r1', APPROVAL, folder, 'Chapter 1')
  H.eq(s:events(), { { 'ERROR', 'r1', 'The render folder is not empty.' } })
  H.eq(H.read_file(existing), 'keep')
  H.eq(render_triggers(s), 0)
end)

H.test('render_with_fx refuses a run folder that holds a folder', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  local folder = run_folder(s)
  host.makedirs(H.join(folder, 'inner'))
  s:send('render_with_fx', 'r1', APPROVAL, folder, 'Chapter 1')
  H.eq(s:events(), { { 'ERROR', 'r1', 'The render folder is not empty.' } })
  H.eq(render_triggers(s), 0)
end)

H.test('render_with_fx refuses when REAPER would render anywhere but the one file in the run folder', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  narrator_settings(s)
  local folder = run_folder(s)
  s.fake.render_targets = function()
    return slash(folder) .. '/fx-01.wav;' .. slash(folder) .. '/../escaped.wav'
  end
  s:send('render_with_fx', 'r1', APPROVAL, folder, 'Chapter 1')
  H.eq(s:events(), { { 'ERROR', 'r1', 'REAPER would not render to the folder the app made.' } })
  H.eq(render_triggers(s), 0)
  settings_are_the_narrators(s)
end)

H.test('render_with_fx refuses a render format other than WAV and leaves the format alone', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  narrator_settings(s)
  s.fake.render_ext = 'mp3'
  s:send('render_with_fx', 'r1', APPROVAL, run_folder(s), 'Chapter 1')
  H.eq(s:events(), {
    { 'ERROR', 'r1', "REAPER renders to a format other than WAV. Choose WAV in REAPER's render settings, then try again." },
  })
  H.eq(render_triggers(s), 0)
  settings_are_the_narrators(s)
end)

-- render_with_fx: the regions and REAPER's state -------------------------------------------------------------------------

H.test('render_with_fx needs at least one region', function()
  local s = new_session()
  s:send('render_with_fx', 'r1', APPROVAL, run_folder(s), '')
  H.eq(s:events(), { { 'ERROR', 'r1', 'Name at least one region to render.' } })
  H.eq(render_triggers(s), 0)
end)

H.test('render_with_fx refuses a region the project does not have, before rendering any', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  s.fake:insert_marker({ is_region = false, pos = 1, rgnend = 0, name = 'Chapter 2', color = 0 })
  s:send('render_with_fx', 'r1', APPROVAL, run_folder(s), 'Chapter 1\nChapter 2')
  H.eq(s:events(), { { 'ERROR', 'r1', 'There is no region named "Chapter 2".' } })
  H.eq(render_triggers(s), 0)
end)

H.test('render_with_fx refuses a region name two regions share', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  s.fake:add_region(6, 9, 'Chapter 1')
  s:send('render_with_fx', 'r1', APPROVAL, run_folder(s), 'Chapter 1')
  H.eq(s:events(), { { 'ERROR', 'r1', 'More than one region is named "Chapter 1".' } })
  H.eq(render_triggers(s), 0)
end)

H.test('render_with_fx refuses while REAPER records', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  s.fake.play_state = 5
  s:send('render_with_fx', 'r1', APPROVAL, run_folder(s), 'Chapter 1')
  H.eq(s:events(), { { 'ERROR', 'r1', 'REAPER is recording. Stop recording first.' } })
  H.eq(render_triggers(s), 0)
end)

H.test('render_with_fx reports a render that wrote nothing, and still puts the settings back', function()
  local s = new_session()
  s.fake:add_region(0, 5, 'Chapter 1')
  narrator_settings(s)
  s.fake.render_writes_nothing = true
  s:send('render_with_fx', 'r1', APPROVAL, run_folder(s), 'Chapter 1')
  H.eq(s:events(), { { 'ERROR', 'r1', 'REAPER did not write the rendered file for "Chapter 1".' } })
  settings_are_the_narrators(s)
end)

H.test('render_with_fx needs the render API', function()
  local s = new_session()
  s.fake:remove_api('GetSetProjectInfo_String')
  s:send('render_with_fx', 'r1', APPROVAL, run_folder(s), 'Chapter 1')
  H.eq(s:events(), { { 'ERROR', 'r1', 'This REAPER version cannot render with FX.' } })
  H.eq(render_triggers(s), 0)
end)
