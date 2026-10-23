// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// DQ-6: Pickups only points to the Booth. This folder has no Punch from here, no Next pickup and no move of the edit cursor.
const FORBIDDEN = [/pickupsPunch/i, /pickupsNext/i, /pickupsResolve/i, /pickupsReopen/i, /edit[ -]?cursor/i, /setCursor/i, /moveCursor/i];

const sources = readdirSync(__dirname).filter((name) => /\.tsx?$/.test(name) && name !== 'noPunchNoNext.test.ts');

describe('no-punch-no-next', () => {
  it('finds the folder files', () => {
    expect(sources).toEqual(expect.arrayContaining(['PickupsTable.tsx', 'SessionPanel.tsx', 'AddPickup.tsx']));
  });
  it.each(sources)('%s names no Punch, Next or cursor move', (name) => {
    const text = readFileSync(join(__dirname, name), 'utf8');
    expect(FORBIDDEN.filter((pattern) => pattern.test(text)).map(String)).toEqual([]);
  });
});
