// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatStrip } from './StatStrip';

afterEach(cleanup);

const ITEMS = [
  { key: 'finished', label: 'Finished audio', value: '1:52 / 3:08', progress: 0.61 },
  { key: 'logged', label: 'Work time logged', value: '11:20' },
  { key: 'pickups', label: 'Open pickups', value: '9', tone: 'warning' as const },
];

describe('StatStrip', () => {
  it('renders one labelled list holding every tile', () => {
    render(<StatStrip items={ITEMS} />);
    const list = screen.getByRole('list', { name: 'Figures' });
    expect(list.children).toHaveLength(3);
    expect(screen.getByText('Finished audio')).toBeTruthy();
    expect(screen.getByText('Open pickups')).toBeTruthy();
  });

  it('takes a custom accessible label', () => {
    render(<StatStrip items={ITEMS} label="Production figures" />);
    expect(screen.getByRole('list', { name: 'Production figures' })).toBeTruthy();
  });

  it('passes each item straight through to a StatTile, tone and all', () => {
    render(<StatStrip items={ITEMS} />);
    expect(screen.getByText('9').style.color).toBe('var(--warn-text)');
  });

  it('draws one card with rules between tiles rather than a card per tile', () => {
    const { container } = render(<StatStrip items={ITEMS} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('rounded-[var(--radius-card)]');
    expect(card.className).toContain('overflow-hidden');
    // Each tile draws only the rule on its left and top; the card clips the ones on its own edges.
    for (const li of container.querySelectorAll('li')) {
      expect(li.className).toContain('border-l');
      expect(li.className).toContain('border-t');
      expect(li.className).not.toContain('shadow');
      expect(li.className).not.toContain('rounded');
    }
  });

  // docs/design/design-system.md: the strip wraps into full rows as it narrows (every tile, half of them a row, two, one) instead of clipping.
  it('wraps into full rows by the width it has: all in a row, then half, then two, then one', () => {
    const six = Array.from({ length: 6 }, (_, index) => ({ key: `k${index}`, label: `Figure ${index}`, value: `${index}` }));
    const { container } = render(<StatStrip items={six} />);
    const list = container.querySelector('ul') as HTMLElement;
    expect(list.style.getPropertyValue('--strip-all')).toBe('6');
    expect(list.style.getPropertyValue('--strip-half')).toBe('3');
    expect(list.className).toContain('@min-[64rem]:[--strip-cols:var(--strip-all)]');
    expect(list.className).toContain('@min-[36rem]:[--strip-cols:var(--strip-half)]');
    expect(list.className).toContain('@min-[22rem]:[--strip-cols:2]');
  });

  // XPR2-16, XPR1-11, R4SM-6: three tiles in two columns left "Effective rate" alone under a rule that stopped mid-card.
  it('keeps three tiles in one row at the half step, and spans an odd last tile across the two-column step', () => {
    const three = Array.from({ length: 3 }, (_, index) => ({ key: `k${index}`, label: `Figure ${index}`, value: `${index}` }));
    const { container } = render(<StatStrip items={three} />);
    const list = container.querySelector('ul') as HTMLElement;
    expect(list.style.getPropertyValue('--strip-half')).toBe('3');
    expect(list.className).toContain('@min-[22rem]:[--strip-odd:2]');
    expect(list.className).toContain('@min-[36rem]:[--strip-odd:1]');
    for (const li of Array.from(list.querySelectorAll('li'))) expect(li.className).toContain('last:odd:col-span-(--strip-odd)');
  });

  // R4TA-6: a label that wraps to two lines put its value lower than the value beside it.
  it("lays each tile on its row's subgrid, label, value, hint and bar each in its own row", () => {
    const { container } = render(<StatStrip items={[{ key: 'a', label: 'Hours per finished hour', value: '12.3 : 1', hint: 'this week', progress: 0.5 }]} />);
    const li = container.querySelector('li') as HTMLElement;
    expect(li.className).toContain('grid-rows-subgrid');
    expect(li.className).toContain('row-span-4');
    expect(screen.getByText('Hours per finished hour').className).toContain('row-start-1');
    expect(screen.getByText('12.3 : 1').parentElement!.className).toContain('row-start-2');
    expect(screen.getByText('this week').className).toContain('row-start-3');
  });
});
