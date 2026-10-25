// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { HIT_AREA } from './hitArea';

// The controls drawn under 24 px carry the shared hit area (alignment audit cause G). The atlas measures it for real
// (Tooltip's InfoIconHas24pxHitArea).
const CARRIERS = ['HeaderChip.tsx', 'Toast.tsx', 'Tooltip.tsx', 'Checkbox.tsx', 'Button.tsx', 'Switch.tsx'];

describe('small controls get a 24 px hit area', () => {
  test('the hit area is a centred box at least 24 px each way', () => {
    for (const part of ['relative', 'after:absolute', 'after:min-h-6', 'after:min-w-6', 'after:-translate-x-1/2', 'after:-translate-y-1/2'])
      expect(HIT_AREA.split(' ')).toContain(part);
  });
  for (const file of CARRIERS)
    test(`${file} uses it`, () => {
      expect(readFileSync(join(__dirname, file), 'utf8')).toContain('${HIT_AREA}');
    });
});
