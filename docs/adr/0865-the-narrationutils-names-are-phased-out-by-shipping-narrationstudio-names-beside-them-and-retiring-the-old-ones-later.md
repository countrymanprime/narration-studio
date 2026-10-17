# 0865. The `NarrationUtils` names are phased out: `NarrationStudio` names ship beside them, and the old ones are retired later

**Status:** Accepted (owner request on [#1816](https://github.com/countrymanprime/narration-utils/issues/1816)). Partly supersedes [ADR 0755](0755-the-product-is-named-narration-studio-to-the-user-and-narration-utils-stays-on-every-name-a-file-a-key-or-reaper-holds.md): its REAPER launcher name and the default projects folder.
**Significance:** A persistence strategy and an interface between parts: three names that existing installs hold (the REAPER launcher script, the default projects folder, the installer's uninstall key) change on a path that keeps old installs working. Reversing it again would break the same installs.
**Date:** 2026-10-17
**Supersedes:** part of ADR 0755 (see Status)

## Context

ADR 0755 renamed what a narrator reads to Narration Studio and left the CamelCase `NarrationUtils` where a file, a key or REAPER held it, because a plain rename would orphan the REAPER action a narrator loaded, the folder their projects are in, and the installer's upgrade path. The owner now wants the `Utils` name retired, so the rest has to move without breaking those installs.

**Considered options:** rename in place (breaks the loaded REAPER action and the projects folder); move the narrator's `~/NarrationUtils` to `~/NarrationStudio` on start (moves other people's files, and a DAW project may point into it); keep the old names for good (the name never goes away).

## Decision

Each name gets a `NarrationStudio` form that new installs use, and the old form keeps working until a later release removes it.

- **REAPER launcher.** `integrations/reaper/NarrationStudio_Launcher.lua` is the launcher. `NarrationUtils_Launcher.lua` stays as a three-line shim that runs it, so an action already in a narrator's REAPER keeps working. The session folder is `<REAPER resource path>/NarrationStudio/sessions`, for both. The app offers and passes the new file (`layout.LauncherFile`, `app.go`, the Settings `launcherPath`); the release and smoke lists carry both files.
- **Default projects folder.** `project.DefaultDir` is `~/NarrationStudio`. When that folder does not exist and `~/NarrationUtils` does, the old folder is the default. Nothing is moved or copied; a narrator who wants the new name moves the folder themselves.
- **Installer uninstall key.** Not in this change. It needs a Windows build with `makensis` to check, and is tracked on #1816: the new key `NarrationStudio` is written, the old key's `InstallLocation` is read on upgrade, and the old key is deleted.

Retirement is a later release: delete the shim and its list entries, `LegacyDefaultDirName` and the fallback, and the old-key handling.

## Consequences

- A fresh install loads and shows `NarrationStudio_Launcher.lua`; an existing REAPER action keeps working, with the session folder under `NarrationStudio`. A session folder left under `NarrationUtils/sessions` is unused and can be deleted.
- A narrator with `~/NarrationUtils` sees no change until they move it. Anyone with both folders gets `~/NarrationStudio`.
- The REAPER side needs a recorded in-REAPER check of the new file name and the shim; the harness proves the file layout only.
- `narration-utils` (executable, release assets, data folders, settings files) and the spaced "Narration Utils" strings in Lua message boxes and undo labels are outside this decision and unchanged.
