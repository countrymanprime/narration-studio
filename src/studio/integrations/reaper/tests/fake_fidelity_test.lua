-- The fake `reaper` must return what REAPER returns, or every other test proves nothing. Each test below pins one
-- behaviour observed in a real REAPER 7.80 (scripted, isolated; src/studio/integrations/reaper/spikes/build_cases.lua and
-- docs/research/reaper-spike-s0-item-extension-data.md). When a spike shows the fake is wrong, correct it here first.

local H = require('harness')
local Fake = require('fake_reaper')

local function api()
  local fake = Fake.new(host)
  return fake.reaper, fake
end

H.test('a missing item extension key reads as false and an empty string; a set key reads back', function()
  local reaper_api, fake = api()
  local item = fake:add_item(fake:add_track('T'), {})
  local ok, value = reaper_api.GetSetMediaItemInfo_String(item, 'P_EXT:' .. H.brand.identity.reaperExtPrefix .. 'line_id', '', false)
  H.eq({ ok, value }, { false, '' })
  H.eq({ reaper_api.GetSetMediaItemInfo_String(item, 'P_EXT:' .. H.brand.identity.reaperExtPrefix .. 'line_id', 'line-000001', true) }, { true, 'line-000001' })
  H.eq({ reaper_api.GetSetMediaItemInfo_String(item, 'P_EXT:' .. H.brand.identity.reaperExtPrefix .. 'line_id', '', false) }, { true, 'line-000001' })
end)

H.test('an item GUID is upper case in braces', function()
  local reaper_api, fake = api()
  local item = fake:add_item(fake:add_track('T'), {})
  local _, guid = reaper_api.GetSetMediaItemInfo_String(item, 'GUID', '', false)
  H.truthy(guid:match('^{%x+%-%x+%-%x+%-%x+%-%x+}$') and guid == guid:upper(), guid)
end)

