// @vitest-environment jsdom
// The jump menu on a 5000-chapter book (#2961): it draws a bounded number of rows however many chapters match, says how many it left out,
// keeps a 10,000-character name inside its row, and stays within a time budget judged by the median of runs (never one sample).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COMMAND_CATALOG } from '../../input/commands.catalog';
import { defaultKeymap } from '../../input/keymap';
import { registerCommandProvider } from '../../input/commandProviders';
import { OverlayHost } from '../../overlay/OverlayHost';
import { createOverlayService, type OverlayService } from '../../overlay/overlayService';
import { JUMP_MENU_MAX_ROWS, openJumpMenu } from './JumpMenu';

let service: OverlayService;
let off: () => void;
beforeEach(() => {
  service = createOverlayService();
  Element.prototype.scrollIntoView = () => {};
  off = registerCommandProvider(() =>
    Array.from({ length: 5000 }, (_, i) => ({
      id: `goto.chapter.c${i}`,
      group: 'Chapters',
      label: i === 0 ? `Go to ${'x'.repeat(10_000)}` : `Go to Chapter ${i + 1}`,
      run: () => {},
    })),
  );
});
afterEach(() => {
  cleanup();
  off();
});

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

function openMenu() {
  render(<OverlayHost service={service} />);
  act(() => void openJumpMenu({ service, catalog: COMMAND_CATALOG, keymap: defaultKeymap(COMMAND_CATALOG, false), runCommand: () => {} }));
}
const type = (value: string) => act(() => void fireEvent.change(screen.getByRole('combobox'), { target: { value } }));

describe('jump menu on a 5000-chapter book', () => {
  it('draws a bounded number of rows and says how many it left out', () => {
    openMenu();
    type('go to');
    expect(screen.getAllByRole('option')).toHaveLength(JUMP_MENU_MAX_ROWS);
    expect(screen.getByText(/^Showing 100 of 5\d{3}$/)).toBeTruthy();
    // A screen reader hears that the list is cut, not only the full count.
    expect(
      screen
        .getAllByRole('status')
        .map((el) => el.textContent)
        .join(' '),
    ).toMatch(/5\d{3} results, showing the first 100/);
    type('go to chapter 4999');
    expect(screen.getAllByRole('option')[0]!.textContent).toContain('Chapter 4999');
    expect(screen.queryByText(/^Showing/)).toBeNull();
  });

  it('clips a 10,000-character name to its row', () => {
    openMenu();
    type('go to xxxx');
    const label = screen.getAllByRole('option')[0]!.querySelector('span.truncate')!;
    expect(label).toBeTruthy();
    expect(label.getAttribute('title')).toHaveLength(10_006);
  });

  it('opens and takes a term within budget (median of five runs)', () => {
    const runs = Array.from({ length: 5 }, (_, i) => {
      cleanup();
      const start = performance.now();
      openMenu();
      type(i % 2 ? 'go to chapter' : 'go to');
      return performance.now() - start;
    });
    // 5000 rows took ~750 ms a run in jsdom before the cap; the capped list is a few tens. The budget is wide so a slow runner does not flake.
    expect(median(runs)).toBeLessThan(400);
  });
});
