// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PendingSpinner } from './PendingSpinner';

afterEach(cleanup);

describe('PendingSpinner', () => {
  it('draws one spinning mark that a screen reader skips (the control says aria-busy)', () => {
    const { container } = render(<PendingSpinner />);
    const mark = container.querySelector('svg');
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(mark?.getAttribute('class')).toContain('motion-ok:animate-spin');
  });
});
