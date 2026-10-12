-- Edit and proof workspace spike (REAPER actions and the undo questions): the real set_active_take, list_fx_chains
-- and apply_fx_chain commands (narration_workspace.lua, loaded through the real
-- narration_ui_bridge.lua registry) against a real REAPER, in a scratch project built from synthetic tones. It scripts
-- rows A6, A7, A8 and A10 of docs/operations/reaper-verification-pass.md, and answers what a fake
-- cannot:
--   - does SetActiveTake leave exactly one undo point, and does one Undo restore the previous take;
--   - does TrackFX_AddByName load a .RfxChain by its full path onto a track and the master track;
--   - what REAPER's own peaks (GetMediaItemTake_Peaks) give for a known tone, to cross-check the host's peaks.
--
-- No playback and no recording (no script plays or records): nothing here calls OnPlayButton or records. The FXChains files are
-- written into the isolated -Cfg resource folder, never the owner's.
--
-- Research tool, not product code. Run by run-reaper.ps1 (-Cfg an isolated resource folder, -Out a scratch folder
-- holding media/ from make_media.py); it never opens or saves anything outside -Out and -Cfg. Result:
-- docs/research/edit-and-proof-spike-ep0.md.

do
  local BACKSLASH = string.char(92)
  local wanted = os.getenv('NARRATION_UTILS_SPIKE_CFG')
  local actual = reaper.GetResourcePath()
  assert(wanted and wanted ~= '', 'NARRATION_UTILS_SPIKE_CFG is not set: start this script with run-reaper.ps1')
  assert(actual:gsub(BACKSLASH, '/'):lower() == wanted:gsub(BACKSLASH, '/'):lower(), 'REAPER is not using the isolated -cfgfile: ' .. actual)
  reaper.Audio_Quit()
  assert(reaper.Audio_IsRunning() == 0, 'the audio device could not be closed')
end

local PACK = assert(os.getenv('NARRATION_UTILS_SPIKE_OUT'), 'set NARRATION_UTILS_SPIKE_OUT (run-reaper.ps1 does)')
local REAPER_DIR = assert(os.getenv('NARRATION_UTILS_REAPER_DIR'), 'set NARRATION_UTILS_REAPER_DIR (run-reaper.ps1 does)')
local SEP = package.config:sub(1, 1)
local function path(name)
  return PACK .. SEP .. name
end

local LINE_ID_KEY = 'P_EXT:narration_utils_line_id'
local TAKE_KEY = 'P_EXT:narration_utils_take_finding_id'

