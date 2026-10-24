# REAPER: choosing any plug-in for a range of words in REAPER's own FX dialog

**Status: done, 2026-10-24. Observed in REAPER 7.82 on Linux (`linux-x86_64`) under xvfb with the audio device closed; a different version or platform may differ, and nothing here was run on Windows.** Asked for by [#2251](https://github.com/countrymanprime/narration-studio/issues/2251), with the owner's decision: "i think we should be able to pull any FX that reaper has. but we will likely need to open the item FX dialog and choose the FX we want from there for best support".

## What it settles

| Question | Answer |
| --- | --- |
| Which action opens a take's FX dialog? | 40638, "Item: Show FX chain for item take" (`kbd_getTextFromCmd` against `SectionFromUniqueID(0)`). It acts on the selected items. |
| What does it open for a take with no FX? | REAPER's "Add FX to Item" browser: every installed plug-in, the narrator's folders, a filter box, **Add** and **Cancel**. The chain window does not open yet (`TakeFX_GetChainVisible` answers -1, hidden). |
| And for a take that already has FX? | The take's FX chain window, with its **Add** button (`TakeFX_GetChainVisible` answers the shown FX's index). A second 40638 leaves it open; it does not toggle. |
| Does `Main_OnCommand(40638)` wait for the narrator? | No, on Linux: it returned at once with the browser open, and the bridge answered further commands while it stayed open. Whether Windows REAPER blocks there is unverified. |
| Does the FX go on the item that was selected when the dialog opened? | Yes. The bridge selected only the piece, ran 40638 and put the narrator's selection back at once; ReaComp, chosen afterwards, went on that piece only. |
| What happens when the narrator clicks Add? | The plug-in is appended to the take, the chain window opens on it, and REAPER adds its own undo point, `Add FX: Item on track 1 Chapter 1: ReaComp`. One REAPER Undo removes it and closes the window. |
| And Cancel? | Nothing: no FX, no window, no undo point. The bridge cannot tell a cancelled browser from one still open (no ReaScript call reports that window without an extension). |
| Can `TakeFX_Show(take, 0, 1)` do it without an action? | It opens the take's chain window, empty, with no browser: the narrator then clicks **Add** for the same browser. It needs no selection and no `Main_OnCommand`, so it is the fallback when action 40638's text is not the expected one. Showing changed nothing (`GetProjectStateChangeCount` unchanged). |
| Does closing the chain window change the project? | Closing it with `TakeFX_Show(take, 0, 0)` added a REAPER undo point, `Close FX chain: Item on track 1 Chapter 1`, and raised the change count. The bridge therefore never closes it; the narrator does. A close with the mouse was not run (xvfb has no window manager), so whether it adds the same point is unverified. |
| Can the chain be read back? | Yes, while the window is open or after: `TakeFX_GetCount`, `TakeFX_GetFXName` (`VST: ReaEQ (Cockos)`), `TakeFX_GetFXGUID`, `TakeFX_GetEnabled`, `TakeFX_GetNumParams` (19 for ReaEQ) and `TakeFX_GetChainVisible`. `TakeFX_GetNamedConfigParm(…, 'fx_ident')` answers the plug-in's file path, so the bridge does not send it. |
| What does a split do to a take's FX? | Each piece gets a copy of the FX, and the copies keep the **same FX GUID** as the original (`TakeFX_GetFXGUID` equal on the left piece and the middle piece). An FX GUID names an FX only within one take. |
| What does a range of words need? | The same split `apply_fx_range` makes: the browser adds to a whole take, so the item is split at both ends of the range first, in the app's one undo block, and the dialog opens on the middle piece. A plug-in the piece inherited from the item (above) is not the narrator's choice: the bridge records the GUIDs on the piece when it opens the dialog and counts only FX added after. |
| Undo order | The app's split (`<app name>: ...`), then REAPER's `Add FX: ...` for each plug-in chosen. Undoing in REAPER removes the plug-ins first and rejoins the item second. |
| Do selection changes add an undo point? | `SetMediaItemSelected` adds none (the change count rises, the label stays). `SelectAllMediaItems(0, false)` that unselects anything outside an undo block adds REAPER's own `Unselect all items` point, so the bridge unselects item by item. |
| What happens to the open chain window when the piece goes? | `remove_fx_range` joining the piece back deleted it, and its chain window closed with it. |
| Saving the choice into `FXChains`? | Not done. REAPER saves a chain to `FXChains` only from the chain window's own menu (FX > Save FX chain), a file dialog the narrator works. Writing an `.RfxChain` from the bridge would write into REAPER's folders, which nothing else in the bridge does, and the effect already sits on the piece. |

## What the app does with it

The Effects tab's **Choose in REAPER…** (SN, #2251) uses two commands in `narration_range.lua`:

- `choose_range_fx(run, item_guid, start, end, fade_ms)` validates as `apply_fx_range` does, splits the item in one undo block, records on the piece's take the app's own chain name for a choice made in REAPER, the seams, and the GUIDs of the FX the piece already had, answers `RANGE_FX_CHOOSING`, and only then opens the dialog (action 40638 by ID and text on the piece alone, the narrator's selection put back item by item; `TakeFX_Show` when the text differs), so a dialog that waits cannot delay the answer.
- `range_fx_chosen(run, item_guid, take_guid)` reads the FX the narrator added there and whether the chain window is open. It changes nothing.

`remove_fx_range`, `fx_range_params`, `fx_range_set_param`, `fx_range_bypass` and `fx_range_compare` take that chain name too, and for it work on the FX added since the dialog opened. Taking the effect off is `remove_fx_range`, which deletes those FX and joins the pieces in one undo block; it also joins after a Cancel, when there is nothing to delete.

## Method

- REAPER 7.82 Linux tarball, the pin in `scripts/ci/real-reaper/run-linux-check.sh`, started with that script's launcher (`spikes/ci_real_reaper_launcher.lua`) on an isolated `-cfgfile`, the audio device closed, on xvfb at 1600×1000.
- One-off probes through the launcher's `ci_exec` (not committed): split, select, run 40638, read back. The narrator was played by `xdotool` clicking a plug-in and **Add** or **Cancel** in the browser; screenshots with ImageMagick `import`.
- The bridge commands themselves, sent through the file protocol to that REAPER: `choose_range_fx` on an item with no FX opened the Add FX browser with no undo point beyond the app's; ReaGate, clicked with `xdotool`, was read back by `range_fx_chosen` (`VST: ReaGate (Cockos)`, chain window open); `remove_fx_range` under the chosen name took it off and joined the item.
- The committed scenario `fx choose: ...` in `scripts/ci/real-reaper/scenarios_range.py` passed. It starts from an item that already has ReaEQ, so the dialog is the chain window: an Add FX browser left open has no ReaScript call to close it and would stay open for the rest of the run. The narrator's Add is played there by `TakeFX_AddByName`, the call REAPER's Add ends in.

## Pending

- Windows REAPER: whether 40638 opens the same browser, and whether `Main_OnCommand` returns before the narrator closes it (the bridge answers first either way). An owner row.
- A close of the chain window with the mouse, and whether it adds REAPER's `Close FX chain` undo point.
- Plug-ins with their own window (VST3, CLAP, JSFX with a GUI) and a plug-in that fails to load: only the ReaPlugs VSTs shipped with REAPER were tried.
- What the narrator hears: the audio device was closed, and nothing was played.
