// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { overlay } from '../../overlay/overlayService';
import { contextItemsFor } from '../../registries/context';
import { inspectorFinding } from './inspector/testFinding';
import { useNoteContextMenu } from './useNoteContextMenu';

afterEach(cleanup);

function Harness({ selected = 'f1' }: { selected?: string }) {
  const finding = inspectorFinding({ id: 'f1' });
  useNoteContextMenu({ findings: [finding], selectedId: () => selected, select: () => {}, goToScript: () => {}, goToBooth: () => {} });
  return (
    <>
      <section aria-label="Notes">
        <table>
          <tbody>
            <tr data-row="f1">
              <td>note</td>
            </tr>
          </tbody>
        </table>
      </section>
      <aside aria-label="Note">
        <span id="why">Your DAW does not offer this.</span>
        <button aria-label="Show in REAPER" aria-disabled="true" aria-describedby="why" />
        <span id="why-marker">The project file is not linked.</span>
        <button aria-label="Add marker in REAPER" aria-disabled="true" aria-describedby="why-marker" />
      </aside>
    </>
  );
}

// qa-breaker B6 (#2826) and #2830: a pick that finds the Inspector's button off says why, in the button's own words, instead of doing nothing. The entries
// are not gated when the menu opens: the Inspector still shows the previously selected note until it re-renders, so its buttons say nothing about this one yet.
describe('the Proof note menu’s Show in and Add marker entries', () => {
  const open = () => {
    const { container } = render(<Harness />);
    return contextItemsFor(container.querySelector('tr')!) ?? [];
  };

  it('are named as the Inspector’s buttons are and are never gated by a stale Inspector', () => {
    const items = open();
    const goto = items.find((item) => item.key === 'note-goto');
    const marker = items.find((item) => item.key === 'note-marker');
    expect(goto?.label).toBe('Show in REAPER');
    expect(marker?.label).toBe('Add marker in REAPER');
    expect(goto?.unavailable).toBeUndefined();
    expect(marker?.unavailable).toBeUndefined();
  });

  it('say why when a pick finds the Inspector’s button off', () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => '' as never);
    const items = open();
    items.find((item) => item.key === 'note-goto')?.onSelect();
    expect(toast).toHaveBeenLastCalledWith('Your DAW does not offer this.', { tone: 'error' });
    items.find((item) => item.key === 'note-marker')?.onSelect();
    expect(toast).toHaveBeenLastCalledWith('The project file is not linked.', { tone: 'error' });
    toast.mockRestore();
  });

  it('say the note’s panel is not open when there is no Inspector button at all', () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => '' as never);
    const items = open();
    document.querySelector('aside[aria-label="Note"]')?.setAttribute('aria-label', 'Closed');
    items.find((item) => item.key === 'note-marker')?.onSelect();
    expect(toast).toHaveBeenLastCalledWith('The note’s panel is not open, so the DAW cannot be asked about it.', { tone: 'error' });
    toast.mockRestore();
  });
});