local report, passed, failed = {}, 0, 0
local function log(...)
  local parts = {}
  for index = 1, select('#', ...) do
    parts[#parts + 1] = tostring((select(index, ...)))
  end
  report[#report + 1] = table.concat(parts, ' ')
end
local function section(title)
  report[#report + 1] = ''
  report[#report + 1] = '== ' .. title .. ' =='
end
local function check(label, ok, detail)
  if ok then
    passed = passed + 1
  else
    failed = failed + 1
  end
  log((ok and 'PASS ' or 'FAIL ') .. label .. (detail and (' :: ' .. tostring(detail)) or ''))
end
local function finish()
  log('')
  log(string.format('%d passed, %d failed', passed, failed))
  local handle = io.open(path('ep0-workspace-report.txt'), 'wb')
  handle:write(table.concat(report, '\n'), '\n')
  handle:close()
  reaper.Main_OnCommand(40004, 0) -- File: Quit REAPER
end

local function undo_label()
  return reaper.Undo_CanUndo2(0) or ''
end
local function guid_of_item(item)
  local _, guid = reaper.GetSetMediaItemInfo_String(item, 'GUID', '', false)
  return guid
end
local function guid_of_take(take)
  local _, guid = reaper.GetSetMediaItemTakeInfo_String(take, 'GUID', '', false)
  return guid
end
local function find_item(guid)
  for index = 0, reaper.CountMediaItems(0) - 1 do
    local item = reaper.GetMediaItem(0, index)
    if guid_of_item(item) == guid then
      return item
    end
  end
  return nil
end
local function track_chunk(track)
  local _, chunk = reaper.GetTrackStateChunk(track, '', false)
  return chunk
end
local function fx_names(count, name_of)
  local names = {}
  for index = 0, count - 1 do
    local _, name = name_of(index)
    names[#names + 1] = name
  end
  return table.concat(names, ', ')
end
local function write_file(file, text)
  local handle = assert(io.open(file, 'wb'))
  handle:write(text)
  handle:close()
end

-- The body of an .RfxChain: what REAPER keeps inside a track's <FXCHAIN> from the first BYPASS line to the chain's own
-- closing '>', read from a scratch track that has the plug-in added through the API (so the text is REAPER's own).
local function chain_text_for(plugin)
  reaper.InsertTrackAtIndex(reaper.CountTracks(0), false)
  local scratch = reaper.GetTrack(0, reaper.CountTracks(0) - 1)
  assert(reaper.TrackFX_AddByName(scratch, plugin, false, -1) >= 0, 'could not add ' .. plugin .. ' to the scratch track')
  local lines, inside, depth = {}, false, 0
  for line in track_chunk(scratch):gmatch('[^\r\n]+') do
    local trimmed = line:match('^%s*(.-)%s*$')
    if not inside and trimmed:match('^<FXCHAIN') then
      inside, depth = true, 1
    elseif inside then
      if trimmed:sub(1, 1) == '<' then
        depth = depth + 1
      elseif trimmed == '>' then
        depth = depth - 1
        if depth == 0 then
          break
        end
      end
      if #lines > 0 or trimmed:match('^BYPASS') then
        lines[#lines + 1] = trimmed
      end
    end
  end
  reaper.DeleteTrack(scratch)
  assert(#lines > 0, 'the scratch track has no FX chain text')
  return table.concat(lines, '\n') .. '\n'
end

local ok, err = xpcall(function()
  log('version', reaper.GetAppVersion(), 'os', reaper.GetOS(), _VERSION)

  -----------------------------------------------------------------------
  section('Setup: a scratch project in -Out and FX chains in the isolated resource folder')
  -----------------------------------------------------------------------
  -- The plug-in the scratch chains hold, as the FX browser names it.
  local reaeq = 'ReaEQ'
  local chain_root = reaper.GetResourcePath() .. SEP .. 'FXChains'
  reaper.RecursiveCreateDirectory(chain_root .. SEP .. 'Voice' .. SEP .. 'Deep', 0)
  local chain_text = chain_text_for(reaeq)
  write_file(chain_root .. SEP .. 'Voice' .. SEP .. 'Test EQ.RfxChain', chain_text)
  write_file(chain_root .. SEP .. 'Voice' .. SEP .. 'Deep' .. SEP .. 'Other EQ.RfxChain', chain_text)
  write_file(chain_root .. SEP .. 'Voice' .. SEP .. 'notes.txt', 'not a chain\n')
  write_file(path('ReaEQ.RfxChain.txt'), chain_text)
  log('chain text written (a copy is ReaEQ.RfxChain.txt in -Out):', #chain_text, 'bytes')

  -- "Chapter 1": a two-take item at 10 s (take_a then take_b, take_a active) with a line id, and a trimmed item at 20 s
  -- (take_c from 0.5 s for 2.5 s) with a line id, take extension data and a take marker at 1.5 s of source time.
  -- "Chapter 2": one item, the witness for A10.
  local rpp = path('ep0-workspace.rpp')
  reaper.Main_OnCommand(40023, 0) -- File: New project
  reaper.Main_SaveProjectEx(0, rpp, 0)
  reaper.InsertTrackAtIndex(0, true)
  reaper.InsertTrackAtIndex(1, true)
  reaper.GetSetMediaTrackInfo_String(reaper.GetTrack(0, 0), 'P_NAME', 'Chapter 1', true)
  reaper.GetSetMediaTrackInfo_String(reaper.GetTrack(0, 1), 'P_NAME', 'Chapter 2', true)
  local function add_item(track, file, position, offset, length)
    local item = reaper.AddMediaItemToTrack(track)
    reaper.SetMediaItemInfo_Value(item, 'D_POSITION', position)
    reaper.SetMediaItemInfo_Value(item, 'D_LENGTH', length)
    local take = reaper.AddTakeToMediaItem(item)
    reaper.SetMediaItemTake_Source(take, reaper.PCM_Source_CreateFromFile(path('media' .. SEP .. file)))
    reaper.SetMediaItemTakeInfo_Value(take, 'D_STARTOFFS', offset)
    return item, take
  end
  local chapter1 = reaper.GetTrack(0, 0)
  local multi, first_take = add_item(chapter1, 'take_a.wav', 10, 0, 3)
  local second_take = reaper.AddTakeToMediaItem(multi)
  reaper.SetMediaItemTake_Source(second_take, reaper.PCM_Source_CreateFromFile(path('media' .. SEP .. 'take_b.wav')))
  reaper.SetActiveTake(first_take)
  reaper.GetSetMediaItemInfo_String(multi, LINE_ID_KEY, 'L-0001', true)
  local trimmed, trimmed_take = add_item(chapter1, 'take_c.wav', 20, 0.5, 2.5)
  reaper.GetSetMediaItemInfo_String(trimmed, LINE_ID_KEY, 'L-0002', true)
  reaper.GetSetMediaItemTakeInfo_String(trimmed_take, TAKE_KEY, 'finding-0001', true)
  reaper.SetTakeMarker(trimmed_take, -1, 'marker-1.5', 1.5)
  add_item(reaper.GetTrack(0, 1), 'take_a.wav', 5, 0, 3)
  local multi_guid, first_guid, second_guid = guid_of_item(multi), guid_of_take(first_take), guid_of_take(second_take)
  reaper.Main_SaveProjectEx(0, rpp, 0)
  reaper.Main_openProject('noprompt:' .. rpp)
  local _, open_path = reaper.EnumProjects(-1, '')
  check(
    '0 the scratch project is open from -Out with an empty undo history',
    open_path:lower() == rpp:lower() and undo_label() == '',
    open_path .. " undo '" .. undo_label() .. "'"
  )
  chapter1 = reaper.GetTrack(0, 0)
  local chapter2 = reaper.GetTrack(0, 1)
  local _, chapter1_guid = reaper.GetSetMediaTrackInfo_String(chapter1, 'GUID', '', false)
  local witness = track_chunk(chapter2)
  local function witness_unchanged(label)
    check(label .. ' ... left "Chapter 2" unchanged (A10)', track_chunk(reaper.GetTrack(0, 1)) == witness)
  end

  -- The real bridge registry, with the real feature files, called the way the dispatcher calls a command.
  local bridge = dofile(REAPER_DIR .. SEP .. 'narration_ui_bridge.lua')
  local registry = bridge.new_registry()
  local core = dofile(REAPER_DIR .. SEP .. 'narration_bridge_core.lua')
  local events_path = path('events.log')
  os.remove(events_path)
  local read_offset = 0
  local function send(name, ...)
    local handler = assert(registry.lookup(name), name .. ' is not registered')
    handler({ session_dir = PACK, event = function() end, stop = function() end }, { ... })
    local handle = io.open(events_path, 'rb')
    local text = handle and handle:read('a') or ''
    if handle then
      handle:close()
    end
    local fresh = text:sub(read_offset + 1)
    read_offset = #text
    local events = {}
    for line in fresh:gmatch('[^\r\n]+') do
      events[#events + 1] = core.split(line, 32)
    end
    return events
  end
  local function first(events)
    return events[1] and table.concat(events[1], '|') or 'NO EVENT'
  end

  -----------------------------------------------------------------------
  section('A6 set_active_take: one undo point, and Undo restores the previous take')
  -----------------------------------------------------------------------
  local before = undo_label()
  local answer = send('set_active_take', 'r1', multi_guid, second_guid)
  log('answer', first(answer))
  check('A6.1 answers ACTIVE_TAKE_SET changed', answer[1] and answer[1][1] == 'ACTIVE_TAKE_SET' and answer[1][5] == '1', first(answer))
  multi = assert(find_item(multi_guid), 'the two-take item is gone')
  check('A6.2 take 2 plays', guid_of_take(reaper.GetActiveTake(multi)) == second_guid)
  check('A6.3 one undo point "Narration Utils: use take"', undo_label() == 'Narration Utils: use take', "'" .. before .. "' -> '" .. undo_label() .. "'")
  check('A6.4 the item length is unchanged', reaper.GetMediaItemInfo_Value(multi, 'D_LENGTH') == 3)
  local label_after_first = undo_label()
  answer = send('set_active_take', 'r2', multi_guid, second_guid)
  check('A6.5 again: answers unchanged and adds no undo point', answer[1] and answer[1][5] == '0' and undo_label() == label_after_first, first(answer))
  reaper.Main_OnCommand(40029, 0) -- Edit: Undo
  multi = assert(find_item(multi_guid), 'the two-take item is gone after Undo')
  check('A6.6 one Undo makes take 1 active again', guid_of_take(reaper.GetActiveTake(multi)) == first_guid, "undo now '" .. undo_label() .. "'")
  answer = send('set_active_take', 'r3', multi_guid, '{00000000-0000-0000-0000-000000000000}')
  check(
    'A6.7 a take that is not on the item answers ITEM_STALE take and changes nothing',
    answer[1] and answer[1][1] == 'ITEM_STALE' and answer[1][4] == 'take',
    first(answer)
  )
  witness_unchanged('A6')

  -----------------------------------------------------------------------
  section('A7 list_fx_chains')
  -----------------------------------------------------------------------
  answer = send('list_fx_chains', 'r4')
  local chains = {}
  for _, line in ipairs(answer) do
    if line[1] == 'FX_CHAIN' then
      chains[#chains + 1] = line[3]
    end
  end
  log('chains', table.concat(chains, ' ; '), 'last', table.concat(answer[#answer] or {}, '|'))
  check(
    'A7.1 lists both chains by relative name with forward slashes',
    table.concat(chains, ';') == 'Voice/Deep/Other EQ.RfxChain;Voice/Test EQ.RfxChain',
    table.concat(chains, ';')
  )
  -----------------------------------------------------------------------
  section('A8 apply_fx_chain: a chain by path onto a track and the master track')
  -----------------------------------------------------------------------
  local chapter1_items = reaper.CountTrackMediaItems(chapter1)
  answer = send('apply_fx_chain', 'r6', chapter1_guid, 'Voice/Test EQ.RfxChain')
  log(
    'answer',
    first(answer),
    'track FX',
    fx_names(reaper.TrackFX_GetCount(chapter1), function(index)
      return reaper.TrackFX_GetFXName(chapter1, index, '')
    end)
  )
  check(
    'A8.1 a chain loads onto a track by its full path',
    answer[1] and answer[1][1] == 'FX_CHAIN_APPLIED' and reaper.TrackFX_GetCount(chapter1) == 1,
    first(answer)
  )
  check('A8.2 into the FX chain, not the input FX', reaper.TrackFX_GetRecCount(chapter1) == 0)
  check('A8.3 one undo point for the track', undo_label() == 'Narration Utils: apply FX chain Voice/Test EQ.RfxChain to Chapter 1', undo_label())
  check('A8.4 no item was added or removed', reaper.CountTrackMediaItems(chapter1) == chapter1_items)
  local master = reaper.GetMasterTrack(0)
  answer = send('apply_fx_chain', 'r7', 'master', 'Voice/Test EQ.RfxChain')
  check('A8.5 and onto the master track', answer[1] and answer[1][1] == 'FX_CHAIN_APPLIED' and reaper.TrackFX_GetCount(master) == 1, first(answer))
  check('A8.6 one undo point for the master track', undo_label() == 'Narration Utils: apply FX chain Voice/Test EQ.RfxChain to the master track', undo_label())
  reaper.Main_OnCommand(40029, 0)
  reaper.Main_OnCommand(40029, 0)
  chapter1, master = reaper.GetTrack(0, 0), reaper.GetMasterTrack(0)
  check('A8.7 two Undos remove both', reaper.TrackFX_GetCount(chapter1) == 0 and reaper.TrackFX_GetCount(master) == 0)
  for _, name in ipairs({ 'Voice/Missing.RfxChain', '../reaper.ini', 'Voice/notes.txt' }) do
    local label = undo_label()
    answer = send('apply_fx_chain', 'r8', chapter1_guid, name)
    check(
      'A8.8 refuses ' .. name .. ' before anything changes',
      answer[1] and answer[1][1] == 'ERROR' and undo_label() == label and reaper.TrackFX_GetCount(chapter1) == 0,
      first(answer)
    )
  end
  witness_unchanged('A8')

  -----------------------------------------------------------------------
  section("REAPER's own peaks for a known tone (observation only)")
  -----------------------------------------------------------------------
  -- take_a.wav is a 220 Hz sine at 9000/32768 (0.2747) of full scale, 8 kHz mono. The host's peaks (measure.Peaks) give
  -- 0.2747 for every 20 ms bucket; this records what REAPER's peak builder answers for the same take.
  local witness_take = reaper.GetActiveTake(reaper.GetTrackMediaItem(reaper.GetTrack(0, 1), 0))
  if reaper.APIExists('GetMediaItemTake_Peaks') and reaper.APIExists('PCM_Source_BuildPeaks') then
    local source = reaper.GetMediaItemTake_Source(witness_take)
    if reaper.PCM_Source_BuildPeaks(source, 0) ~= 0 then
      for _ = 1, 200 do
        if reaper.PCM_Source_BuildPeaks(source, 1) == 0 then
          break
        end
      end
      reaper.PCM_Source_BuildPeaks(source, 2)
    end
    local buckets = 50
    local buffer = reaper.new_array(buckets * 2)
    local got = reaper.GetMediaItemTake_Peaks(witness_take, 50, 5, 1, buckets, 0, buffer)
    local count = got & 0xFFFFF
    local values = buffer.table()
    local low, high = math.huge, -math.huge
    for index = 1, count do
      high = math.max(high, values[index])
      low = math.min(low, values[buckets + index])
    end
    log(string.format('GetMediaItemTake_Peaks at 50/s for 1 s: %d buckets, max %.4f, min %.4f (raw return %d)', count, high, low, got))
  else
    log('GetMediaItemTake_Peaks or PCM_Source_BuildPeaks is not in this REAPER')
  end
end, debug.traceback)
if not ok then
  failed = failed + 1
  log('ERROR', err)
end
finish()
