-- Read and undo the app's own last actions in REAPER's undo history, over the bridge: the DAW port's undo_last capability.
-- Loaded by narration_ui_bridge.lua, which passes the shared helpers as the chunk argument.
--
-- A kind is the name the host gives a kind of app action (cut_range). Its undo label is the one narration_bridge_core.lua's
-- fixed table holds for it (cut_range: "Narration Utils: delete words", the label delete_range closes its block with). A kind
-- not in that table, including a label sent in its place, is refused with ERROR before REAPER is read, so the host cannot name
-- a label of its own choosing and these commands cannot undo anything but the app's own points.
--
-- last_action(run, kind) reads the next undo point's label with Undo_CanUndo2(0) and answers LAST_ACTION|run|kind|this when it
-- is exactly the kind's label, else LAST_ACTION|run|kind|other (another label, or no undo history). It changes nothing, and it
-- reads while REAPER records.
--
-- undo_last(run, kind, steps) undoes up to steps (a whole number, 1 to MAX_STEPS) points from the top of the history, one at a
-- time: before each it reads the top label again with Undo_CanUndo2(0) and stops at the first that is not exactly the kind's
-- label, or when there is none, so it never undoes past a point the narrator or another command made. Each step is
-- Undo_DoUndo2(0); one that answers 0 stops the run. It answers UNDONE_LAST|run|kind|steps|undone, undone being how many points
-- it undid (0 when the top was not the kind's: nothing changed). It opens no undo block, and refuses while REAPER records.
--
-- Neither answer carries a label read from the project: it is the narrator's text (threat model row 5f), and the host needs
-- only whether it matched.
--
-- Not run in REAPER (pending the QA pass, #1495): whether one Undo_DoUndo2 reverses a delete_range block in one step, the
-- Cuts-track move and the close-up included; whether Undo_CanUndo2 names "Narration Utils: delete words" right after a cut;
-- what Undo_CanUndo2 answers with no undo history (the reference says NULL); and whether GetProjectStateChangeCount rises after
-- an Undo_DoUndo2, so the app notices the project changed. S0 saw Undo_CanUndo2 name a bridge block's label right after it
-- closed and one Undo_DoUndo2 undo it (docs/research/reaper-spike-s0-item-extension-data.md).

local core = ...
local event = core.event

-- The most points one undo_last undoes: the DAW port's MaxUndoSteps.
local MAX_STEPS = 12

local BAD_KIND = 'That is not an action this app can undo.'
local BAD_STEPS = 'The number of undo steps must be a whole number from 1 to 12.'
local RECORDING = 'REAPER is recording. Stop recording first.'

local function recording()
  return math.floor(reaper.GetPlayState() / 4) % 2 == 1
end

-- A whole number of steps from 1 to MAX_STEPS written as plain digits, or nil.
local function steps_from(text)
  if type(text) ~= 'string' or not text:match('^%d+$') then
    return nil
  end
  local steps = tonumber(text)
  if steps < 1 or steps > MAX_STEPS then
    return nil
  end
  return steps
end

-- Whether the next undo point's label is exactly label.
local function on_top(label)
  return reaper.Undo_CanUndo2(0) == label
end

local function last_action(session_dir, run_id, kind)
  local label = core.undo_label(kind)
  if not label then
    event(session_dir, 'ERROR', run_id, BAD_KIND)
    return
  end
  event(session_dir, 'LAST_ACTION', run_id, kind, on_top(label) and 'this' or 'other')
end

local function undo_last(session_dir, run_id, kind, steps_text)
  local label = core.undo_label(kind)
  if not label then
    event(session_dir, 'ERROR', run_id, BAD_KIND)
    return
  end
  local steps = steps_from(steps_text)
  if not steps then
    event(session_dir, 'ERROR', run_id, BAD_STEPS)
    return
  end
  if recording() then
    event(session_dir, 'ERROR', run_id, RECORDING)
    return
  end
  local undone = 0
  while undone < steps and on_top(label) do
    local done = reaper.Undo_DoUndo2(0)
    if not done or done == 0 then
      break
    end
    undone = undone + 1
  end
  if undone > 0 then
    reaper.UpdateArrange()
  end
  event(session_dir, 'UNDONE_LAST', run_id, kind, steps, undone)
end

return function(registry)
  registry.register('last_action', function(ctx, args)
    last_action(ctx.session_dir, args[1] or '', args[2])
  end)
  registry.register('undo_last', function(ctx, args)
    undo_last(ctx.session_dir, args[1] or '', args[2], args[3])
  end)
end
