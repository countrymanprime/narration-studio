-- Playing a stretch of a file on disk and showing a file, leaving the project unchanged. Master & QC's
-- "Play the quietest 5 s" and "Open in the DAW" act on rendered files that are not project items, so `navigate` cannot
-- reach them. Loaded by narration_ui_bridge.lua, which passes the shared helpers as the chunk argument.
--
-- preview_file_range(run, path, start, length) plays `length` seconds of the file from `start` through an SWS preview
-- (CF_CreatePreview), the path REAPER's Media Explorer uses, not through the project: nothing is inserted, no undo block
-- is opened and the project's transport, cursor and selection are not touched. One preview plays at a time; a new one
-- stops the last. A watcher stops it at the end of the stretch. stop_file_preview(run) stops it early.
--
-- reveal_file(run, path) selects the file in REAPER's Media Explorer (OpenMediaExplorer with play false), which does
-- not import it.
--
-- The host sends only a path the narrator picked; the script checks it again: an absolute local path (never a network
-- share, whose opening would send the narrator's Windows credentials to the server), with no `..` segment, to an
-- audio file that exists.
--
-- The calls are used as SWS's ReaScript.cpp and the REAPER SDK's reaper_plugin_functions.h describe them (read on GitHub,
-- 2026-10-12): CF_CreatePreview does not own its source, CF_Preview_Stop stops and destroys the preview, a preview whose
-- playback finished is destroyed at the end of the defer cycle, and OpenMediaExplorer with play false "will just select"
-- the file. Not run in REAPER (pending the QA pass, #1495): what CF_Preview_GetValue answers for a destroyed preview,
-- that the source may be freed one defer cycle after the stop, which output a preview plays through by default
-- (I_OUTCHAN), whether PCM_Source_CreateFromFile answers nil for a file REAPER cannot read, and that the Media Explorer
-- imports nothing.
--
-- Events: FILE_PREVIEW_STARTED|run|path|start|length (length shortened to the end of the file),
-- FILE_PREVIEW_STOPPED|run|stopped (1 when a preview was playing), FILE_REVEALED|run|path, or ERROR|run|sentence.

local core = ...
local event = core.event

-- The longest stretch a preview plays, in seconds; the host refuses a longer one before it is sent.
local MAX_SECONDS = 60

-- The audio files a narrator measures or renders (the host's resumelive.go list and Audacity's import formats).
local AUDIO_EXTENSIONS = { wav = true, wave = true, bwf = true, w64 = true, flac = true, mp3 = true, ogg = true, aif = true, aiff = true, wv = true }

local NOT_AUDIO = 'That is not an audio file this app can play or show.'
local GONE = 'The file is not there any more.'
local BAD_SECONDS = 'The stretch to play is not a usable number of seconds.'
local PAST_END = 'The stretch starts after the end of the file.'
local RECORDING = 'REAPER is recording. Stop recording first.'
local NEEDS_SWS = 'Playing part of a file needs the SWS extension in REAPER.'
local UNREADABLE = 'REAPER could not open the file to play it.'
local NO_EXPLORER = 'This REAPER version cannot show a file in its Media Explorer.'

local PREVIEW_API =
  { 'CF_CreatePreview', 'CF_Preview_SetValue', 'CF_Preview_GetValue', 'CF_Preview_Play', 'CF_Preview_Stop', 'GetMediaSourceLength', 'PCM_Source_Destroy' }

local function seconds(value)
  return string.format('%.6f', value)
end

-- A finite number, or nil.
local function number_from(text)
  local value = tonumber(text or '')
  if not value or value ~= value or value == math.huge or value == -math.huge then
    return nil
  end
  return value
end

-- An absolute local path (a drive letter, or `/` for the harness) to a file with an audio extension, with no network
-- share and no `..` segment.
local function usable_path(path)
  if type(path) ~= 'string' or path == '' then
    return false
  end
  if path:match('^[\\/][\\/]') then
    return false
  end
  if not (path:match('^%a:[\\/]') or path:match('^/')) then
    return false
  end
  for segment in path:gmatch('[^\\/]+') do
    if segment == '..' then
      return false
    end
  end
  local extension = path:match('%.([%w]+)$')
  return extension ~= nil and AUDIO_EXTENSIONS[extension:lower()] == true
end

-- nil when the path may be used, or the sentence that refuses it.
local function path_refusal(path)
  if not usable_path(path) then
    return NOT_AUDIO
  end
  if not core.file_exists(path) then
    return GONE
  end
  return nil
end

-- GetPlayState is a bit field (1 playing, 2 paused, 4 recording).
local function recording()
  return math.floor(reaper.GetPlayState() / 4) % 2 == 1
end

-- The preview this bridge is playing: { preview, source, finish }, or nil.
local state = { current = nil, exit_registered = false }

-- Frees a source one defer cycle after its preview stopped, so nothing of the preview still reads it when it goes.
local function free_later(source)
  reaper.defer(function()
    reaper.PCM_Source_Destroy(source)
  end)
end

-- Stops the current preview, if any; true when one was playing.
local function stop_current(free)
  local current = state.current
  if not current then
    return false
  end
  state.current = nil
  local playing = reaper.CF_Preview_GetValue(current.preview, 'D_POSITION')
  if playing then
    reaper.CF_Preview_Stop(current.preview)
  end
  free(current.source)
  return playing and true or false
end

local function watch(current)
  local function tick()
    if state.current ~= current then
      return
    end
    local ok, position = reaper.CF_Preview_GetValue(current.preview, 'D_POSITION')
    if not ok then
      -- Playback reached the end of the file and SWS destroyed the preview.
      state.current = nil
      reaper.PCM_Source_Destroy(current.source)
      return
    end
    if position >= current.finish then
      state.current = nil
      reaper.CF_Preview_Stop(current.preview)
      free_later(current.source)
      return
    end
    reaper.defer(tick)
  end
  reaper.defer(tick)
end

local function register_exit()
  if state.exit_registered or not reaper.atexit then
    return
  end
  state.exit_registered = true
  reaper.atexit(function()
    -- The script is ending: no later defer cycle will free the source, so it is freed now.
    stop_current(function(source)
      reaper.PCM_Source_Destroy(source)
    end)
  end)
end

local function preview_file_range(session_dir, run_id, path, start_text, length_text)
  local start, length = number_from(start_text), number_from(length_text)
  if not start or not length or start < 0 or length <= 0 or length > MAX_SECONDS then
    event(session_dir, 'ERROR', run_id, BAD_SECONDS)
    return
  end
  local refusal = path_refusal(path)
  if refusal then
    event(session_dir, 'ERROR', run_id, refusal)
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  for _, name in ipairs(PREVIEW_API) do
    if not reaper.APIExists(name) then
      event(session_dir, 'ERROR', run_id, NEEDS_SWS)
      return
    end
  end
  local source = reaper.PCM_Source_CreateFromFile(path)
  if not source then
    event(session_dir, 'ERROR', run_id, UNREADABLE)
    return
  end
  local file_length = reaper.GetMediaSourceLength(source)
  if start >= file_length then
    reaper.PCM_Source_Destroy(source)
    event(session_dir, 'ERROR', run_id, PAST_END)
    return
  end
  length = math.min(length, file_length - start)
  stop_current(free_later)
  local preview = reaper.CF_CreatePreview(source)
  reaper.CF_Preview_SetValue(preview, 'B_LOOP', 0)
  reaper.CF_Preview_SetValue(preview, 'D_POSITION', start)
  reaper.CF_Preview_Play(preview)
  local current = { preview = preview, source = source, finish = start + length }
  state.current = current
  register_exit()
  watch(current)
  event(session_dir, 'FILE_PREVIEW_STARTED', run_id, path, seconds(start), seconds(length))
end

local function stop_file_preview(session_dir, run_id)
  local stopped = stop_current(free_later)
  event(session_dir, 'FILE_PREVIEW_STOPPED', run_id, stopped and '1' or '0')
end

local function reveal_file(session_dir, run_id, path)
  local refusal = path_refusal(path)
  if refusal then
    event(session_dir, 'ERROR', run_id, refusal)
    return
  end
  if not reaper.APIExists('OpenMediaExplorer') then
    event(session_dir, 'ERROR', run_id, NO_EXPLORER)
    return
  end
  reaper.OpenMediaExplorer(path, false)
  event(session_dir, 'FILE_REVEALED', run_id, path)
end

return function(registry)
  registry.register('preview_file_range', function(ctx, args)
    preview_file_range(ctx.session_dir, args[1] or '', args[2] or '', args[3], args[4])
  end)
  registry.register('stop_file_preview', function(ctx, args)
    stop_file_preview(ctx.session_dir, args[1] or '')
  end)
  registry.register('reveal_file', function(ctx, args)
    reveal_file(ctx.session_dir, args[1] or '', args[2] or '')
  end)
end
