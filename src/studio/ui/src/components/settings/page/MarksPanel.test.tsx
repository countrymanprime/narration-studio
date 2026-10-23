// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import { MarksPanel } from './MarksPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderPanel(api: NarrationApi = createMockApi()) {
  render(
    <ApiProvider api={api}>
      <StudioProvider>
        <TooltipProvider>
          <MarksPanel />
        </TooltipProvider>
      </StudioProvider>
    </ApiProvider>,
  );
  const types = (await api.marksList()).types;
  await screen.findByText(types[0].name);
  return { api, types };
}

// The page is inert while the dialog is open, so the region is found with `hidden`.
const panel = () => screen.getByRole('region', { name: 'Marks', hidden: true });

describe('Settings Marks panel (SN-M95)', () => {
  it('lists the mark types and opens Define marks', async () => {
    const { types } = await renderPanel();
    const items = within(panel()).getAllByRole('listitem');
    // The types come from the host, in its order; one that asks says it tracks a reply.
    expect(items.map((item) => item.textContent)).toEqual(types.map((type) => (type.asks ? `${type.name} · tracks a reply` : type.name)));
    expect(types.some((type) => type.asks)).toBe(true);

    await userEvent.click(within(panel()).getByRole('button', { name: 'Edit marks…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Define how you mark up' });
    await waitFor(() => expect(within(dialog).getAllByLabelText('Mark name')).toHaveLength(types.length));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a save in the dialog redraws the list', async () => {
    const { api } = await renderPanel();
    const save = vi.spyOn(api, 'marksSaveTypes');
    await userEvent.click(within(panel()).getByRole('button', { name: 'Edit marks…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Define how you mark up' });
    const [first] = await within(dialog).findAllByLabelText('Mark name');

    await userEvent.clear(first);
    await userEvent.type(first, 'Retake');
    await userEvent.tab();
    await waitFor(() => expect(save).toHaveBeenCalled());
    await waitFor(() => expect(within(panel()).getByText(/^Retake/)).toBeTruthy());
  });
});
