import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG } from './commands.catalog';
import { resolveGesture, serializeGesture } from './gestures';

// #3744: Alt+Space opened the Windows window menu whatever the page did with the key, so the Record / Cold read switch never fired. The system takes some combinations before a
// page sees them, or opens something it cannot be told to close; no default of any command may be one of them. The app ships on Windows (WebView2), so the list is Windows'.
// macOS keeps others (Cmd+Space, Ctrl+Space); a Mac build adds its own list here.
const RESERVED_ON_WINDOWS: readonly { gesture: string; why: string }[] = [
  { gesture: 'Alt+Space', why: 'the window menu' },
  { gesture: 'Alt+F4', why: 'closes the window' },
  { gesture: 'Alt+Tab', why: 'switches window' },
  { gesture: 'Alt+Shift+Tab', why: 'switches window' },
  { gesture: 'Alt+Escape', why: 'cycles windows' },
  { gesture: 'Ctrl+Escape', why: 'opens the Start menu' },
  { gesture: 'Ctrl+Shift+Escape', why: 'opens Task Manager' },
  { gesture: 'Alt+Ctrl+Delete', why: 'the secure attention sequence' },
  { gesture: 'PrintScreen', why: 'the screenshot' },
];

/** Every default of every command, as Windows resolves it (`Mod` is Ctrl), with the command it belongs to. */
const windowsDefaults = COMMAND_CATALOG.flatMap((row) =>
  row.defaults.filter((def) => def.source === 'keyboard').map((def) => ({ id: row.id, scope: row.scope, gesture: resolveGesture(def, false) })),
);

const isReserved = (gesture: ReturnType<typeof resolveGesture>): string | undefined => {
  // The Windows key combines with nearly every key (Win+Space switches the input language, Win+D the desktop): none is free.
  if (gesture.modifiers.includes('Meta')) return 'a Windows key combination';
  return RESERVED_ON_WINDOWS.find((entry) => entry.gesture === serializeGesture(gesture))?.why;
};

describe('no default shortcut is a combination the system takes (#3744)', () => {
  it('no command, in any scope, binds a reserved Windows combination or a Windows-key combination', () => {
    const taken = windowsDefaults.flatMap((entry) => {
      const why = isReserved(entry.gesture);
      return why ? [`${entry.id} (${entry.scope}): ${serializeGesture(entry.gesture)} is ${why}`] : [];
    });
    expect(taken, 'a default the system takes never reaches the page, or opens something the page cannot close: pick another combination').toEqual([]);
  });

  it('the check can fail: it names Alt+Space, Alt+F4 and a Windows-key combination', () => {
    expect(isReserved(resolveGesture({ source: 'keyboard', code: 'Space', modifiers: ['Alt'] }, false))).toBeDefined();
    expect(isReserved(resolveGesture({ source: 'keyboard', code: 'F4', modifiers: ['Alt'] }, false))).toBeDefined();
    expect(isReserved(resolveGesture({ source: 'keyboard', code: 'KeyD', modifiers: ['Meta'] }, false))).toBeDefined();
    // Mod is Ctrl on Windows, so it is not a Windows key there.
    expect(isReserved(resolveGesture({ source: 'keyboard', code: 'BracketLeft', modifiers: ['Mod'] }, false))).toBeUndefined();
  });

  it('the Record / Cold read switch is Ctrl+Alt+Space, the replacement for the Alt+Space the window menu took', () => {
    const row = COMMAND_CATALOG.find((entry) => entry.id === 'booth.mode.switch');
    expect(row?.defaults.map((def) => serializeGesture(resolveGesture(def, false)))).toEqual(['Alt+Ctrl+Space']);
  });
});
