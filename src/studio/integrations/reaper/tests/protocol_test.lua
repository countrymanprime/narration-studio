-- The command loop itself: how a `.cmd` file becomes a dispatch, what is reported for a bad one, and when it stops.

local H = require('harness')

H.test('an unsupported protocol version is reported and the command is consumed', function()
  local s = H.session()
  s:send_raw('2|prepare_compare|run1')
  H.eq(s:events(), { { 'ERROR', '', 'Unsupported hub protocol' } })
  H.eq(s:pending_commands(), {})
end)

H.test('an empty command file is an unsupported protocol', function()
  local s = H.session()
  s:send_raw('')
  H.eq(s:events(), { { 'ERROR', '', 'Unsupported hub protocol' } })
end)

H.test('an unknown command name is reported', function()
  local s = H.session()
  s:send('frobnicate', 'run1')
  H.eq(s:events(), { { 'ERROR', 'run1', 'Unsupported workspace command' } })
end)

H.test('percent-encoded fields are decoded before dispatch', function()
  local s = H.session()
  -- A run ID with a pipe and a space survives the round trip into an event.
  s:send('read_line_ids', 'run|1 x', s:path('lines out.txt'))
  local events = s:events()
  H.eq(events[1][1], 'LINES_READ')
  H.eq(events[1][2], 'run|1 x')
  H.eq(events[1][3], s:path('lines out.txt'))
  H.eq(events[1][4], '0')
end)

H.test('events are percent-encoded on the way out', function()
  local s = H.session()
  s:send('read_line_ids', 'a|b', s:path('out.txt'))
  local raw = H.read_text(s:path('events.log'))
  H.contains(raw, 'LINES_READ|a%7Cb|', 'the pipe in a field must not split the event')
end)

