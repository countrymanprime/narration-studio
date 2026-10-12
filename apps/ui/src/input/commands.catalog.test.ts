import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG, findCommand } from './commands.catalog';
import { findConflicts } from './findConflicts';
import { defaultKeymap } from './keymap';

describe('COMMAND_CATALOG', () => {
  it('has no duplicate id', () => {
    const ids = COMMAND_CATALOG.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has a non-empty label and at least one default gesture for every command', () => {
    for (const command of COMMAND_CATALOG) {
      expect(command.label.length).toBeGreaterThan(0);
      expect(command.defaults.length).toBeGreaterThan(0);
    }
  });

  it('F13 to F24 stay unbound by default, for a programmable pedal (Solution Detail)', () => {
    const codes = COMMAND_CATALOG.flatMap((command) => command.defaults.map((gesture) => gesture.code));
    for (let n = 13; n <= 24; n++) expect(codes).not.toContain(`F${n}`);
  });

  it('findCommand looks up by id and is undefined for an unknown one', () => {
    expect(findCommand('nav.back')?.label).toBe('Back');
    expect(findCommand('not.a.command')).toBeUndefined();
  });
});

describe('COMMAND_CATALOG metadata', () => {
  it('every-static-row-has-a-group-and-surfaces', () => {
    for (const command of COMMAND_CATALOG) {
      expect(command.group, `${command.id} group`).toBeTruthy();
      expect(command.surfaces, `${command.id} surfaces`).toBeDefined();
      // A row that shows nowhere (`surfaces: []`) would need a reason comment in the catalogue, so none exists yet.
      expect(command.surfaces?.length, `${command.id} shows nowhere`).toBeGreaterThan(0);
    }
  });
});

describe('the jump menu row', () => {
  it('jump-open-row: Mod+K and Mod+F, global, on help and settings, not in the jump menu', () => {
    const row = findCommand('jump.open');
    expect(row?.scope).toBe('global');
    expect(row?.defaults.map((gesture) => `${gesture.modifiers.join('+')}+${gesture.code}`)).toEqual(['Mod+KeyK', 'Mod+KeyF']);
    expect(row?.surfaces).toEqual(['help', 'settings']);
    expect(row?.surfaces).not.toContain('jumpMenu');
  });
});

describe('the history row', () => {
  it('history-open-row: Mod+Shift+H, global, in the jump menu, never Mod+Z', () => {
    const row = findCommand('history.open');
    expect(row?.scope).toBe('global');
    expect(row?.defaults.map((gesture) => `${gesture.modifiers.join('+')}+${gesture.code}`)).toEqual(['Mod+Shift+KeyH']);
    expect(row?.surfaces).toEqual(['jumpMenu', 'help', 'settings']);
  });
});

describe('the Booth rows', () => {
  const codes = (id: string) => findCommand(id)?.defaults.map((gesture) => [...gesture.modifiers, gesture.code].join('+'));

  it('booth-scope-rows: every Booth key is a booth row in the Booth group, on help and settings only', () => {
    const expected: Record<string, string[]> = {
      'booth.phrase.next': ['ArrowDown'],
      'booth.phrase.prev': ['ArrowUp', 'Backspace'],
      'booth.word.next': ['ArrowRight'],
      'booth.word.prev': ['ArrowLeft'],
      'booth.roll': ['KeyR'],
      'booth.view.down': ['PageDown'],
      'booth.view.up': ['PageUp'],
      'booth.text.larger': ['Equal', 'NumpadAdd'],
      'booth.text.smaller': ['Minus', 'NumpadSubtract'],
      'booth.exit': ['Escape'],
      'booth.pickup.next': ['KeyN'],
      'booth.pickup.prev': ['Shift+KeyN'],
    };
    for (const [id, keys] of Object.entries(expected)) {
      const row = findCommand(id);
      expect(row?.scope, id).toBe('booth');
      expect(row?.group, id).toBe('Booth');
      expect(row?.surfaces, id).toEqual(['help', 'settings']);
      expect(codes(id), id).toEqual(keys);
    }
  });

  it('space-stays-one-action: reading.toggle keeps Space as "Record or stop" and no other booth row binds it', () => {
    expect(findCommand('reading.toggle')?.label).toBe('Record or stop');
    expect(codes('reading.toggle')).toEqual(['Space']);
    const spaceRows = COMMAND_CATALOG.filter((row) => row.scope === 'booth' && row.defaults.some((gesture) => gesture.code === 'Space'));
    expect(spaceRows.map((row) => row.id)).toEqual(['reading.toggle']);
    expect(findConflicts(COMMAND_CATALOG, defaultKeymap(COMMAND_CATALOG, false))).toEqual([]);
  });

  it('no-f-or-p-bindings: no booth row binds F or P, so nothing is flagged or sent to Pickups from the Booth', () => {
    const codesInBooth = COMMAND_CATALOG.filter((row) => row.scope === 'booth').flatMap((row) => row.defaults.map((gesture) => gesture.code));
    expect(codesInBooth).not.toContain('KeyF');
    expect(codesInBooth).not.toContain('KeyP');
  });

  it('pedal-is-space-only: no booth row has a pedal or MIDI default, so the keyboard Space is the one record key', () => {
    const boothDefaults = COMMAND_CATALOG.filter((row) => row.scope === 'booth').flatMap((row) => row.defaults);
    expect(boothDefaults.filter((gesture) => gesture.source !== 'keyboard')).toEqual([]);
    expect(codes('reading.toggle')).toEqual(['Space']);
  });

  it('typing-and-ctrl-are-ignored: no booth row defaults to Ctrl or Meta', () => {
    for (const row of COMMAND_CATALOG.filter((r) => r.scope === 'booth')) {
      for (const gesture of row.defaults) {
        for (const held of ['Ctrl', 'Meta', 'Mod'] as const) expect(gesture.modifiers as string[], `${row.id} ${held}`).not.toContain(held);
      }
    }
  });
});

