-- Adding a chapter's track in REAPER: "Create a track for this chapter and link it", offered when a chapter has no track
-- to record on. Loaded by narration_ui_bridge.lua, which passes the shared helpers as the chunk argument.
--
-- track_create|run|name adds one track at the end of the track list (after every track the narrator has, never between
-- them), at the top level, names it, and answers TRACK_CREATED|run|guid|index|name: the new track's GUID, its 0-based index and the name
-- it was given, so the host can link the chapter to it. The name is trimmed and a line break or tab inside it becomes a
-- space (a track name is one line); a name that is empty after that is refused. It refuses while REAPER records, so no
-- track appears in the middle of a take, and changes nothing else: no other track's selection, arm, mute or name. It is one
-- undo point ("<app name>: add track") and never saves the project. It is not idempotent: each call adds a track. A project
-- that ends inside a folder left open has that folder closed on its last track first (core.append_track), so the new track
-- is never the open folder's last child; that is the only change to a track that was there, and no track changes parent.
--
-- track_create|run|name|parentGuid adds a voice inside a chapter's folder (docs/prds/booth-voice-tracks.prd.md, phase 3): the new track goes after
-- the parent's last descendant as a direct child of the parent, and the folder depth changes (I_FOLDERDEPTH) of that last descendant and of
-- the new track are set so every folder still closes where it did (REAPER 7.82: InsertTrackAtIndex moves no depth itself,
-- docs/research/2026-10-30-booth-sub-track-recording.md, section 6a, row 2). A parent that is not a folder becomes one with the new track as
-- its child. The new track records from the same input and mode as the folder's first child (the parent's own when it has none). A parent
-- that is gone answers TRACK_STALE and adds nothing.
--
-- track_create|run|name||childName adds a chapter folder for a Voice folders project (#2840, part 2): a folder named name and, inside it,
-- one child named childName (the host sends "Narrator"), both after every other track, in the same one undo block. A folder left open at the
-- end of the project (REAPER accepts a last track whose I_FOLDERDEPTH leaves one open) is first closed on that last track, so the new folder
-- is never nested inside the chapter before it; that is the only change to a track that was there. It answers
-- TRACK_CREATED|run|guid|index|name|childGuid|childIndex|childName. A parent and a child name together are refused.
--
-- track_create|run|name|parentGuid|childName|monitor|fx sets up the track the narrator records on (the new track, or the folder's child):
-- monitor "1" turns its input monitoring on (I_RECMON = 1; anything else leaves REAPER's default), and fx is a ";"-separated list of FX names
-- (or FX chain names) added with TrackFX_AddByName in order. A name that will not load is skipped, not fatal: the track is still made.
-- Before TRACK_CREATED it answers TRACK_SETUP|run|guid|monitor|loaded|failed, with the set-up track's GUID, 1 or 0 for monitoring, how many
-- FX loaded and the ";"-joined names that did not. No TRACK_SETUP is sent when neither was asked for, so an older host sees no change.
--
-- Events: TRACK_SETUP|run|guid|monitor|loaded|failed, TRACK_CREATED|run|guid|index|name[|childGuid|childIndex|childName],
-- TRACK_STALE|run|parentGuid, or ERROR|run|message.

local core = ...
local event = core.event

local UNDO_ADD_TRACK = core.brand.name .. ': add track'
local RECORDING = 'REAPER is recording. Stop recording first.'
local STRUCTURE = 'Adding the track there would move other tracks into a different folder, so nothing was added. Check the folders in REAPER.'
local NO_NAME = 'The new track needs a name.'
local BOTH = 'A new track goes inside a folder or makes a folder, not both.'

local function recording()
  return math.floor(reaper.GetPlayState() / 4) % 2 == 1
end

local function clean_name(text)
  local name = tostring(text or ''):gsub('[\r\n\t]+', ' ')
  return (name:gsub('^%s+', ''):gsub('%s+$', ''))
end

local function normalize_guid(guid)
  local bare = tostring(guid or ''):gsub('[{}%s]', ''):upper()
  if bare == '' then
    return ''
  end
  return '{' .. bare .. '}'
end

-- The track the GUID names and its 0-based index, with the folder depth each track sits at, or nil.
local function locate(guid)
  local depth = 0
  local depths = {}
  local found_index
  for index = 0, reaper.CountTracks(0) - 1 do
    local track = reaper.GetTrack(0, index)
    depths[index] = depth
    if normalize_guid(reaper.GetTrackGUID(track)) == guid then
      found_index = index
    end
    depth = depth + reaper.GetMediaTrackInfo_Value(track, 'I_FOLDERDEPTH')
  end
  if found_index == nil then
    return nil
  end
  return found_index, depths
end

-- Where the new track goes inside `parent_index`'s folder, after its last descendant, and the folder depth changes (I_FOLDERDEPTH) that
-- keep every folder closing where it did: the last descendant's new change, and the new track's. Answers nil when the planned structure
-- would move any existing track into another folder (core.insert_keeps_parents), so nothing is written.
local function plan_child(parent_index, depths)
  local parent = reaper.GetTrack(0, parent_index)
  local members = core.with_descendants(parent)
  local last_index = parent_index + #members - 1
  local last = reaper.GetTrack(0, last_index)
  local last_delta = reaper.GetMediaTrackInfo_Value(last, 'I_FOLDERDEPTH')
  local parent_depth, last_depth = depths[parent_index], depths[last_index]
  local plan = {
    index = last_index + 1,
    last = last,
    last_delta = parent_depth + 1 - last_depth,
    new_delta = last_delta + last_depth - parent_depth - 1,
    source = members[2] or parent,
  }
  local before = core.folder_deltas()
  local after = {}
  for position, delta in ipairs(before) do
    after[#after + 1] = position == last_index + 1 and plan.last_delta or delta
    if position == last_index + 1 then
      after[#after + 1] = plan.new_delta
    end
  end
  if not core.insert_keeps_parents(before, after, plan.index + 1, parent_index + 1) then
    return nil
  end
  return plan
end

-- Inserts the new track as `plan` says and answers its index.
local function insert_child(plan)
  reaper.InsertTrackAtIndex(plan.index, false)
  local track = reaper.GetTrack(0, plan.index)
  reaper.SetMediaTrackInfo_Value(plan.last, 'I_FOLDERDEPTH', plan.last_delta)
  reaper.SetMediaTrackInfo_Value(track, 'I_FOLDERDEPTH', plan.new_delta)
  reaper.SetMediaTrackInfo_Value(track, 'I_RECINPUT', reaper.GetMediaTrackInfo_Value(plan.source, 'I_RECINPUT'))
  reaper.SetMediaTrackInfo_Value(track, 'I_RECMODE', reaper.GetMediaTrackInfo_Value(plan.source, 'I_RECMODE'))
  return plan.index
end

-- Inside the undo block: the folder named name and its one child named child_name, appended after every track. Answers both and their indexes.
-- The folder is appended at the top level, never inside a folder left open at the end of the project (core.append_track).
local function append_folder(name, child_name)
  local folder, index = core.append_track()
  reaper.InsertTrackAtIndex(index + 1, false)
  local child = reaper.GetTrack(0, index + 1)
  reaper.SetMediaTrackInfo_Value(folder, 'I_FOLDERDEPTH', 1)
  reaper.SetMediaTrackInfo_Value(child, 'I_FOLDERDEPTH', -1)
  reaper.GetSetMediaTrackInfo_String(folder, 'P_NAME', name, true)
  reaper.GetSetMediaTrackInfo_String(child, 'P_NAME', child_name, true)
  return folder, index, child, index + 1
end

local function stored_name(track)
  local _, stored = reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', '', false)
  return stored
end

-- Splits the ";"-separated FX names, trimmed, dropping empty ones.
local function fx_names(text)
  local names = {}
  for part in tostring(text or ''):gmatch('[^;]+') do
    local name = part:gsub('^%s+', ''):gsub('%s+$', '')
    if name ~= '' then
      names[#names + 1] = name
    end
  end
  return names
end

-- Inside the undo block: turns monitoring on and adds the FX asked for on `track`, and answers TRACK_SETUP (nothing when neither was asked).
local function set_up(session_dir, run_id, track, monitor_text, fx_text)
  local monitor = monitor_text == '1'
  local names = fx_names(fx_text)
  if not monitor and #names == 0 then
    return
  end
  if monitor then
    reaper.SetMediaTrackInfo_Value(track, 'I_RECMON', 1)
  end
  local loaded, failed = 0, {}
  for _, name in ipairs(names) do
    if reaper.TrackFX_AddByName(track, name, false, -1) >= 0 then
      loaded = loaded + 1
    else
      failed[#failed + 1] = name
    end
  end
  event(session_dir, 'TRACK_SETUP', run_id, reaper.GetTrackGUID(track), monitor and 1 or 0, loaded, table.concat(failed, ';'))
end

local function track_create(session_dir, run_id, name_text, parent_text, child_text, monitor_text, fx_text)
  local name = clean_name(name_text)
  if name == '' then
    event(session_dir, 'ERROR', run_id, NO_NAME)
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local parent_guid = normalize_guid(parent_text)
  local child_name = clean_name(child_text)
  if child_name ~= '' then
    if parent_guid ~= '' then
      event(session_dir, 'ERROR', run_id, BOTH)
      return
    end
    reaper.Undo_BeginBlock2(0)
    local folder, index, child, child_index = append_folder(name, child_name)
    set_up(session_dir, run_id, child, monitor_text, fx_text)
    reaper.Undo_EndBlock2(0, UNDO_ADD_TRACK, -1)
    reaper.UpdateArrange()
    event(
      session_dir,
      'TRACK_CREATED',
      run_id,
      reaper.GetTrackGUID(folder),
      index,
      stored_name(folder),
      reaper.GetTrackGUID(child),
      child_index,
      stored_name(child)
    )
    return
  end
  local plan
  if parent_guid ~= '' then
    local parent_index, depths = locate(parent_guid)
    if parent_index == nil then
      event(session_dir, 'TRACK_STALE', run_id, parent_text)
      return
    end
    plan = plan_child(parent_index, depths)
    if plan == nil then
      event(session_dir, 'ERROR', run_id, STRUCTURE)
      return
    end
  end
  reaper.Undo_BeginBlock2(0)
  local index
  if plan ~= nil then
    index = insert_child(plan)
  else
    -- At the top level, never inside a folder left open at the end of the project (core.append_track).
    local _
    _, index = core.append_track()
  end
  local track = reaper.GetTrack(0, index)
  reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', name, true)
  set_up(session_dir, run_id, track, monitor_text, fx_text)
  reaper.Undo_EndBlock2(0, UNDO_ADD_TRACK, -1)
  reaper.UpdateArrange()
  local _, stored = reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', '', false)
  event(session_dir, 'TRACK_CREATED', run_id, reaper.GetTrackGUID(track), index, stored)
end

-- chapter_folders|run|mode|chapterGuids|expected moves chapter tracks out of another chapter's folder (#2838). A project can carry chapters
-- nested by the append bug fixed in core.append_track: every chapter added after a folder left open at the end landed inside that folder.
-- chapterGuids lists the tracks the app links to chapters (comma-separated); a chapter track whose folder, or any folder above it, is
-- another chapter's is lifted out of the innermost such folder by lowering the folder depth (I_FOLDERDEPTH) of the track just before
-- it, the only value written. A nested chapter's own voices move with it and stay inside it; a voice track is never lifted, only a chapter.
-- mode is preview (answers the moves, writes nothing) or apply, which plans again and writes only when the moves are exactly the
-- `expected` chapter GUIDs the narrator confirmed (comma-separated, in order), in one undo point; otherwise FOLDERS_STALE and nothing is
-- written. Each track whose folder changes is answered as FOLDER_MOVE|run|guid|name|oldFolderGuid|oldFolderName|newFolderGuid|newFolderName
-- ('' for the top level), the names as REAPER holds them now.
-- Events: FOLDER_MOVE lines, then FOLDERS_PLANNED|run|count, FOLDERS_REPAIRED|run|count, FOLDERS_STALE|run, or ERROR|run|message.

local UNDO_FOLDERS = core.brand.name .. ': move chapters out of folders'
local BAD_MODE = 'Choose preview or apply.'
local FOLDERS_UNSAFE =
  'Moving these chapters would put other tracks in a different folder, so nothing was moved. Move the chapter tracks out of the folder in REAPER.'

local function split_guids(text)
  local out = {}
  for part in tostring(text or ''):gmatch('[^,]+') do
    local guid = normalize_guid(part)
    if guid ~= '' then
      out[#out + 1] = guid
    end
  end
  return out
end

-- The planned folder depths, and the 1-based positions of the lifts. Each pass lifts the first chapter that sits inside
-- another chapter's folder out of the innermost one; lifting it moves the tracks after it up by the same levels, so the next pass reads
-- the structure again. At most one pass per track.
local function plan_lifts(deltas, guids, chapters)
  local planned = {}
  for position, delta in ipairs(deltas) do
    planned[position] = delta
  end
  local lifted = {}
  for _ = 1, #planned do
    local parents = core.folder_parents(planned)
    local found
    for position = 2, #planned do
      if chapters[guids[position]] then
        local levels, ancestor = 0, parents[position]
        while ancestor ~= 0 do
          levels = levels + 1
          if chapters[guids[ancestor]] then
            found = { position = position, levels = levels, folder = ancestor }
            break
          end
          ancestor = parents[ancestor]
        end
        if found then
          break
        end
      end
    end
    if not found then
      break
    end
    -- The track that closed the chapter folder the nested chapter leaves gives the lifted levels back, so every track after that folder
    -- keeps the folder it was in (a Book that holds the chapters, say). A folder left open at the end has no such track.
    local before, depth = {}, 0
    for position, delta in ipairs(planned) do
      before[position] = depth
      depth = math.max(depth + delta, 0)
    end
    local folder_depth, closing = before[found.folder], nil
    for position = found.position, #planned do
      local after = position < #planned and before[position + 1] or math.max(before[position] + planned[position], 0)
      if before[position] > folder_depth and after <= folder_depth then
        closing = position
        break
      end
    end
    planned[found.position - 1] = planned[found.position - 1] - found.levels
    if closing then
      planned[closing] = planned[closing] + found.levels
    end
    lifted[#lifted + 1] = found.position
  end
  return planned, lifted
end

-- True when every track whose folder changes sat somewhere inside a chapter's folder and moves to a folder that held its old one (or the
-- top level): a lift never puts a track inside anything new, and never moves a track that no chapter folder holds.
local function lifts_only_out_of_chapters(before, after, guids, chapters)
  local was, now = core.folder_parents(before), core.folder_parents(after)
  for position = 1, #before do
    if was[position] ~= now[position] then
      local inside_chapter, reaches = false, now[position] == 0
      local ancestor = was[position]
      while ancestor ~= 0 do
        inside_chapter = inside_chapter or chapters[guids[ancestor]] == true
        reaches = reaches or (ancestor ~= was[position] and ancestor == now[position])
        ancestor = was[ancestor]
      end
      if not (inside_chapter and reaches) then
        return false
      end
    end
  end
  return true
end

local function chapter_folders(session_dir, run_id, mode, chapter_text, expected_text)
  if mode ~= 'preview' and mode ~= 'apply' then
    event(session_dir, 'ERROR', run_id, BAD_MODE)
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local chapters = {}
  for _, guid in ipairs(split_guids(chapter_text)) do
    chapters[guid] = true
  end
  local deltas = core.folder_deltas()
  local guids = {}
  for position = 1, #deltas do
    guids[position] = normalize_guid(reaper.GetTrackGUID(reaper.GetTrack(0, position - 1)))
  end
  local planned, lifted = plan_lifts(deltas, guids, chapters)
  if not lifts_only_out_of_chapters(deltas, planned, guids, chapters) then
    event(session_dir, 'ERROR', run_id, FOLDERS_UNSAFE)
    return
  end
  local was, now = core.folder_parents(deltas), core.folder_parents(planned)
  -- The chapters that change folder, in order: what the narrator confirmed, and what apply checks it still is.
  local moved = {}
  for position = 1, #deltas do
    if chapters[guids[position]] and was[position] ~= now[position] then
      moved[#moved + 1] = guids[position]
    end
  end
  if mode == 'apply' and table.concat(moved, ',') ~= table.concat(split_guids(expected_text), ',') then
    event(session_dir, 'FOLDERS_STALE', run_id)
    return
  end
  local function named(position)
    if position == 0 then
      return '', ''
    end
    local _, name = reaper.GetTrackName(reaper.GetTrack(0, position - 1))
    return guids[position], name
  end
  for position = 1, #deltas do
    if was[position] ~= now[position] then
      local guid, name = named(position)
      local from_guid, from_name = named(was[position])
      local to_guid, to_name = named(now[position])
      event(session_dir, 'FOLDER_MOVE', run_id, guid, name, from_guid, from_name, to_guid, to_name)
    end
  end
  if mode == 'preview' then
    event(session_dir, 'FOLDERS_PLANNED', run_id, #moved)
    return
  end
  if #lifted > 0 then
    reaper.Undo_BeginBlock2(0)
    for position, delta in ipairs(planned) do
      if delta ~= deltas[position] then
        reaper.SetMediaTrackInfo_Value(reaper.GetTrack(0, position - 1), 'I_FOLDERDEPTH', delta)
      end
    end
    reaper.Undo_EndBlock2(0, UNDO_FOLDERS, -1)
    reaper.UpdateArrange()
  end
  event(session_dir, 'FOLDERS_REPAIRED', run_id, #moved)
end

return function(registry)
  registry.register('track_create', function(ctx, args)
    track_create(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '', args[4] or '', args[5] or '', args[6] or '')
  end)
  registry.register('chapter_folders', function(ctx, args)
    chapter_folders(ctx.session_dir, args[1] or '', args[2] or '', args[3] or '', args[4] or '')
  end)
end
