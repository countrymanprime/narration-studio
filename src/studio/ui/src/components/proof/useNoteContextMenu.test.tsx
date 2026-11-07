// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { contextItemsFor } from '../../registries/context';
import { inspectorFinding } from './inspector/testFinding';
import { useNoteContextMenu } from './useNoteContextMenu';

afterEach(cleanup);

function Harness() {
  const finding = inspectorFinding({ id: 'f1' });
  useNoteContextMenu({ findings: [finding], selectedId: () => 'f1', select: () => {}, goToScript: () => {}, goToBooth: () => {} });
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

// qa-breaker B6 (#2826): the menu entry looked live while the Inspector's button was off, and a pick did nothing.
describe('the Proof note menu’s Show in entry', () => {
  it('is off for the reason the Inspector’s button is off', () => {
    const { container } = render(<Harness />);
    const items = contextItemsFor(container.querySelector('tr')!) ?? [];
    const goto = items.find((item) => item.key === 'note-goto');
    expect(goto?.label).toBe('Show in REAPER');
    expect(goto?.unavailable).toBe('Your DAW does not offer this.');
  });

  // #2830: Add marker is in the menu too, named and gated as the Inspector's button is.
  it('offers Add marker in the DAW, off for the reason the Inspector’s Add marker is off', () => {
    const { container } = render(<Harness />);
    const items = contextItemsFor(container.querySelector('tr')!) ?? [];
    const marker = items.find((item) => item.key === 'note-marker');
    expect(marker?.label).toBe('Add marker in REAPER');
    expect(marker?.unavailable).toBe('The project file is not linked.');
  });
});
