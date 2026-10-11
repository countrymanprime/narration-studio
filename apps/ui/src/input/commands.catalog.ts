import type { DefaultGesture, GestureSource } from './gestures';
import type { Scope } from './scopes';

export type CommandId = string;

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
};

function key(code: string, modifiers: DefaultGesture['modifiers'] = [], source: GestureSource = 'keyboard'): DefaultGesture {
  return { source, code, modifiers };
}

/**
 * Every shortcut the app binds by default, gathered from the three hand-written listeners the router replaced (ADR 0361,
 * ADR 0196). `code` is `Mod` where the shortcut is Cmd on macOS (`resolveGesture` turns it into `Meta` or `Ctrl`);
 * F13-F24 stay unbound by default so a programmable pedal can use them with no conflict.
 *
 * `commandCatalog.test.ts` fails on a duplicate id and on the default keymap it builds (`keymap.ts`) having any
 * conflict (`findConflicts.ts`).
 */
export const COMMAND_CATALOG: readonly CommandDescriptor[] = [
  { id: 'nav.back', label: 'Back', scope: 'global', defaults: [key('ArrowLeft', ['Alt']), key('BrowserBack'), key('BracketLeft', ['Mod'])] },
  { id: 'nav.forward', label: 'Forward', scope: 'global', defaults: [key('ArrowRight', ['Alt']), key('BrowserForward'), key('BracketRight', ['Mod'])] },
  // The header's zoom group: `Equal` is both the unshifted "="
  // (Ctrl+=) and, on a US layout, "+" held with Shift (Ctrl++), so both chords are bound to the same physical key;
  // the numpad's own +/-/0 keys are separate physical codes, bound alongside. `Mod` resolves to Cmd on macOS.
  { id: 'zoom.in', label: 'Zoom in', scope: 'global', defaults: [key('Equal', ['Mod']), key('Equal', ['Mod', 'Shift']), key('NumpadAdd', ['Mod'])] },
  { id: 'zoom.out', label: 'Zoom out', scope: 'global', defaults: [key('Minus', ['Mod']), key('NumpadSubtract', ['Mod'])] },
  { id: 'zoom.reset', label: 'Reset zoom to 100%', scope: 'global', defaults: [key('Digit0', ['Mod']), key('Numpad0', ['Mod'])] },
  { id: 'workspace.play', label: 'Play or pause the chapter', scope: 'page', noisy: true, defaults: [key('Space')] },
  { id: 'workspace.word.prev', label: 'Previous word', scope: 'page', defaults: [key('ArrowLeft')] },
  { id: 'workspace.word.next', label: 'Next word', scope: 'page', defaults: [key('ArrowRight')] },
  { id: 'workspace.paragraph.prev', label: 'Previous paragraph', scope: 'page', defaults: [key('ArrowUp')] },
  { id: 'workspace.paragraph.next', label: 'Next paragraph', scope: 'page', defaults: [key('ArrowDown')] },
  { id: 'workspace.flag.prev', label: 'Previous flag', scope: 'page', defaults: [key('BracketLeft')] },
  { id: 'workspace.flag.next', label: 'Next flag', scope: 'page', defaults: [key('BracketRight')] },
  // Not noisy: it starts or pauses the live listening/transcription session (`useTeleprompterSession`), which plays
  // no audio of its own - unlike `workspace.play`, a recorded-audio player (ADR 0361 decision 7).
  { id: 'reading.toggle', label: 'Play or pause reading', scope: 'booth', defaults: [key('Space')] },
  // Mock 03 fills the whole window (owner call, 2026-09-29): F11 also takes the window fullscreen, the platform's own key for it.
  { id: 'booth.fullscreen', label: 'Toggle full screen', scope: 'booth', defaults: [key('F11')] },
  // "?" is Shift+Slash on a US layout (gestures are bound by physical key, so ShortcutSheet.tsx labels it back from
  // `code` for display). `global` so it opens from any screen; `findConflicts.test.ts`'s zero-conflicts
  // check over the real catalog covers it against every other command.
  { id: 'help.shortcuts', label: 'Show keyboard shortcuts', scope: 'global', defaults: [key('Slash', ['Shift'])] },
];

export function findCommand(id: CommandId): CommandDescriptor | undefined {
  return COMMAND_CATALOG.find((command) => command.id === id);
}