H.test('markers and regions are numbered separately and enumerated by time, with index plus one as the first return', function()
  local reaper_api, fake = api()
  H.eq(reaper_api.AddProjectMarker2(0, false, 6.5, 0, 'PICKUP: a', -1, 0), 1)
  H.eq(reaper_api.AddProjectMarker2(0, false, 12.25, 0, 'PICKUP: b', -1, 0), 2)
  H.eq(reaper_api.AddProjectMarker2(0, true, 0, 11.9, 'Chapter 1', -1, 0), 1, 'the first region is region 1 even though two markers exist')
  H.eq(reaper_api.AddProjectMarker2(0, true, 12, 19.9, 'Chapter 2', -1, 0), 2)
  H.eq({ reaper_api.EnumProjectMarkers3(0, 0) }, { 1, true, 0, 11.9, 'Chapter 1', 1, 0 })
  H.eq({ reaper_api.EnumProjectMarkers3(0, 1) }, { 2, false, 6.5, 0, 'PICKUP: a', 1, 0 })
  H.eq({ reaper_api.EnumProjectMarkers3(0, 2) }, { 3, true, 12, 19.9, 'Chapter 2', 2, 0 })
  H.eq({ reaper_api.EnumProjectMarkers3(0, 3) }, { 4, false, 12.25, 0, 'PICKUP: b', 2, 0 })
  H.eq({ reaper_api.EnumProjectMarkers3(0, 4) }, { 0, false, 0, 0, '', 0, 0 }, 'past the end the first return is 0')
  H.eq(#fake.markers, 4)
end)

H.test('take markers are kept in source-time order, and SetTakeMarker returns the index the marker ended up at', function()
  local reaper_api, fake = api()
  local take = fake:add_item(fake:add_track('T'), { source = 'a.wav' }).takes[1]
  H.eq(reaper_api.SetTakeMarker(take, -1, 'z-late', 2.5, 0), 0)
  H.eq(reaper_api.SetTakeMarker(take, -1, 'a-early', 0.5, 0), 0, 'inserted before the existing one, so it is index 0')
  H.eq(reaper_api.GetNumTakeMarkers(take), 2)
  H.eq({ reaper_api.GetTakeMarker(take, 0) }, { 0.5, 'a-early', 0 })
  H.eq({ reaper_api.GetTakeMarker(take, 1) }, { 2.5, 'z-late', 0 })
  H.eq({ reaper_api.GetTakeMarker(take, 99) }, { -1, '', 0 }, 'an invalid index answers -1 and an empty name')
end)

H.test('ColorToNative packs blue-green-red on Windows, and an unsaved project has an empty path', function()
  local reaper_api, fake = api()
  H.eq(reaper_api.ColorToNative(255, 64, 64), 4210943)
  local project, path = reaper_api.EnumProjects(-1, '')
  H.truthy(project ~= nil)
  H.eq(path, '')
  fake.project_path = 'C:\\Book\\Book.rpp'
  H.eq(select(2, reaper_api.EnumProjects(-1, '')), 'C:\\Book\\Book.rpp')
end)

H.test('EnumerateFiles lists a cached snapshot until it is cleared with index -1', function()
  local reaper_api = api()
  local dir = host.tmpdir()
  H.write_file(H.join(dir, 'a.cmd'), 'x')
  H.eq(reaper_api.EnumerateFiles(dir, 0), 'a.cmd')
  H.write_file(H.join(dir, 'b.cmd'), 'x')
  H.eq(reaper_api.EnumerateFiles(dir, 1), nil, 'a file created after the first call is not listed yet')
  reaper_api.EnumerateFiles(dir, -1)
  local names = { reaper_api.EnumerateFiles(dir, 0), reaper_api.EnumerateFiles(dir, 1) }
  table.sort(names)
  H.eq(names, { 'a.cmd', 'b.cmd' })
  os.remove(H.join(dir, 'a.cmd'))
  H.truthy(reaper_api.EnumerateFiles(dir, 0) ~= nil and reaper_api.EnumerateFiles(dir, 1) ~= nil, 'a removed file is still listed until the cache is cleared')
end)

H.test('with the default link the time selection and the loop points move together, and GetSetRepeat asks, sets and toggles', function()
  -- REAPER 7.80, the navigation check (src/studio/integrations/reaper/spikes/results/navigation-check-report.txt):
  -- setting only the loop points moved the time selection, and setting only the time selection moved the loop points.
  local reaper_api, fake = api()
  fake.linked_loop = true
  reaper_api.GetSet_LoopTimeRange2(0, true, true, 0.5, 2.5, false)
  H.eq({ reaper_api.GetSet_LoopTimeRange2(0, false, false, 0, 0, false) }, { 0.5, 2.5 })
  reaper_api.GetSet_LoopTimeRange2(0, true, false, 1, 2, false)
  H.eq({ reaper_api.GetSet_LoopTimeRange2(0, false, true, 0, 0, false) }, { 1, 2 })
  H.eq({ reaper_api.GetSetRepeat(-1), reaper_api.GetSetRepeat(1), reaper_api.GetSetRepeat(2), reaper_api.GetSetRepeat(0) }, { 0, 1, 0, 0 })
end)

-- Spike S7 (REAPER 7.80, docs/research/reaper-spike-s7-fixed-lanes.md): track C_LANEPLAYS:N=1 silences every other
-- lane, =2 adds a lane alongside (the exclusive one reads 2 from then on), and =0 on the only playing lane leaves no
-- lane playing.
H.test('a lane play state of 1 plays that lane alone, 2 adds a lane, and 0 can leave no lane playing', function()
  local reaper_api, fake = api()
  local track = fake:add_track('T')
  fake:set_fixed_lanes(track, 3)
  local function plays()
    return {
      reaper_api.GetMediaTrackInfo_Value(track, 'C_LANEPLAYS:0'),
      reaper_api.GetMediaTrackInfo_Value(track, 'C_LANEPLAYS:1'),
      reaper_api.GetMediaTrackInfo_Value(track, 'C_LANEPLAYS:2'),
    }
  end
  H.eq(plays(), { 2, 2, 2 }, 'every lane plays after retakes are placed on lanes')
  reaper_api.SetMediaTrackInfo_Value(track, 'C_LANEPLAYS:1', 1)
  H.eq(plays(), { 0, 1, 0 })
  reaper_api.SetMediaTrackInfo_Value(track, 'C_LANEPLAYS:2', 2)
  H.eq(plays(), { 0, 2, 2 })
  reaper_api.SetMediaTrackInfo_Value(track, 'C_LANEPLAYS:1', 0)
  reaper_api.SetMediaTrackInfo_Value(track, 'C_LANEPLAYS:2', 0)
  H.eq(plays(), { 0, 0, 0 })
end)

H.test('a track not in fixed-lane mode reads I_FREEMODE 0 and one lane that plays; an item reads its lane', function()
  local reaper_api, fake = api()
  local plain = fake:add_track('Plain')
  H.eq({ reaper_api.GetMediaTrackInfo_Value(plain, 'I_FREEMODE'), reaper_api.GetMediaTrackInfo_Value(plain, 'I_NUMFIXEDLANES') }, { 0, 1 })
  H.eq(reaper_api.GetMediaTrackInfo_Value(plain, 'C_LANEPLAYS:0'), 1)
  local lanes = fake:add_track('Lanes')
  fake:set_fixed_lanes(lanes, 3, { 0, 0, 1 })
  local item = fake:add_item(lanes, { lane = 2 })
  H.eq({ reaper_api.GetMediaTrackInfo_Value(lanes, 'I_FREEMODE'), reaper_api.GetMediaItemInfo_Value(item, 'I_FIXEDLANE') }, { 2, 2 })
  H.eq(reaper_api.GetMediaItemInfo_Value(item, 'C_LANEPLAYS'), 1, 'the item-level value reads its lane state')
end)

H.test('Undo_CanUndo2 names a closed block, and one Undo_DoUndo2 takes it off the history', function()
  -- S0: the stamp block was the undo entry "<app name>: stamp manuscript line IDs" right after it closed, and one Undo
  -- undid it. Nothing to undo answering nil, and Undo_DoUndo2 answering 1, are the ReaScript reference's ("NULL if not",
  -- "nonzero if success"), not a run.
  local reaper_api, fake = api()
  local item = fake:add_item(fake:add_track('T'), {})
  H.eq(reaper_api.Undo_CanUndo2(0), nil)
  reaper_api.Undo_BeginBlock2(0)
  reaper_api.GetSetMediaItemInfo_String(item, 'P_EXT:' .. H.brand.identity.reaperExtPrefix .. 'line_id', 'line-000001', true)
  reaper_api.Undo_EndBlock2(0, H.brand.name .. ': stamp manuscript line IDs', -1)
  H.eq(reaper_api.Undo_CanUndo2(0), H.brand.name .. ': stamp manuscript line IDs')
  H.eq(reaper_api.Undo_DoUndo2(0), 1)
  H.eq(reaper_api.Undo_CanUndo2(0), nil)
  H.eq(reaper_api.Undo_DoUndo2(0), 0)
end)

