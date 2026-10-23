# REAPER bridge harness tests

These tests run the bridge and the launcher under Lua 5.4 against a fake `reaper` table. What each file does, how to run them and what they cannot prove are in [the REAPER bridge](../../../docs/architecture/reaper-bridge.md#the-harness).

## Writing a test

```lua
local H = require('harness')

H.test('stamp_item_lines reports a GUID that no longer resolves', function()
  local s = H.session({ project_path = H.join(host.tmpdir(), 'Book.rpp') })
  local item = s.fake:add_item(s.fake:add_track('Narrator'), { guid = '{AAAAAAAA-0000-4000-8000-000000000001}' })
  s:send('stamp_item_lines', 't1', payload_path, '0')
  H.eq(s:events(), { { 'LINES_STALE', 't1', '{FFFFFFFF-0000-4000-8000-00000000FFFF}' }, { 'LINES_STAMPED', 't1', '0', '0', '1', '0' } })
  H.eq(item.ext, {})
end)
```

Write the test first for a new or changed command, watch it fail, then change the Lua. Assert what the narrator would notice: the events, the item extension data, the undo labels and count, and that a second send changes nothing. When a guard exists to protect data (a stale GUID, an overwrite, a duplicate marker), add an entry to `mutations.json` that removes it.