describe('the Companion row', () => {
  it('the-entry-is-a-jump-menu-command: companion.open is a global Booth-group row on the jump menu, with no rail item', () => {
    const row = findCommand('companion.open');
    expect(row?.label).toBe('Open Companion');
    expect(row?.scope).toBe('global');
    expect(row?.group).toBe('Booth');
    expect(row?.surfaces).toContain('jumpMenu');
    expect(findConflicts(COMMAND_CATALOG, defaultKeymap(COMMAND_CATALOG, false))).toEqual([]);
  });
});

describe('the bookmark rows', () => {
  it('keys-are-catalogue-rows: B, Alt+] and Alt+[ are page rows with the three labels and no conflict', () => {
    const rows = [findCommand('bookmark.here'), findCommand('bookmark.next'), findCommand('bookmark.prev')];
    expect(rows.map((row) => row?.label)).toEqual(['Bookmark here', 'Next bookmark', 'Previous bookmark']);
    expect(rows.map((row) => row?.scope)).toEqual(['page', 'page', 'page']);
    expect(rows.map((row) => row?.defaults.map((gesture) => [...gesture.modifiers, gesture.code].join('+')))).toEqual([
      ['KeyB'],
      ['Alt+BracketRight'],
      ['Alt+BracketLeft'],
    ]);
    expect(findConflicts(COMMAND_CATALOG, defaultKeymap(COMMAND_CATALOG, false))).toEqual([]);
  });
});

describe('the Editing rows', () => {
  const codes = (id: string) => findCommand(id)?.defaults.map((gesture) => [...gesture.modifiers, gesture.code].join('+'));
  const SAVED = [
    'workspace.play',
    'workspace.word.prev',
    'workspace.word.next',
    'workspace.paragraph.prev',
    'workspace.paragraph.next',
    'workspace.flag.prev',
    'workspace.flag.next',
  ];
  const NEW: Record<string, string[]> = {
    'editing.word.extend.prev': ['Shift+ArrowLeft'],
    'editing.word.extend.next': ['Shift+ArrowRight'],
    'editing.phrase.prev': ['Mod+ArrowLeft'],
    'editing.phrase.next': ['Mod+ArrowRight'],
    'editing.delete': ['Delete', 'Backspace'],
    'editing.mute': ['KeyM'],
    'editing.fx': ['KeyF'],
    'editing.takes.next': ['KeyT'],
    'editing.takes.prev': ['Shift+KeyT'],
    'editing.keep': ['Enter'],
    'editing.hide-others': ['KeyH'],
    'editing.strip': ['KeyS'],
    'editing.drawer': ['Mod+Shift+KeyC'],
    'editing.escape': ['Escape'],
    'editing.menu': ['Shift+F10'],
    'editing.chapter.next': ['Alt+ArrowDown'],
    'editing.chapter.prev': ['Alt+ArrowUp'],
  };

  it('existing-ids-keep-their-saved-bindings: the seven workspace rows keep id, scope and default', () => {
    const expected: Record<string, string[]> = {
      'workspace.play': ['Space'],
      'workspace.word.prev': ['ArrowLeft'],
      'workspace.word.next': ['ArrowRight'],
      'workspace.paragraph.prev': ['ArrowUp'],
      'workspace.paragraph.next': ['ArrowDown'],
      'workspace.flag.prev': ['BracketLeft'],
      'workspace.flag.next': ['BracketRight'],
    };
    expect(Object.keys(expected)).toEqual(SAVED);
    for (const id of SAVED) {
      expect(findCommand(id)?.scope, id).toBe('page');
      expect(codes(id), id).toEqual(expected[id]);
    }
  });

  // SN-E9: the workspace's keys moved with it to the Editing page; only their group label changed, so saved bindings survive.
  it('catalogue-ids-unchanged: the seven workspace rows are in the Editing group, still page scope with their defaults and labels', () => {
    for (const id of SAVED) {
      const row = findCommand(id);
      expect(row?.group, id).toBe('Editing');
      expect(row?.surfaces, id).toEqual(['help', 'settings']);
    }
    expect(findCommand('workspace.play')?.noisy).toBe(true);
    expect(SAVED.map((id) => findCommand(id)?.label)).toEqual([
      'Play or pause the chapter',
      'Previous word',
      'Next word',
      'Previous paragraph',
      'Next paragraph',
      'Previous flag',
      'Next flag',
    ]);
  });

  it('new-rows-are-page-scope-and-conflict-free: each is an Editing row on help and settings, and the catalogue has zero conflicts', () => {
    for (const [id, keys] of Object.entries(NEW)) {
      const row = findCommand(id);
      expect(row?.scope, id).toBe('page');
      expect(row?.group, id).toBe('Editing');
      expect(row?.surfaces, id).toEqual(['help', 'settings']);
      expect(codes(id), id).toEqual(keys);
    }
    for (const isMac of [false, true]) expect(findConflicts(COMMAND_CATALOG, defaultKeymap(COMMAND_CATALOG, isMac))).toEqual([]);
  });

  it('a new row repeats no default gesture of an existing page row', () => {
    // A row that names an Editing row in `shadows` (the Script's Escape) shares its key on purpose; `findConflicts` covers the rest.
    const existing = COMMAND_CATALOG.filter((row) => row.scope === 'page' && !(row.id in NEW) && !(row.shadows ?? []).some((id) => id in NEW));
    const taken = new Set(existing.flatMap((row) => codes(row.id) ?? []));
    for (const [id, keys] of Object.entries(NEW)) for (const k of keys) expect(taken.has(k), `${id} ${k}`).toBe(false);
  });
});