H.test('the bridge polls again after every tick until told to close', function()
  local s = H.session()
  H.eq(#s.fake.deferred, 1, 'run() queues the first tick')
  s:tick()
  H.eq(#s.fake.deferred, 1, 'and each tick queues the next')
end)

H.test('close stops the loop and queues nothing more', function()
  local s = H.session()
  s:send('close')
  H.eq(#s.fake.deferred, 0)
  H.eq(s:events(), {})
end)

H.test('commands in one tick run in file-name order', function()
  local s = H.session()
  H.write_file(H.join(H.join(s.dir, 'commands'), '00000002.cmd'), '1|read_line_ids|second|' .. H.encode(s:path('b.txt')) .. '\n')
  H.write_file(H.join(H.join(s.dir, 'commands'), '00000001.cmd'), '1|read_line_ids|first|' .. H.encode(s:path('a.txt')) .. '\n')
  s:tick()
  local events = s:events()
  H.eq({ events[1][2], events[2][2] }, { 'first', 'second' })
  H.eq(s:pending_commands(), {})
end)

-- Lua reads a text-mode file with CRLF as LF on Windows and leaves the CR on Linux, so this only bites there: the
-- bridge strips it itself (a command file from an editor, or a payload written on another platform).
H.test('a command file with a Windows line ending is read cleanly', function()
  local s = H.session()
  local out = s:path('lines.txt')
  s:send_raw('1|read_line_ids|run1|' .. H.encode(out) .. '\r')
  H.eq(s:events(), { { 'LINES_READ', 'run1', out, '0' } })
end)

H.test('files that are not .cmd are left alone', function()
  local s = H.session()
  H.write_file(H.join(H.join(s.dir, 'commands'), '00000001.cmd.tmp'), '1|close\n')
  s:tick()
  H.eq(s:pending_commands(), { '00000001.cmd.tmp' })
  H.eq(#s.fake.deferred, 1, 'a half-written command never closes the bridge')
end)

H.test('only the first line of a command file is read', function()
  local s = H.session()
  s:send_raw('1|read_line_ids|run1|' .. H.encode(s:path('out.txt')) .. '\n1|close')
  H.eq(#s.fake.deferred, 1)
  H.eq(#s:events(), 1)
end)

H.test('a command with more than eight fields keeps the surplus in the last field', function()
  local s = H.session()
  -- stamp_item_lines reads fields 3..5; the eighth absorbs the rest and must not break the split.
  s:send_raw('1|stamp_item_lines|run1|missing.txt|0|x|y|z|extra|fields')
  H.eq(s:events(), { { 'ERROR', 'run1', 'The manuscript line list was not found.' } })
end)

H.test('an error for a command sent without a run ID carries an empty one, so the host can still route it', function()
  local s = H.session()
  s:send('read_line_ids')
  H.eq(s:events(), { { 'ERROR', '', 'Could not write the manuscript line report.' } })
end)

-- REAPER caches a directory listing until EnumerateFiles(dir, -1) clears it. A command that was already read and
-- removed can still be listed; that must not be reported to the host as a protocol error.
H.test('a listed command file that has already been removed is skipped silently', function()
  local s = H.session()
  s.fake:add_stale_listing(H.join(s.dir, 'commands'), '00000000.cmd')
  s:send('read_line_ids', 'run1', s:path('lines.txt'))
  H.eq(s:events(), { { 'LINES_READ', 'run1', s:path('lines.txt'), '0' } })
end)

H.test('a command written after an earlier one is picked up: the listing is refreshed on every tick', function()
  local s = H.session()
  s:send('read_line_ids', 'first', s:path('a.txt'))
  s:send('read_line_ids', 'second', s:path('b.txt'))
  s:send('read_line_ids', 'third', s:path('c.txt'))
  local runs = {}
  for _, event in ipairs(s:events()) do
    runs[#runs + 1] = event[2]
  end
  H.eq(runs, { 'first', 'second', 'third' })
end)

-- A session that counts how often events.log is opened from the moment a command's handler is called until the tick
-- moves on to the next command or the heartbeat (#2251: one open per line made a 1000-item read hold REAPER for about 40 ms
-- in REAPER 7.82, docs/research/reaper-bridge-performance.md). `extra(registry)` registers test commands.
local function counting_session(options, extra)
  local counter = { opens = 0 }
  local real_open = io.open
  options = options or {}
  options.setup = function(registry)
    if extra then
      extra(registry)
    end
    local lookup = registry.lookup
    registry.lookup = function(name)
      local handler = lookup(name)
      return handler
        and function(ctx, args)
          counter.opens = 0
          io.open = function(path, mode)
            if tostring(path):match('events%.log$') then
              counter.opens = counter.opens + 1
            end
            return real_open(path, mode)
          end
          handler(ctx, args)
        end
    end
  end
  local s = H.session(options)
  -- The opens counted for the last command: everything up to the end of its tick, the bridge's own write of its answer included.
  function counter.last(send)
    send()
    io.open = real_open
    return counter.opens
  end
  return s, counter
end

H.test("a command's events reach events.log in one append, in the order it sent them", function()
  local s, counter = counting_session(nil, function(registry)
    registry.register('emit_many', function(ctx, args)
      for index = 1, 500 do
        ctx.event('ROW', args[1], index)
      end
      ctx.event('ROWS_END', args[1])
    end)
  end)
  s:events()
  local opens = counter.last(function()
    s:send('emit_many', 'r1')
  end)
  local events = s:events()
  -- At most one more: the heartbeat, when it falls due in the same tick.
  H.eq(opens <= 2, true, 'events.log opened ' .. opens .. ' times for one command')
  H.eq(#events, 501)
  for index = 1, 500 do
    H.eq(events[index], { 'ROW', 'r1', tostring(index) })
  end
  H.eq(events[501], { 'ROWS_END', 'r1' })
end)

H.test('chapter_track_state of a track with 300 items appends its answer in one write', function()
  local s, counter = counting_session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local retakes = s.fake:add_track('Retakes')
  for index = 0, 299 do
    s.fake:add_item(retakes, { position = index * 5, length = 4, source = 'take.wav' })
  end
  s:events()
  local opens = counter.last(function()
    s:send('chapter_track_state', 't1', retakes.guid)
  end)
  local events = s:events()
  H.eq(opens <= 2, true, 'events.log opened ' .. opens .. ' times for one read')
  H.eq(#events, 302)
  H.eq(events[1][1], 'TRACK_STATE')
  H.eq(events[302], { 'TRACK_STATE_END', 't1', '300', '300' })
end)

H.test('the events a command sent before it failed are written before the error ends the tick', function()
  local s = H.session({
    setup = function(registry)
      registry.register('half_way', function(ctx, args)
        ctx.event('STARTED', args[1])
        error('half_way broke')
      end)
    end,
  })
  s:events()
  local ok, err = pcall(function()
    s:send('half_way', 'r1')
  end)
  H.eq(ok, false)
  H.contains(tostring(err), 'half_way broke')
  H.eq(s:events(), { { 'STARTED', 'r1' } })
end)

H.test("an event sent from a feature's own defer callback, outside a command, is written at once", function()
  local s = H.session({
    setup = function(registry)
      registry.register('later', function(ctx, args)
        reaper.defer(function()
          ctx.event('LATER', args[1])
        end)
      end)
    end,
  })
  s:send('later', 'r1')
  H.eq(s:events(), {})
  s:tick()
  H.eq(s:events(), { { 'LATER', 'r1' } })
end)

-- encode is on the path of every event field (a 1000-item track read encodes about 8000), so it is a table lookup per
-- character (#2251, docs/research/reaper-bridge-performance.md); its output must stay exactly what the host decodes.
H.test('encode percent-encodes every byte as the host expects, and decode reverses it', function()
  H.session()
  local core = dofile(H.join(host.reaper_dir, 'narration_bridge_core.lua'))
  for byte = 0, 255 do
    local char = string.char(byte)
    H.eq(core.encode(char), H.encode(char), 'byte ' .. byte)
    H.eq(core.decode(core.encode(char)), char, 'byte ' .. byte)
  end
  local mixed = 'C:\\Audio\\Chapter 1|take 2 – “שלום” 🎙.wav'
  H.eq(core.encode(mixed), H.encode(mixed))
  H.eq(core.decode(core.encode(mixed)), mixed)
  H.eq(core.encode(nil), '')
  H.eq(core.encode(12.5), '12.5')
  H.eq(core.encode('plain-text_1.0~'), 'plain-text_1.0~')
end)
