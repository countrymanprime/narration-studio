// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BreakablePath } from './BreakablePath';

afterEach(cleanup);

describe('BreakablePath', () => {
  it('offers a break after every separator, and nowhere else (R3BO-4, XPJ-9)', () => {
    const { container } = render(<BreakablePath path={'C:\\Users\\narrator/faster-whisper/small'} />);
    const path = container.firstElementChild!;
    expect(path.textContent).toBe('C:\\Users\\narrator/faster-whisper/small');
    expect(Array.from(path.children, (part) => part.textContent)).toEqual(['C:\\', 'Users\\', 'narrator/', 'faster-whisper/', 'small']);
    expect(path.querySelectorAll('wbr')).toHaveLength(5);
    expect(path.className).not.toContain('break-all');
  });

  it('keeps a path with no separator whole, still allowed to wrap when longer than the line', () => {
    const { container } = render(<BreakablePath path="Recordings" />);
    expect(container.firstElementChild!.className).toContain('[overflow-wrap:anywhere]');
    expect(container.querySelectorAll('wbr')).toHaveLength(1);
  });
});