describe('the Script rows', () => {
  const chord = (id: string) => findCommand(id)?.defaults.map((gesture) => [...gesture.modifiers, gesture.code].join('+'));

  it('script-find-is-a-catalogue-row: script.find is a page row on Mod+F that shadows jump.open, so the catalogue has zero conflicts', () => {
    const row = findCommand('script.find');
    expect(row?.label).toBe('Find in the manuscript');
    expect(row?.scope).toBe('page');
    expect(chord('script.find')).toEqual(['Mod+KeyF']);
    expect(row?.shadows).toEqual(['jump.open']);
    expect(chord('jump.open')).toContain('Mod+KeyF');
    for (const isMac of [false, true]) expect(findConflicts(COMMAND_CATALOG, defaultKeymap(COMMAND_CATALOG, isMac))).toEqual([]);
  });

  it('keys-follow-the-mock: Left and Right step prep and Escape closes Find or the drawer, each shadowing the row that holds its key', () => {
    expect(['script.prep.prev', 'script.prep.next', 'script.escape'].map(chord)).toEqual([['ArrowLeft'], ['ArrowRight'], ['Escape']]);
    expect(findCommand('script.prep.prev')?.shadows).toEqual(['workspace.word.prev']);
    expect(findCommand('script.prep.next')?.shadows).toEqual(['workspace.word.next']);
    expect(findCommand('script.escape')?.shadows).toEqual(['editing.escape']);
  });

  it('help-and-footer-list-the-keys: each Script row is a Script-group row on help and settings, not the jump menu', () => {
    for (const id of ['script.find', 'script.prep.prev', 'script.prep.next', 'script.escape']) {
      expect(findCommand(id)?.group, id).toBe('Script');
      expect(findCommand(id)?.surfaces, id).toEqual(['help', 'settings']);
    }
  });

  it('every shadows entry names a row on the same gesture, and only a page row shadows (so it wins on its page by scope priority)', () => {
    const keymap = defaultKeymap(COMMAND_CATALOG, false);
    const keys = (id: string) => new Set((keymap[id] ?? []).map((gesture) => [...gesture.modifiers, gesture.code].join('+')));
    for (const row of COMMAND_CATALOG.filter((command) => command.shadows)) {
      expect(row.scope, row.id).toBe('page');
      for (const id of row.shadows!) {
        const other = findCommand(id);
        expect(other, `${row.id} shadows ${id}`).toBeDefined();
        expect(['page', 'global'], `${row.id} shadows ${id}`).toContain(other!.scope);
        expect(
          [...keys(row.id)].some((k) => keys(id).has(k)),
          `${row.id} shares a key with ${id}`,
        ).toBe(true);
      }
    }
  });
});
