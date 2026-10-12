// Per-viewer reading preferences (owner decision 2026-09-23): UI layout lives in browser storage, machine facts (microphone, engine,
// model) in global settings. The Companion reads which flag kinds the old Booth's rail last showed; nothing writes it since the Booth's
// swap (SN-O10). Storage can be missing or blocked (a private window, cleared site data), so a read that fails gives the defaults.

import { DEFAULT_FLAG_VISIBILITY, FLAG_KINDS, type FlagVisibility } from './readerFlags';

export const FLAG_STORAGE_KEY = 'narration.readAloud.flags';

/** The stored flag kinds to show; any kind stored as anything but a boolean takes its default. */
export function loadFlagVisibility(): FlagVisibility {
  try {
    const raw = window.localStorage.getItem(FLAG_STORAGE_KEY);
    if (!raw) return DEFAULT_FLAG_VISIBILITY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_FLAG_VISIBILITY;
    const stored = parsed as Record<string, unknown>;
    return Object.fromEntries(
      FLAG_KINDS.map((kind) => [kind, typeof stored[kind] === 'boolean' ? stored[kind] : DEFAULT_FLAG_VISIBILITY[kind]]),
    ) as FlagVisibility;
  } catch {
    return DEFAULT_FLAG_VISIBILITY;
  }
}
