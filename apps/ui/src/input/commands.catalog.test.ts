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
