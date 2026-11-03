// @vitest-environment jsdom
// The collapsed chip names the take that is kept, not the take the DAW still reports as active until the lines are read again (issue 2805).
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TakeChip } from './TakeChip';
import { measuredPassage } from './takeFixtures';

afterEach(cleanup);
const none = () => {};

describe('the collapsed takes chip after a keep', () => {
  it('names the kept take and marks it, not the take still active in the lines read', () => {
    const passage = measuredPassage();
    const active = passage.takes.find((t) => t.active)!;
    const other = passage.takes.find((t) => !t.active)!;
    const { container } = render(<TakeChip passage={passage} open={false} keptId={other.id} onToggle={none} />);
    const chip = container.querySelector('[data-tchip]')!;
    expect(chip.textContent).toContain(other.label);
    expect(chip.textContent).not.toContain(active.label);
    expect(chip.textContent).toContain('Kept');
    const marked = [...chip.querySelectorAll('span[aria-hidden] i')].map((i) => i.className.includes('bg-[var(--accent)]'));
    expect(marked).toEqual(passage.takes.map((t) => t.id === other.id));
  });

  it('names the active take when none is kept', () => {
    const passage = measuredPassage();
    const active = passage.takes.find((t) => t.active)!;
    const { container } = render(<TakeChip passage={passage} open={false} keptId={null} onToggle={none} />);
    expect(container.querySelector('[data-tchip]')!.textContent).toContain(active.label);
  });

  it('falls back to the active take when the kept id is not among the takes', () => {
    const passage = measuredPassage();
    const active = passage.takes.find((t) => t.active)!;
    const { container } = render(<TakeChip passage={passage} open={false} keptId="gone" onToggle={none} />);
    expect(container.querySelector('[data-tchip]')!.textContent).toContain(active.label);
  });

  it('names the take at every width and ends a long label in an ellipsis, with the whole label as its title', () => {
    const passage = measuredPassage();
    const long = `T-\u{1F3A4}-\u05E9\u05DC\u05D5\u05DD-${'x'.repeat(200)}`;
    const labelled = { ...passage, takes: passage.takes.map((t) => (t.active ? { ...t, label: long } : t)) };
    const { container } = render(<TakeChip passage={labelled} open={false} keptId={null} onToggle={none} />);
    const name = [...container.querySelectorAll('[data-tchip] span')].find((span) => span.textContent === long) as HTMLElement;
    expect(name).toBeTruthy();
    expect(name.className).toMatch(/\btruncate\b/);
    expect(name.className).toMatch(/\bmin-w-0\b/);
    expect(name.className).not.toMatch(/max-\[30rem\]:hidden/);
    expect(name.getAttribute('title')).toBe(long);
  });

  it('leaves out the name of a take whose label is only spaces', () => {
    const passage = measuredPassage();
    const blank = { ...passage, takes: passage.takes.map((t) => (t.active ? { ...t, label: '   ' } : t)) };
    const { container } = render(<TakeChip passage={blank} open={false} keptId={null} onToggle={none} />);
    expect([...container.querySelectorAll('[data-tchip] span')].some((span) => span.getAttribute('title') === '   ')).toBe(false);
  });
});
