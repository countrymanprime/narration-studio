import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG, type CommandDescriptor } from './commands.catalog';
import { commandsFor, type Surface } from './surfaces';

const SURFACES: Surface[] = ['jumpMenu', 'help', 'settings'];

describe('commandsFor', () => {
  it.each(SURFACES)('%s lists exactly the rows whose surfaces include it, in catalogue order', (surface) => {
    const expected = COMMAND_CATALOG.filter((command) => command.surfaces?.includes(surface));
    expect(commandsFor(surface)).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it('a row added with the flag appears on every surface it names with no other edit', () => {
    const fake: CommandDescriptor = {
      id: 'fake.row',
      label: 'Fake',
      scope: 'global',
      defaults: [],
      group: 'Fake',
      surfaces: ['jumpMenu', 'help', 'settings'],
    };
    const catalog = [...COMMAND_CATALOG, fake];
    for (const surface of SURFACES) {
      const rows = commandsFor(surface, catalog);
      expect(rows[rows.length - 1]).toBe(fake);
    }
  });

  it('a row without the flag, or with surfaces: [], appears nowhere', () => {
    const bare: CommandDescriptor = { id: 'bare.row', label: 'Bare', scope: 'global', defaults: [] };
    const none: CommandDescriptor = { ...bare, id: 'none.row', surfaces: [] };
    for (const surface of SURFACES) expect(commandsFor(surface, [bare, none])).toEqual([]);
  });
});
