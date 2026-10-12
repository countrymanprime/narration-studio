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
  /**
   * Rows whose gesture this page row takes while its page is mounted. The catalogue cannot tell pages apart, but only one page
   * is mounted at a time: there this row wins by scope priority, and on every other page the router falls through to the
   * shadowed row. `findConflicts` skips each named pair and still reports any other row on the gesture.
   */
  shadows?: readonly CommandId[];
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
  // The Editing page's keys (SNE-3, mock `Editing.tsx` `registerKeys('editing')`). The seven `workspace.*` rows above keep their ids so a saved binding
  // survives the swap; the new page drives them (Up and Down step a phrase, `[` and `]` step flags) and the group label becomes "Editing" in the swap.
  // The rows below are new, page scope, and repeat no default of an existing page row. Handlers come from `useEditingKeys`; a row whose handler the page
  // has not supplied is inert. The Delete row also takes Backspace as the mock does. The router keeps a plain key out of a field or a widget.
  {
    id: 'editing.word.extend.prev',
    label: 'Extend the selection one word left',
    scope: 'page',
    defaults: [key('ArrowLeft', ['Shift'])],
    group: 'Editing',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'editing.word.extend.next',
    label: 'Extend the selection one word right',
    scope: 'page',
    defaults: [key('ArrowRight', ['Shift'])],
    group: 'Editing',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'editing.phrase.prev',
    label: 'Previous phrase',
    scope: 'page',
    defaults: [key('ArrowLeft', ['Mod'])],
    group: 'Editing',
    surfaces: ['help', 'settings'],
  },
  { id: 'editing.phrase.next', label: 'Next phrase', scope: 'page', defaults: [key('ArrowRight', ['Mod'])], group: 'Editing', surfaces: ['help', 'settings'] },
  {
    id: 'editing.delete',
    label: 'Delete the selected words and audio',
    scope: 'page',
    defaults: [key('Delete'), key('Backspace')],
    group: 'Editing',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'editing.mute',
    label: 'Mute the selected words (keep the audio)',
    scope: 'page',
    defaults: [key('KeyM')],
    group: 'Editing',
    surfaces: ['help', 'settings'],
  },
  { id: 'editing.fx', label: 'Add FX to the selected words', scope: 'page', defaults: [key('KeyF')], group: 'Editing', surfaces: ['help', 'settings'] },
  { id: 'editing.takes.next', label: 'Next take of the line', scope: 'page', defaults: [key('KeyT')], group: 'Editing', surfaces: ['help', 'settings'] },
  {
    id: 'editing.takes.prev',
    label: 'Previous take of the line',
    scope: 'page',
    defaults: [key('KeyT', ['Shift'])],
    group: 'Editing',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'editing.keep',
    label: 'Keep the take the keys are on, or open the card of a flagged word',
    scope: 'page',
    defaults: [key('Enter')],
    group: 'Editing',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'editing.hide-others',
    label: 'Hide or show the other takes',
    scope: 'page',
    defaults: [key('KeyH')],
    group: 'Editing',
    surfaces: ['help', 'settings'],
  },
  { id: 'editing.strip', label: 'Show or hide the timeline', scope: 'page', defaults: [key('KeyS')], group: 'Editing', surfaces: ['help', 'settings'] },
  {
    id: 'editing.drawer',
    label: 'Open or close the cleanup drawer',
    scope: 'page',
    defaults: [key('KeyC', ['Mod', 'Shift'])],
    group: 'Editing',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'editing.escape',
    label: 'Close the card, clear the selection, then leave the text',
    scope: 'page',
    defaults: [key('Escape')],
    group: 'Editing',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'editing.menu',
    label: 'Open the menu of the cursor word',
    scope: 'page',
    defaults: [key('F10', ['Shift'])],
    group: 'Editing',
    surfaces: ['help', 'settings'],
  },
  { id: 'editing.chapter.next', label: 'Next chapter', scope: 'page', defaults: [key('ArrowDown', ['Alt'])], group: 'Editing', surfaces: ['help', 'settings'] },
  {
    id: 'editing.chapter.prev',
    label: 'Previous chapter',
    scope: 'page',
    defaults: [key('ArrowUp', ['Alt'])],
    group: 'Editing',
    surfaces: ['help', 'settings'],
  },
  // Bookmarks (SNB-6a). The Script page and the Booth register the handlers with `useBookmarkCommands`; until then these rows are inert.
  // `global`, not `page`: the Booth claims the `booth` scope, which shuts `page` off, so a page row would never fire there (SN-O103).
  // `B` is a plain key, so typing in a field never fires it. The mock binds plain `[` and `]` too, but `workspace.flag.*` holds those in page
  // scope (the Proof page) and the catalogue cannot tell two pages apart, so the steps are Alt+[ and Alt+] until the flag keys move. They list in the sheet and Settings and not the jump menu,
  // whose "Bookmark here", "Next bookmark" and "Previous bookmark" entries come from the provider only while a page has the handlers.
  { id: 'bookmark.here', label: 'Bookmark here', scope: 'global', defaults: [key('KeyB')], group: 'Bookmarks', surfaces: ['help', 'settings'] },
  {
    id: 'bookmark.next',
    label: 'Next bookmark',
    scope: 'global',
    defaults: [key('BracketRight', ['Alt'])],
    group: 'Bookmarks',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'bookmark.prev',
    label: 'Previous bookmark',
    scope: 'global',
    defaults: [key('BracketLeft', ['Alt'])],
    group: 'Bookmarks',
    surfaces: ['help', 'settings'],
  },
  // The Script page's keys (SNB-7b; mock `pages/script/keys.ts`, `Reader.tsx` and `app/keys.ts`). `useScriptRegistry` registers the handlers while the
  // page is mounted. Each takes a key another row holds, named in `shadows`: on Script these win by scope priority, and on every other page the router
  // falls through to the shadowed row, so Ctrl+F still opens the jump menu there. Left and Right act only while the reader itself has focus.
  {
    id: 'script.find',
    label: 'Find in the manuscript',
    scope: 'page',
    defaults: [key('KeyF', ['Mod'])],
    shadows: ['jump.open'],
    group: 'Script',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'script.prep.prev',
    label: 'Previous prep state of the chapter in view',
    scope: 'page',
    defaults: [key('ArrowLeft')],
    shadows: ['workspace.word.prev'],
    group: 'Script',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'script.prep.next',
    label: 'Next prep state of the chapter in view',
    scope: 'page',
    defaults: [key('ArrowRight')],
    shadows: ['workspace.word.next'],
    group: 'Script',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'script.escape',
    label: 'Close Find, or the drawer',
    scope: 'page',
    defaults: [key('Escape')],
    shadows: ['editing.escape'],
    group: 'Script',
    surfaces: ['help', 'settings'],
  },
  // The Story Bible list's keys (SN-B94; mock `Bible.tsx` arrow keys): Up and Down move focus through the entries while focus is in the list. Each takes a key
  // other page rows hold, named in `shadows`: only one page is mounted at a time.
  {
    id: 'storybible.entry.next',
    label: 'Next entry',
    scope: 'page',
    defaults: [key('ArrowDown')],
    shadows: ['workspace.paragraph.next', 'proof.note.next'],
    group: 'Story Bible',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'storybible.entry.prev',
    label: 'Previous entry',
    scope: 'page',
    defaults: [key('ArrowUp')],
    shadows: ['workspace.paragraph.prev', 'proof.note.prev'],
    group: 'Story Bible',
    surfaces: ['help', 'settings'],
  },
  // The Proof page's keys (SNQ-9; mock `Proof.tsx` `registerKeys('proof')`). `useProofKeys` registers the handlers while the page is mounted.
  // Like the Script rows, each that takes a key another page row holds names it in `shadows`. Space is not claimed: Proof has no Play ±3 s.
  {
    id: 'proof.note.next',
    label: 'Next note',
    scope: 'page',
    defaults: [key('ArrowDown'), key('KeyJ')],
    shadows: ['workspace.paragraph.next'],
    group: 'Proof',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'proof.note.prev',
    label: 'Previous note',
    scope: 'page',
    defaults: [key('ArrowUp'), key('KeyK')],
    shadows: ['workspace.paragraph.prev'],
    group: 'Proof',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'proof.chapter.next',
    label: 'Next chapter on Proof',
    scope: 'page',
    defaults: [key('ArrowRight')],
    shadows: ['workspace.word.next', 'script.prep.next'],
    group: 'Proof',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'proof.chapter.prev',
    label: 'Previous chapter on Proof',
    scope: 'page',
    defaults: [key('ArrowLeft')],
    shadows: ['workspace.word.prev', 'script.prep.prev'],
    group: 'Proof',
    surfaces: ['help', 'settings'],
  },
  { id: 'proof.decide.pickup', label: 'Needs pickup', scope: 'page', defaults: [key('KeyP')], group: 'Proof', surfaces: ['help', 'settings'] },
  { id: 'proof.decide.edit', label: 'Fix in edit', scope: 'page', defaults: [key('KeyE')], group: 'Proof', surfaces: ['help', 'settings'] },
  { id: 'proof.decide.waive', label: 'Waive', scope: 'page', defaults: [key('KeyW')], group: 'Proof', surfaces: ['help', 'settings'] },
  { id: 'proof.decide.defer', label: 'Defer', scope: 'page', defaults: [key('KeyD')], group: 'Proof', surfaces: ['help', 'settings'] },
  {
    id: 'proof.find',
    label: 'Find in notes',
    scope: 'page',
    defaults: [key('KeyF', ['Mod'])],
    shadows: ['jump.open', 'script.find'],
    group: 'Proof',
    surfaces: ['help', 'settings'],
  },
  {
    id: 'proof.escape',
    label: 'Back to all chapters',
    scope: 'page',
    defaults: [key('Escape')],
    shadows: ['editing.escape', 'script.escape'],
    group: 'Proof',
    surfaces: ['help', 'settings'],
  },
  // Not noisy: it starts or pauses the live listening/transcription session (`useTeleprompterSession`), which plays
  // no audio of its own - unlike `workspace.play`, a recorded-audio player (ADR 0361 decision 7).
  // The Booth's keys (mock `Booth.tsx` `registerKeys('booth')`). They act on the open page, so they list in the sheet and Settings
  // and not the jump menu. Handlers come from `useCommand` in the Booth; until then these rows are inert. There is no F or P
  // binding (nothing is flagged or sent to Pickups from the Booth) and no Ctrl or Meta default, so a modified press is never theirs.
  // Space stays the one record action: a pedal's only default is Space. "+" is Shift+Equal, which would also fire while typing, so
  // the larger-text keys are Equal and the numpad plus.
  { id: 'reading.toggle', label: 'Record or stop', scope: 'booth', defaults: [key('Space')], group: 'Booth', surfaces: ['help', 'settings'] },
  { id: 'booth.phrase.next', label: 'Next phrase', scope: 'booth', defaults: [key('ArrowDown')], group: 'Booth', surfaces: ['help', 'settings'] },
  {
    id: 'booth.phrase.prev',
    label: 'Previous phrase',
    scope: 'booth',
    defaults: [key('ArrowUp'), key('Backspace')],
    group: 'Booth',
    surfaces: ['help', 'settings'],
  },
  { id: 'booth.word.next', label: 'Next word in the booth', scope: 'booth', defaults: [key('ArrowRight')], group: 'Booth', surfaces: ['help', 'settings'] },
  { id: 'booth.word.prev', label: 'Previous word in the booth', scope: 'booth', defaults: [key('ArrowLeft')], group: 'Booth', surfaces: ['help', 'settings'] },
  { id: 'booth.roll', label: 'Punch and roll from here', scope: 'booth', defaults: [key('KeyR')], group: 'Booth', surfaces: ['help', 'settings'] },
  { id: 'booth.view.down', label: 'Scroll the text down', scope: 'booth', defaults: [key('PageDown')], group: 'Booth', surfaces: ['help', 'settings'] },
  { id: 'booth.view.up', label: 'Scroll the text up', scope: 'booth', defaults: [key('PageUp')], group: 'Booth', surfaces: ['help', 'settings'] },
  { id: 'booth.text.larger', label: 'Larger text', scope: 'booth', defaults: [key('Equal'), key('NumpadAdd')], group: 'Booth', surfaces: ['help', 'settings'] },
  {
    id: 'booth.text.smaller',
    label: 'Smaller text',
    scope: 'booth',
    defaults: [key('Minus'), key('NumpadSubtract')],
    group: 'Booth',
    surfaces: ['help', 'settings'],
  },
  { id: 'booth.exit', label: 'Leave the Booth', scope: 'booth', defaults: [key('Escape')], group: 'Booth', surfaces: ['help', 'settings'] },
  { id: 'booth.pickup.next', label: 'Next pickup', scope: 'booth', defaults: [key('KeyN')], group: 'Booth', surfaces: ['help', 'settings'] },
  { id: 'booth.pickup.prev', label: 'Previous pickup', scope: 'booth', defaults: [key('KeyN', ['Shift'])], group: 'Booth', surfaces: ['help', 'settings'] },
  // Mock 03 fills the whole window (owner call, 2026-09-29): F11 also takes the window fullscreen, the platform's own key for it.
  { id: 'booth.fullscreen', label: 'Toggle full screen', scope: 'booth', defaults: [key('F11')], group: 'Booth', surfaces: ['help', 'settings'] },
  // SNO-10a: the Companion has its own route, opened from the jump menu (no rail item; Mod+Alt+C is its only key). The app shell runs it.
  {
    id: 'companion.open',
    label: 'Open Companion',
    scope: 'global',
    defaults: [key('KeyC', ['Mod', 'Alt'])],
    group: 'Booth',
    surfaces: ['jumpMenu', 'help', 'settings'],
  },
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
  // Ctrl+K opens the jump menu everywhere; Ctrl+F opens it on every page but Script and Proof, where `script.find` and `proof.find` shadow it and wins by
  // scope priority (SNR-Q1, ADR 0780 decision 6). Not in `jumpMenu`: the menu would list the command that opened it.
  {
    id: 'jump.open',
    label: 'Open the jump menu',
    scope: 'global',
    defaults: [key('KeyK', ['Mod']), key('KeyF', ['Mod'])],
    group: 'View',
    surfaces: ['help', 'settings'],
  },
  // The History panel (SNR-Q5): opened from the header's History button and from the jump menu. Not Mod+Z: the mock binds that to
  // undo, but the router lets a modified gesture through a text field, so a global Mod+Z would take the field's own undo.
  {
    id: 'history.open',
    label: 'Open the undo history',
    scope: 'global',
    defaults: [key('KeyH', ['Mod', 'Shift'])],
    group: 'View',
    surfaces: ['jumpMenu', 'help', 'settings'],
  },
];

export function findCommand(id: CommandId): CommandDescriptor | undefined {
  return COMMAND_CATALOG.find((command) => command.id === id);
}
