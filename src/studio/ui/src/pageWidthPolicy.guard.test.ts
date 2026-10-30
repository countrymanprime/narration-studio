// The page-width policy (#2654, docs/design/design-system.md#page-width): a data page is one `PAGE_COLUMN_CLASS` column, and the cap is
// written once. A page that hand-writes its own `max-w-[96rem]` or centres itself with another cap would be a second policy.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_COLUMN_CLASS } from './components/primitives/pageColumn';

const read = (path: string): string => readFileSync(join(__dirname, path), 'utf8');
const DATA_PAGES = ['components/masterqc/page/MasterPage.tsx', 'components/delivery/page/DeliveryPage.tsx', 'components/pickups/PickupsPage.tsx'];

describe('data page width', () => {
  it('is a 96 rem column, centred', () => {
    expect(PAGE_COLUMN_CLASS.split(' ')).toEqual(expect.arrayContaining(['mx-auto', 'w-full', 'max-w-[96rem]']));
  });

  it.each(DATA_PAGES)('%s uses the shared column and writes no cap of its own', (path) => {
    const text = read(path);
    expect(text).toContain('PAGE_COLUMN_CLASS');
    expect(text).not.toMatch(/max-w-\[96rem\]|mx-auto/);
  });
});
