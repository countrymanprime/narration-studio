import { describe, expect, it } from 'vitest';
import { maskOptions } from './lib/capture';

// A guide capture hides a row's masked regions instead of painting Playwright's magenta box over them, so no committed guide image
// carries the box; the visual suite still paints them, so a changing clock never changes a hash.
describe('maskOptions', () => {
  const page = { locator: (selector: string) => ({ selector }) } as never;

  it('paints each masked region in the visual suite', () => {
    expect(maskOptions(page, ['[data-a]', '[data-b]'], undefined)).toEqual({ mask: [{ selector: '[data-a]' }, { selector: '[data-b]' }] });
  });
  it('hides them with screenshot CSS for a guide capture, leaving no mask', () => {
    expect(maskOptions(page, ['[data-a]', '[data-b]'], 'blank')).toEqual({ style: '[data-a], [data-b] { visibility: hidden !important; }' });
  });
  it('does nothing for a row with no mask', () => {
    expect(maskOptions(page, undefined, 'blank')).toEqual({});
    expect(maskOptions(page, [], undefined)).toEqual({});
  });
});
