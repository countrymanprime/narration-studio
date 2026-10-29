// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReaderColumn } from './ReaderColumn';

afterEach(cleanup);

describe('ReaderColumn', () => {
  it('is centred and capped at the width it is given, with the page own type kept', () => {
    const { container } = render(<ReaderColumn width="min(48ch, 48%)" className="px-6" style={{ fontSize: '40px' }} />);
    const column = container.querySelector<HTMLElement>('[data-reader-column]')!;
    expect(column.className).toMatch(/(^|\s)mx-auto(\s|$)/);
    expect(column.style.maxWidth).toBe('min(48ch, 48%)');
    expect(column.style.fontSize).toBe('40px');
    expect(column.className).toContain('px-6');
  });
});
