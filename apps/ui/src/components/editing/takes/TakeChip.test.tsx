// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TakeBadge } from './TakeBadge';
import { TakeChip } from './TakeChip';
import { measuredPassage, singleTakePassage } from './takeFixtures';

afterEach(cleanup);

const chip = () => screen.getByRole('button', { name: /take/ });

describe('the state pill on the takes chip', () => {
  it('says Kept once a take is kept, before Stacked or Duplicate read', () => {
    render(<TakeChip passage={measuredPassage()} open={false} keptId="t-7" stacked duplicate onToggle={() => undefined} />);
    expect(chip().textContent).toContain('Kept');
    expect(chip().textContent).not.toContain('Stacked');
  });
  it('says Stacked when the later takes sit on the first read, before Duplicate read', () => {
    render(<TakeChip passage={measuredPassage()} open={false} keptId={null} stacked duplicate onToggle={() => undefined} />);
    expect(chip().textContent).toContain('Stacked');
    expect(chip().textContent).not.toContain('Duplicate read');
  });
  it('says Duplicate read when a take reads the line twice, on a one-take line too', () => {
    render(<TakeChip passage={singleTakePassage()} open={false} keptId={null} duplicate onToggle={() => undefined} />);
    expect(chip().textContent).toContain('1 take');
    expect(chip().textContent).toContain('Duplicate read');
  });
  it('says To choose otherwise', () => {
    render(<TakeChip passage={measuredPassage()} open={false} keptId={null} onToggle={() => undefined} />);
    expect(chip().textContent).toContain('To choose');
  });
  it('draws one bar for each take and fills the active one', () => {
    const passage = measuredPassage();
    render(<TakeChip passage={passage} open={false} keptId={null} onToggle={() => undefined} />);
    const bars = [...document.querySelectorAll('[data-tpips] i')];
    expect(bars).toHaveLength(passage.takes.length);
    expect(bars.filter((b) => b.className.includes('bg-[var(--org)]'))).toHaveLength(passage.takes.filter((t) => t.active).length);
  });
});

describe('the take count in the gutter', () => {
  it('opens the takes, and names its count', () => {
    const onToggle = vi.fn();
    render(<TakeBadge count={1} active={false} open={false} onToggle={onToggle} />);
    const badge = screen.getByRole('button', { name: '1 take. Show them' });
    fireEvent.click(badge);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(badge.getAttribute('aria-expanded')).toBe('false');
  });
});
