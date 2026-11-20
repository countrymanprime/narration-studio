import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAW_CAPABILITIES } from '../api/contracts/daw';
import { CAPABILITY_MATRIX, MATRIX_TOOLS, type MatrixCell } from './capabilityMatrix';

const WORD: Record<string, MatrixCell> = { Supported: 'yes', Experimental: 'yes', 'Not yet available': 'soon', Unsupported: 'no', 'Not reachable': 'no' };

/** The generated reference: one `| \`key\` | ... | four levels |` row per capability. */
function referenceRows(): Map<string, MatrixCell[]> {
  const text = readFileSync(new URL('../../../../../docs/reference/daw/matrix.md', import.meta.url), 'utf8');
  const rows = new Map<string, MatrixCell[]>();
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const key = /^`(\w+)`$/.exec(cells[1] ?? '')?.[1];
    if (key)
      rows.set(
        key,
        cells.slice(4, 8).map((word) => WORD[word]),
      );
  }
  return rows;
}

describe('the per-tool capability matrix', () => {
  it('has four tools and one row per catalogue capability, in the generated reference', () => {
    expect(MATRIX_TOOLS).toHaveLength(4);
    const reference = referenceRows();
    expect([...reference.keys()]).toEqual(DAW_CAPABILITIES.map(({ key }) => key));
    expect(Object.keys(CAPABILITY_MATRIX)).toEqual(DAW_CAPABILITIES.map(({ key }) => key));
  });

  it('agrees with docs/reference/daw/matrix.md cell for cell', () => {
    for (const [key, cells] of referenceRows()) expect({ key, cells: CAPABILITY_MATRIX[key as keyof typeof CAPABILITY_MATRIX] }).toEqual({ key, cells });
  });
});
