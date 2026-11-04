-- The live track list, over the bridge: tracks_read. Loaded by narration_ui_bridge.lua, which passes the shared helpers as the
-- chunk argument.
--
-- tracks_read|run lists every track of the open project as REAPER has it now, saved or not, so a track or folder the narrator
-- adds in REAPER shows in the app's Chapter links before the project is saved (#2840). Read-only: it opens no undo block and
-- sets nothing. A track's name is P_NAME, empty for a track the narrator never named (the saved .rpp's NAME), never REAPER's
-- "Track N" display name. folderDelta is I_FOLDERDEPTH: 1 opens a folder, 0 none, -N closes N levels.
--
-- Events: TRACKS_READ|run|rpp|unsaved|changeCount, then TRACKS_ROW|run|index|guid|name|folderDelta per track (at most
-- TRACK_LIMIT), then TRACKS_READ_END|run|listed|total.

local core = ...
local event = core.event

-- An audiobook project holds tens of tracks; the limit keeps one answer from flooding events.log if a project holds thousands.
local TRACK_LIMIT = 2000

local function normalize_guid(guid)
  local bare = tostring(guid or ''):gsub('[{}%s]', ''):upper()
  if bare == '' then
    return ''
  end
  return '{' .. bare .. '}'
end

local function tracks_read(session_dir, run_id)
  for _, name in ipairs({ 'CountTracks', 'GetTrack', 'GetTrackGUID', 'GetProjectStateChangeCount' }) do
    if not reaper.APIExists(name) then
      event(session_dir, 'ERROR', run_id, 'This REAPER version cannot list its tracks.')
      return
    end
  end
  local _, rpp = reaper.EnumProjects(-1, '')
  rpp = rpp or ''
  event(session_dir, 'TRACKS_READ', run_id, rpp, rpp == '' and 1 or 0, reaper.GetProjectStateChangeCount(0))
  local total = reaper.CountTracks(0)
  local listed = math.min(total, TRACK_LIMIT)
  for index = 0, listed - 1 do
    local track = reaper.GetTrack(0, index)
    local _, name = reaper.GetSetMediaTrackInfo_String(track, 'P_NAME', '', false)
    event(
      session_dir,
      'TRACKS_ROW',
      run_id,
      index,
      normalize_guid(reaper.GetTrackGUID(track)),
      name or '',
      math.floor(reaper.GetMediaTrackInfo_Value(track, 'I_FOLDERDEPTH'))
    )
  end
  event(session_dir, 'TRACKS_READ_END', run_id, listed, total)
end

return function(registry)
  registry.register('tracks_read', function(ctx, args)
    tracks_read(ctx.session_dir, args[1] or '')
  end)
end
