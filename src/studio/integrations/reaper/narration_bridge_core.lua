-- Shared helpers and the command registry of the REAPER bridge (narration_ui_bridge.lua and the feature files it
-- loads: narration_compare.lua, narration_line_identity.lua). The protocol helpers here match bridge.go: fields are
-- percent-encoded and separated by `|`, and each event is one line of events.log; a command's events are appended together (`batched`).

local M = {}
local SEP = package.config:sub(1, 1)
local function join(base, child)
  return base .. SEP .. child
end

-- The product name and the identity values (narration_brand.lua, generated from config/brand.json), read from this file's
-- own folder. Feature files reach it as core.brand.
local function own_directory()
  local source = debug and debug.getinfo and debug.getinfo(1, 'S').source or ''
  local path = source:match('^@(.+)$')
  if not path then
    local _, action_path = reaper.get_action_context()
    path = action_path
  end
  return (path or ''):match('^(.*)[\\/][^\\/]-$') or '.'
end
M.brand = dofile(join(own_directory(), 'narration_brand.lua'))
local BRAND = M.brand

-- Every byte's %XX form, looked up by gsub for the bytes outside RFC 3986's unreserved set: a table, not a function, since
-- encode runs for every field of every event and a function call plus a string.format per byte was about 14 ms of a
-- 1000-item chapter_track_state in REAPER 7.82 (docs/research/reaper-bridge-performance.md).
local PERCENT = {}
for byte = 0, 255 do
  PERCENT[string.char(byte)] = string.format('%%%02X', byte)
end
local function encode(value)
  return tostring(value or ''):gsub('[^%w%-_%.~]', PERCENT)
end
local function decode(value)
  return (tostring(value or ''):gsub('%%(%x%x)', function(hex)
    return string.char(tonumber(hex, 16))
  end))
