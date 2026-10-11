import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG, findCommand } from './commands.catalog';

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
