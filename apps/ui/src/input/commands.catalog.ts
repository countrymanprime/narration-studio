import type { DefaultGesture, GestureSource } from './gestures';
import type { Scope } from './scopes';

export type CommandId = string;

/** Where a static row is listed: the jump menu, the shortcut sheet, the Settings key list (ADR 0780 decision 1). */
export type CommandSurface = 'jumpMenu' | 'help' | 'settings';

/**
 * One command a narrator can run, as static data (ADR 0361 decision 1): an id, its scope, whether
 * it is `noisy` (suppressed while the DAW reports recording) and its default gestures. A feature attaches
 * behaviour at runtime with `useCommand(id, handler, enabled)` and never listens for a key itself.
 */
export type CommandDescriptor = {
  id: CommandId;
  label: string;
  scope: Scope;
  /** Plays or previews audio, so it is silenced while the DAW records (ADR 0361 decision 7). Absent means not noisy. */
  noisy?: true;
  defaults: DefaultGesture[];
  /** The jump menu heading the row sits under (ADR 0780 decision 1). */
  group?: string;
  /** A short note the jump menu shows beside the label. */
  hint?: string;
  /** Where the row is listed. A row with `[]` shows nowhere and says why in a comment. Read through `commandsFor` in `surfaces.ts`. */
  surfaces?: readonly CommandSurface[];
};

function key(code: string, modifiers: DefaultGesture['modifiers'] = [], source: GestureSource = 'keyboard'): DefaultGesture {
  return { source, code, modifiers };
}

/**
 * Every shortcut the app binds by default, gathered from the three hand-written listeners the router replaced (ADR 0361,
 * ADR 0196). `code` is `Mod` where the shortcut is Cmd on macOS (`resolveGesture` turns it into `Meta` or `Ctrl`);
 * F13-F24 stay unbound by default so a programmable pedal can use them with no conflict.
 *
 * Each row names its jump menu `group` and the `surfaces` it shows on. Page and booth commands are keys that act on
 * the open page, so they list in the sheet and Settings but not the jump menu, which could not run them from
 * another page. A later slice adds a row with both fields and appears on every named surface with no other edit.
 *
 * `commandCatalog.test.ts` fails on a duplicate id and on the default keymap it builds (`keymap.ts`) having any
 * conflict (`findConflicts.ts`).
 */
export const COMMAND_CATALOG: readonly CommandDescriptor[] = [
  {
    id: 'nav.back',
    label: 'Back',
    scope: 'global',
    defaults: [key('ArrowLeft', ['Alt']), key('BrowserBack'), key('BracketLeft', ['Mod'])],
    group: 'Go to',
    surfaces: ['jumpMenu', 'help', 'settings'],
  },
  {
    id: 'nav.forward',
    label: 'Forward',
    scope: 'global',
    defaults: [key('ArrowRight', ['Alt']), key('BrowserForward'), key('BracketRight', ['Mod'])],
    group: 'Go to',
    surfaces: ['jumpMenu', 'help', 'settings'],
  },
  // The header's zoom group: `Equal` is both the unshifted "="
  // (Ctrl+=) and, on a US layout, "+" held with Shift (Ctrl++), so both chords are bound to the same physical key;
  // the numpad's own +/-/0 keys are separate physical codes, bound alongside. `Mod` resolves to Cmd on macOS.
  {
    id: 'zoom.in',
    label: 'Zoom in',
    scope: 'global',
    defaults: [key('Equal', ['Mod']), key('Equal', ['Mod', 'Shift']), key('NumpadAdd', ['Mod'])],
    group: 'Zoom',
    surfaces: ['jumpMenu', 'help', 'settings'],
  },
  {
    id: 'zoom.out',
    label: 'Zoom out',
    scope: 'global',
    defaults: [key('Minus', ['Mod']), key('NumpadSubtract', ['Mod'])],
    group: 'Zoom',
    surfaces: ['jumpMenu', 'help', 'settings'],
  },
  {
    id: 'zoom.reset',
    label: 'Reset zoom to 100%',
    scope: 'global',
    defaults: [key('Digit0', ['Mod']), key('Numpad0', ['Mod'])],
    group: 'Zoom',
    surfaces: ['jumpMenu', 'help', 'settings'],
  },
  {
    id: 'workspace.play',
    label: 'Play or pause the chapter',
    scope: 'page',
    noisy: true,
    defaults: [key('Space')],
    group: 'Workspace',
    surfaces: ['help', 'settings'],
  },
  { id: 'workspace.word.prev', label: 'Previous word', scope: 'page', defaults: [key('ArrowLeft')], group: 'Workspace', surfaces: ['help', 'settings'] },
  { id: 'workspace.word.next', label: 'Next word', scope: 'page', defaults: [key('ArrowRight')], group: 'Workspace', surfaces: ['help', 'settings'] },
  {
    id: 'workspace.paragraph.prev',
    label: 'Previous paragraph',
    scope: 'page',
    defaults: [key('ArrowUp')],
    group: 'Workspace',
    surfaces: ['help', 'settings'],
  },
  { id: 'workspace.paragraph.next', label: 'Next paragraph', scope: 'page', defaults: [key('ArrowDown')], group: 'Workspace', surfaces: ['help', 'settings'] },
  { id: 'workspace.flag.prev', label: 'Previous flag', scope: 'page', defaults: [key('BracketLeft')], group: 'Workspace', surfaces: ['help', 'settings'] },
  { id: 'workspace.flag.next', label: 'Next flag', scope: 'page', defaults: [key('BracketRight')], group: 'Workspace', surfaces: ['help', 'settings'] },
  // Not noisy: it starts or pauses the live listening/transcription session (`useTeleprompterSession`), which plays
  // no audio of its own - unlike `workspace.play`, a recorded-audio player (ADR 0361 decision 7).
  { id: 'reading.toggle', label: 'Play or pause reading', scope: 'booth', defaults: [key('Space')], group: 'Booth', surfaces: ['help', 'settings'] },
  // Mock 03 fills the whole window (owner call, 2026-09-29): F11 also takes the window fullscreen, the platform's own key for it.
  { id: 'booth.fullscreen', label: 'Toggle full screen', scope: 'booth', defaults: [key('F11')], group: 'Booth', surfaces: ['help', 'settings'] },
  // "?" is Shift+Slash on a US layout (gestures are bound by physical key, so ShortcutSheet.tsx labels it back from
  // `code` for display). `global` so it opens from any screen; `findConflicts.test.ts`'s zero-conflicts
  // check over the real catalog covers it against every other command.
  {
    id: 'help.shortcuts',
    label: 'Show keyboard shortcuts',
    scope: 'global',
    defaults: [key('Slash', ['Shift'])],
    group: 'View',
    surfaces: ['jumpMenu', 'help', 'settings'],
  },
];

export function findCommand(id: CommandId): CommandDescriptor | undefined {
  return COMMAND_CATALOG.find((command) => command.id === id);
}