-- Observed in REAPER 7.82 on Linux by the real-REAPER CI run, 2026-10-19 (scripts/ci/real-reaper, docs/research/real-reaper-ci-integration.md).

H.test('7.82/Linux: an FX chain loads by its name relative to FXChains and not by its full path', function()
  local reaper_api, fake = api()
  local track = fake:add_track('T')
  H.eq(reaper_api.TrackFX_AddByName(track, '/home/me/.config/REAPER/FXChains/Voice/Test EQ.RfxChain', false, -1), -1)
  H.eq(reaper_api.TrackFX_GetCount(track), 0)
  H.eq(reaper_api.TrackFX_AddByName(track, 'Voice/Test EQ.RfxChain', false, -1), 0)
  H.eq(reaper_api.TrackFX_GetCount(track), 1)
  local take = fake:add_item(track, { source = 'a.wav' }).takes[1]
  H.eq(reaper_api.TakeFX_AddByName(take, 'C:\\Users\\me\\AppData\\Roaming\\REAPER\\FXChains\\Voice\\Test EQ.RfxChain', -1), -1)
  H.eq(reaper_api.TakeFX_AddByName(take, 'Voice/Test EQ.RfxChain', -1), 0)
end)

H.test('7.82/Linux: TakeFX_SetEnabled adds an undo point per change outside an undo block, and none inside one', function()
  local reaper_api, fake = api()
  local take = fake:add_item(fake:add_track('T'), { source = 'a.wav' }).takes[1]
  H.eq(reaper_api.TakeFX_AddByName(take, 'Voice/Test EQ.RfxChain', -1), 0)
  reaper_api.TakeFX_SetEnabled(take, 0, true)
  H.eq(#fake.undo, 0, 'no change, no point')
  reaper_api.TakeFX_SetEnabled(take, 0, false)
  reaper_api.TakeFX_SetEnabled(take, 0, true)
  H.eq(#fake.undo, 2, 'one point per change')
  H.eq(fake.undo[1].label:match('^FX bypass toggle'), 'FX bypass toggle')
  reaper_api.Undo_BeginBlock2(0)
  reaper_api.TakeFX_SetEnabled(take, 0, false)
  reaper_api.Undo_EndBlock2(0, H.brand.name .. ': bypass effect', -1)
  H.eq(#fake.undo, 3, "inside a block the change is the block's own point")
  H.eq(fake.undo[3].label, H.brand.name .. ': bypass effect')
end)

-- Observed in REAPER 7.82 on Linux, 2026-10-24 (docs/research/reaper-preroll-2026-10-24.md).

H.test('7.82/Linux: the pre-roll is two configuration variables, an integer bit field and a fourteen-decimal length', function()
  local reaper_api, fake = api()
  fake.config.preroll, fake.config.prerollmeas = '0', '2.00000000000000'
  H.eq({ reaper_api.get_config_var_string('preroll') }, { true, '0' })
  H.eq({ reaper_api.get_config_var_string('prerollmeas') }, { true, '2.00000000000000' })
  H.eq({ reaper_api.TimeMap_GetTimeSigAtTime(0, 8) }, { 4, 4, 120 }, 'a new project is 4/4 at 120')
end)

-- Observed in REAPER 7.82 on Linux with the JACK dummy device, 2026-10-23 (docs/research/reaper-recording-undo-2026-10-23.md).

H.test('7.82/Linux: a stopped recording is an item and one "Recorded media" point; one Undo_DoUndo2 takes it away', function()
  local reaper_api, fake = api()
  local track = fake:add_track('T')
  local earlier = fake:add_item(track, { position = 0, length = 5, source = 'a.wav' })
  track.armed = true
  fake.cursor = 6
  local before = reaper_api.GetProjectStateChangeCount(0)
  reaper_api.CSurf_OnRecord()
  H.eq(#fake.items, 1, 'a recording is not an item until it stops')
  H.eq(reaper_api.GetProjectStateChangeCount(0), before, 'recording adds no point while it runs')
  reaper_api.OnStopButton()
  H.eq(#fake.items, 2, 'the recording is an item once it stops')
  H.eq(reaper_api.Undo_CanUndo2(0), 'Recorded media')
  H.eq(reaper_api.GetProjectStateChangeCount(0), before + 1, 'one point, so the change count rises by one')
  H.eq(reaper_api.Undo_DoUndo2(0), 1)
  H.eq(#fake.items, 1, 'one Undo takes the recorded item away')
  H.eq(rawequal(fake.items[1], earlier), true, 'the earlier item is the one left')
  H.eq(reaper_api.Undo_CanUndo2(0), nil)
  H.eq(reaper_api.GetProjectStateChangeCount(0), before + 2, 'the Undo raised the change count too')
end)

H.test('a silent track and the master meter 0 on both channels, and a metered level reads back as a linear peak', function()
  -- REAPER 7.82, 2026-10-24 (docs/research/reaper-meters-2026-10-24.md): a new, unarmed track and the master answered 0 on
  -- channels 0 and 1 with nothing playing; an armed track fed a 0.5 click answered about 0.5 on both.
  local reaper_api, fake = api()
  local track = fake:add_track('T')
  H.eq({ reaper_api.Track_GetPeakInfo(track, 0), reaper_api.Track_GetPeakInfo(track, 1) }, { 0, 0 })
  H.eq({ reaper_api.Track_GetPeakInfo(reaper_api.GetMasterTrack(0), 0), reaper_api.Track_GetPeakInfo(reaper_api.GetMasterTrack(0), 1) }, { 0, 0 })
  track.peaks = { 0.5, 0.5 }
  H.eq({ reaper_api.Track_GetPeakInfo(track, 0), reaper_api.Track_GetPeakInfo(track, 1) }, { 0.5, 0.5 })
end)

-- Observed in REAPER 7.82 on Linux, 2026-10-24 (docs/research/reaper-item-fx-dialog-2026-10-24.md).

H.test('7.82/Linux: a split copies a take FX to each piece under the same FX GUID', function()
  local reaper_api, fake = api()
  local item = fake:add_item(fake:add_track('T'), { position = 0, length = 10, source = 'a.wav' })
  H.eq(reaper_api.TakeFX_AddByName(item.takes[1], 'Voice/Test EQ.RfxChain', -1), 0)
  local guid = reaper_api.TakeFX_GetFXGUID(item.takes[1], 0)
  local right = reaper_api.SplitMediaItem(item, 4)
  H.eq(reaper_api.TakeFX_GetCount(reaper_api.GetActiveTake(right)), 1)
  H.eq(reaper_api.TakeFX_GetFXGUID(reaper_api.GetActiveTake(right), 0), guid)
  H.eq(reaper_api.TakeFX_GetFXGUID(item.takes[1], 0), guid)
end)

H.test('7.82/Linux: action 40638 is "Item: Show FX chain for item take"; on an empty take it opens the Add FX browser, not the chain', function()
  local reaper_api, fake = api()
  H.eq(reaper_api.kbd_getTextFromCmd(40638, reaper_api.SectionFromUniqueID(0)), 'Item: Show FX chain for item take')
  local empty = fake:add_item(fake:add_track('T'), { position = 0, length = 10, source = 'a.wav' })
  local full = fake:add_item(fake:add_track('U'), { position = 0, length = 10, source = 'b.wav' })
  H.eq(reaper_api.TakeFX_AddByName(full.takes[1], 'Voice/Test EQ.RfxChain', -1), 0)
  H.eq(reaper_api.TakeFX_GetChainVisible(empty.takes[1]), -1, 'hidden')
  reaper_api.SelectAllMediaItems(0, false)
  reaper_api.SetMediaItemSelected(empty, true)
  reaper_api.Main_OnCommand(40638, 0)
  H.eq(reaper_api.TakeFX_GetChainVisible(empty.takes[1]), -1, 'the browser is open, the chain is not')
  H.truthy(fake.fx_browser and fake.fx_browser.take == empty.takes[1], 'the browser is for the empty take')
  -- The narrator's choice goes on the take the browser opened for, whatever is selected by then.
  reaper_api.SelectAllMediaItems(0, false)
  fake:choose_fx('VST: ReaComp (Cockos)')
  H.eq(reaper_api.TakeFX_GetCount(empty.takes[1]), 1)
  H.eq(reaper_api.TakeFX_GetChainVisible(empty.takes[1]), 0, 'the chain window opens on the plug-in')
  H.eq(fake.undo[#fake.undo].label, 'Add FX: Item on track 1 T: ReaComp')
  reaper_api.SelectAllMediaItems(0, false)
  reaper_api.SetMediaItemSelected(full, true)
  reaper_api.Main_OnCommand(40638, 0)
  H.eq(reaper_api.TakeFX_GetChainVisible(full.takes[1]), 0, 'a take with FX shows its chain')
  reaper_api.Main_OnCommand(40638, 0)
  H.eq(reaper_api.TakeFX_GetChainVisible(full.takes[1]), 0, 'a second press leaves it open')
end)

H.test('7.82/Linux: TakeFX_Show opens a chain window with no point; closing it adds a "Close FX chain" point', function()
  local reaper_api, fake = api()
  local item = fake:add_item(fake:add_track('T'), { position = 0, length = 10, source = 'a.wav' })
  reaper_api.TakeFX_Show(item.takes[1], 0, 1)
  H.eq(reaper_api.TakeFX_GetChainVisible(item.takes[1]), -2, 'visible with no FX selected')
  H.eq(#fake.undo, 0)
  reaper_api.TakeFX_Show(item.takes[1], 0, 0)
  H.eq(reaper_api.TakeFX_GetChainVisible(item.takes[1]), -1)
  H.eq(fake.undo[#fake.undo].label, 'Close FX chain: Item on track 1 T')
  fake:cancel_fx_browser()
  H.eq(#fake.undo, 1, 'a cancelled browser adds nothing')
end)

H.test('7.82/Linux: SelectAllMediaItems unselecting outside an undo block adds "Unselect all items"; SetMediaItemSelected adds nothing', function()
  local reaper_api, fake = api()
  local item = fake:add_item(fake:add_track('T'), { position = 0, length = 10, source = 'a.wav' })
  reaper_api.SetMediaItemSelected(item, true)
  reaper_api.SetMediaItemSelected(item, false)
  reaper_api.SetMediaItemSelected(item, true)
  H.eq(#fake.undo, 0)
  reaper_api.SelectAllMediaItems(0, false)
  H.eq(fake:undo_labels(), { 'Unselect all items' })
  reaper_api.SelectAllMediaItems(0, false)
  H.eq(#fake.undo, 1, 'nothing to unselect, no point')
end)
