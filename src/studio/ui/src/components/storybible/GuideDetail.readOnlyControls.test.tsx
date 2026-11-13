// @vitest-environment jsdom
// Guards the class behind #3447: an entry opens read-only, so no text box, select, colour picker, checkbox, radio or toggle
// may be drawn, enabled or not (a switched-off field still looks like one), until Edit is pressed, for every entry type.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import { GuideDetail } from './GuideDetail';

afterEach(cleanup);

const CONTROLS = 'input, textarea, select, [role="combobox"], [role="switch"], [role="checkbox"], [role="radio"], [contenteditable="true"]';
// Deliberate exceptions: none. Mark reviewed, Play and Lock/Unlock are buttons that act on the entry, not fields that hold input.
const EXCEPTIONS: string[] = [];

function drawnControls(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>(CONTROLS)]
    .map((el) => el.getAttribute('aria-label') || el.id || el.tagName.toLowerCase())
    .filter((name) => !EXCEPTIONS.includes(name));
}

describe.each([
  ['alice', 'Character'],
  ['queens-garden', 'Place'],
  ['queens-garden', 'Item'],
  ['queens-garden', 'Event'],
  ['queens-garden', 'Lore'],
])('read-only %s as %s', (id, category) => {
  it('draws no field', async () => {
    const entity = { ...WIRE_ENTITIES.find((row) => row.id === id)!, category };
    const { container } = render(
      <ApiProvider api={createMockApi()}>
        <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
      </ApiProvider>,
    );
    await screen.findByRole('heading', { name: entity.canonical_name });
    await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull());
    expect(drawnControls(container)).toEqual([]);
  });
});