end
local function split(line, count)
  local fields, start = {}, 1
  while #fields < count - 1 do
    local at = line:find('|', start, true)
    if not at then
      break
    end
    fields[#fields + 1], start = decode(line:sub(start, at - 1)), at + 1
  end
  fields[#fields + 1] = decode(line:sub(start):gsub('[\r\n]+$', ''))
  return fields
end
local function append(path, text)
  local handle = io.open(path, 'a')
  if handle then
    handle:write(text)
    handle:close()
  end
end
-- The lines events sent while `batched` runs a command, by file, and the files in the order each was first written.
-- nil when no command is running: an event then goes to its file at once.
local held = nil
local function event(session_dir, tag, ...)
  local values = { tag }
  for _, value in ipairs({ ... }) do
    values[#values + 1] = encode(value)
  end
  local path, line = join(session_dir, 'events.log'), table.concat(values, '|') .. '\n'
  if not held then
    append(path, line)
    return
  end
  local lines = held.lines[path]
  if not lines then
    lines = {}
    held.lines[path] = lines
    held.order[#held.order + 1] = path
  end
  lines[#lines + 1] = line
end
-- Runs fn(...) with the events it sends held, then appends them to events.log in one write, also when fn raises (the
-- error is raised again after the write). Opening the file once per line cost a 1000-item chapter_track_state about 4000
-- file system calls and 13 ms of REAPER's main thread in REAPER 7.82 (docs/research/reaper-bridge-performance.md). The lines and their
-- order are unchanged; the host may read a long write half-way, and its reader keeps a partial last line for the next read
-- (events.go, newEventLines). A batch inside a batch joins the outer one.
local function batched(fn, ...)
  if held then
    return fn(...)
  end
  held = { lines = {}, order = {} }
  local ok, err = pcall(fn, ...)
  local done = held
  held = nil
  for _, path in ipairs(done.order) do
    append(path, table.concat(done.lines[path]))
  end
  if not ok then
    error(err, 0)
  end
end
local JSON_ESCAPES = { ['\\'] = '\\\\', ['"'] = '\\"', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
local function json_escape(value)
  return (tostring(value or ''):gsub('[\\"\n\r\t]', JSON_ESCAPES))
end
-- One JSON line per bridge command at debug level, correlated by the host's run id (runlog.Run.ID(), a
-- different id than the per-request one `event` above carries) so a "Copy diagnostics" bundle can show REAPER's side of
-- a run next to the host's run.jsonl and a sidecar's stderr. A no-op unless the host asked for debug (level == 'debug')
-- and sent a run id; `fields` is an ordered list of {key, value} string pairs (ordered, not a table, so a test can read
-- them back deterministically). The same content rule as the host's run log (threat-model row 7a) applies:
-- ids, counts, tags and refusal reasons only, never project text.
local function debug_log(session_dir, run_id, level, event_name, fields)
  if level ~= 'debug' or not run_id or run_id == '' then
    return
  end
  local parts = {
    '"ts":"' .. os.date('!%Y-%m-%dT%H:%M:%S') .. '.000Z"',
    '"level":"debug"',
    '"run":"' .. json_escape(run_id) .. '"',
    '"event":"' .. json_escape(event_name) .. '"',
  }
  for _, pair in ipairs(fields or {}) do
    parts[#parts + 1] = '"' .. json_escape(pair[1]) .. '":"' .. json_escape(pair[2]) .. '"'
  end
  local handle = io.open(join(session_dir, 'bridge.jsonl'), 'a')
  if handle then
    handle:write('{' .. table.concat(parts, ',') .. '}\n')
    handle:close()
  end
end
-- reaper.EnumerateFiles caches a directory's listing until it is called with index -1: without that, a file created
-- after the first call is not listed and a removed one still is (seen in REAPER 7.80), so a command would be read late
-- or as a ghost. The clear comes first on every call.
local function command_files(directory)
  reaper.EnumerateFiles(directory, -1)
  local names, index = {}, 0
  while true do
    local name = reaper.EnumerateFiles(directory, index)
    if not name or name == '' then
      break
    end
    if name:match('%.cmd$') then
      names[#names + 1] = name
    end
    index = index + 1
  end
  table.sort(names)
  return names
end
local function file_exists(path)
  local f = io.open(path, 'rb')
  if f then
    f:close()
    return true
  end
  return false
end
local function dirname(path)
  return path:match('^(.*)[\\/][^\\/]-$') or ''
end
local function safe_name(value)
  return (value:gsub('[<>:"/\\|?*]', '_'))
end
local function color(hex)
  local r, g, b = tonumber((hex or ''):sub(1, 2), 16) or 0, tonumber((hex or ''):sub(3, 4), 16) or 0, tonumber((hex or ''):sub(5, 6), 16) or 0
  -- ColorToNative returns an RGB value below bit 24; adding the custom-color
  -- flag is equivalent to setting that bit and keeps this bridge Lua 5.1-safe.
  return reaper.ColorToNative(r, g, b) + 0x1000000
end
local function pipe_fields(value, count)
  local out, start = {}, 1
  while #out < count - 1 do
    local at = value:find('|', start, true)
    if not at then
      break
    end
    out[#out + 1], start = value:sub(start, at - 1), at + 1
  end
  out[#out + 1] = value:sub(start)
  return out
end

-- A take marker's issue prefix: "MISREAD: ..." is MISREAD. Case-insensitive, empty when the name has none.
local function marker_kind(name)
  local prefix = tostring(name or ''):match('^%s*([%a_]+)%s*:')
  return prefix and prefix:upper() or ''
end
-- The name of a marker `take` already has for `kind` near `srcpos`, or nil: the same issue prefix within 0.15 s of source
-- time (docs/architecture/daw-integration.md). Transcript Compare's export and the Review page's approved marker
-- (narration_navigation.lua) both skip a marker this finds, so neither ever doubles one.
local function existing_take_marker(take, kind, srcpos)
  local count = reaper.GetNumTakeMarkers(take)
  for index = 0, count - 1 do
    local marker_pos, marker_name = reaper.GetTakeMarker(take, index)
    if marker_kind(marker_name) == tostring(kind or ''):upper() and math.abs(marker_pos - srcpos) <= 0.15 then
      return marker_name
    end
  end
  return nil
end

-- The undo-point label each kind of app action closes its undo block with, by the kind the host names it by
-- (dawport's action kinds). narration_range.lua writes them and narration_undo.lua undoes only a point whose label is
-- exactly one of them: the table is fixed here, so no string the host sends can widen what may be undone.
local UNDO_LABELS = {
  cut_range = BRAND.name .. ': delete words',
  replace_range = BRAND.name .. ': replace audio',
  restore_replacement = BRAND.name .. ': put audio back',
  -- Keep Take / Use this take: set_active_take (narration_workspace.lua) and pick_retake_lane (narration_retake_lanes.lua) both close with it.
  use_take = BRAND.name .. ': use take',
  -- The chain edits Editing's Undo reads back (narration_range.lua closes each block with the label of its kind).
  add_range_fx = BRAND.name .. ': add chain to range',
  remove_range_fx = BRAND.name .. ': remove chain from range',
  set_fx_param = BRAND.name .. ': change effect setting',
  bypass_fx = BRAND.name .. ': bypass effect',
  enable_fx = BRAND.name .. ': turn effect back on',
}
local function undo_label(kind)
  if type(kind) ~= 'string' then
    return nil
  end
  return rawget(UNDO_LABELS, kind)
end

-- The registry maps a command name to a handler `handler(ctx, args)`: `ctx` carries the session directory, `event`
-- (append an event to events.log) and `stop` (end the loop); `args` are the command's fields after its name. A
-- name may be registered once, so two features cannot silently shadow each other's command.
function M.new_registry()
  local commands = {}
  local registry = {}
  function registry.register(name, handler)
    if type(name) ~= 'string' or name == '' then
      error('a bridge command needs a name', 2)
    end
    if type(handler) ~= 'function' then
      error('bridge command ' .. name .. ' needs a handler function', 2)
    end
    if commands[name] then
      error('bridge command ' .. name .. ' is already registered', 2)
    end
    commands[name] = handler
  end
  function registry.lookup(name)
    return commands[name]
  end
  function registry.names()
    local out = {}
    for name in pairs(commands) do
      out[#out + 1] = name
    end
    table.sort(out)
    return out
  end
  return registry
end

-- Loads an FX chain through `add(candidate)`, which is TrackFX_AddByName or TakeFX_AddByName with its other arguments bound
-- and answers the first new FX's index, or -1. REAPER 7.82 on Linux loads a chain by its name relative to FXChains (forward
-- slashes, the extension) and answers -1 for the file's full path (the real-REAPER CI run, 2026-10-19), so the listed name goes
-- first and the full path is the fallback for a REAPER that behaves the other way round. Answers the index, or -1.
function M.add_chain(add, name, path)
  local index = add(name)
  if index < 0 and path then
    index = add(path)
  end
  return index
end

-- `track` followed by every track inside it when it is a folder: the tracks after it until its folder depth closes, read from
-- I_FOLDERDEPTH (1 opens a folder, 0 changes nothing, -N closes N levels; REAPER 7.82, docs/research/2026-10-30-booth-sub-track-recording.md,
-- section 6a, row 1). A track that is not a folder answers itself alone. Reads only.
function M.with_descendants(track)
  local out = { track }
  local depth = reaper.GetMediaTrackInfo_Value(track, 'I_FOLDERDEPTH')
  if depth <= 0 then
    return out
  end
  local count = reaper.CountTracks(0)
  local index = 0
  while index < count and reaper.GetTrack(0, index) ~= track do
    index = index + 1
  end
  index = index + 1
  while depth > 0 and index < count do
    local inner = reaper.GetTrack(0, index)
    out[#out + 1] = inner
    depth = depth + reaper.GetMediaTrackInfo_Value(inner, 'I_FOLDERDEPTH')
    index = index + 1
  end
  return out
end

-- The parent of each track, by 1-based position (0 at the top level), from a list of folder depth changes (I_FOLDERDEPTH, one per track in
-- order): what REAPER shows as each track's folder. A close past the top level stays at the top level, as REAPER reads it. Reads only.
function M.folder_parents(deltas)
  local out, stack, depth = {}, {}, 0
  for position, delta in ipairs(deltas) do
    out[position] = stack[depth] or 0
    if delta > 0 then
      stack[depth + 1] = position
    end
    depth = math.max(depth + delta, 0)
  end
  return out
end

-- Every track's I_FOLDERDEPTH, in order.
function M.folder_deltas()
  local out = {}
  for index = 0, reaper.CountTracks(0) - 1 do
    out[#out + 1] = reaper.GetMediaTrackInfo_Value(reaper.GetTrack(0, index), 'I_FOLDERDEPTH')
  end
  return out
end

-- True when `after` (the depth changes with one track inserted at 1-based position `at`) leaves every other track in the folder it was in
-- before, and puts the new track in `parent` (a 1-based position in `before`, or 0 for the top level). The guard every track insert passes
-- before it writes anything: a structure that would move a chapter into another chapter's folder is refused, never written (#2251).
function M.insert_keeps_parents(before, after, at, parent)
  local was, now = M.folder_parents(before), M.folder_parents(after)
  -- A position in `before` is one further in `after` from the insert on.
  local function shifted(position)
    if position >= at then
      return position + 1
    end
    return position
  end
  for position = 1, #before do
    local old = was[position]
    if now[shifted(position)] ~= (old == 0 and 0 or shifted(old)) then
      return false
    end
  end
  return now[at] == (parent == 0 and 0 or shifted(parent))
end

-- Adds a track at the end of the project, at the top level, and answers it and its 0-based index. A project can end inside an open folder
-- (REAPER 7.82 accepts a last track whose I_FOLDERDEPTH leaves a folder open and closes it at the end), and a track appended there lands
-- inside that folder, so every chapter added afterwards would nest under the last chapter's folder (#2251). The previous last track closes
-- every folder still open instead, which changes no track's folder. Call it inside the caller's undo block.
function M.append_track()
  local count = reaper.CountTracks(0)
  local open = 0
  for _, delta in ipairs(M.folder_deltas()) do
    open = math.max(open + delta, 0)
  end
  if count > 0 and open > 0 then
    local last = reaper.GetTrack(0, count - 1)
    reaper.SetMediaTrackInfo_Value(last, 'I_FOLDERDEPTH', reaper.GetMediaTrackInfo_Value(last, 'I_FOLDERDEPTH') - open)
  end
  reaper.InsertTrackAtIndex(count, false)
  return reaper.GetTrack(0, count), count
end

-- The bridge's own cursor moves (set_cursor, punch_to) told to every module that listens: narration_transport.lua's stop
-- guard puts back a seek REAPER makes to a take's start just after a stop, and must never undo a move the app asked for
-- (docs/research/2026-10-30-booth-sub-track-recording.md, section 6b). Modules share this core, so one list serves them all;
-- each bridge start loads a fresh core (narration_ui_bridge.lua's dofile), so listeners never stack across starts.
local cursor_listeners = {}
function M.on_cursor_moved(listener)
  cursor_listeners[#cursor_listeners + 1] = listener
end
function M.cursor_moved()
  for _, listener in ipairs(cursor_listeners) do
    listener()
  end
end

M.SEP = SEP
M.join = join
M.encode = encode
M.decode = decode
M.split = split
M.event = event
M.batched = batched
M.debug_log = debug_log
M.command_files = command_files
M.file_exists = file_exists
M.dirname = dirname
M.safe_name = safe_name
M.color = color
M.pipe_fields = pipe_fields
M.marker_kind = marker_kind
M.existing_take_marker = existing_take_marker
M.undo_label = undo_label

return M
