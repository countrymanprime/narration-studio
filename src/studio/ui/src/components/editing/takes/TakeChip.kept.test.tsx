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
});
