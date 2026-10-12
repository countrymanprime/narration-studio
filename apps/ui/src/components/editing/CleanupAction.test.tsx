// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CleanupAction } from './CleanupAction';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';

afterEach(cleanup);

const chapterId = 'chapter-1';

type Initial = Parameters<typeof createMockApi>[1];

function renderAction(initial: Initial = {}) {
  const api = createMockApi({}, initial);
  const notify = vi.fn();
  render(
    <ApiProvider api={api}>
      <CleanupAction chapterId={chapterId} notify={notify} />
    </ApiProvider>,
  );
  return { api, notify };
}

describe('CleanupAction', () => {
  it('is disabled with the experimental-off message before the narrator turns the setting on', async () => {
    renderAction();
    const match = await screen.findByRole('button', { name: 'Match levels…' });
    await waitFor(() => expect(match.getAttribute('aria-disabled')).toBe('true'));
  });

  // SN-E9: silence trim moved to the Editing page's Clean up tab; item gain stays here, the mock having no equivalent.
  it('editing-check-panel-keeps-what-the-drawer-does-not-replace: offers item gain and no silence trim', async () => {
    renderAction();
    await screen.findByRole('button', { name: 'Match levels…' });
    expect(screen.queryByRole('button', { name: /Trim silence/ })).toBeNull();
  });

  it('previews then matches the linked track’s item levels', async () => {
    const user = userEvent.setup();
    const { notify } = renderAction({ daw: { experimentalOn: true } });
    const match = await screen.findByRole('button', { name: 'Match levels…' });
    await waitFor(() => expect(match.getAttribute('aria-disabled')).toBeNull());
    await user.click(match);

    const dialog = await screen.findByRole('alertdialog', { name: 'Match levels' });
    expect(dialog.textContent).toMatch(/1 item on this chapter's linked track/);

    await user.click(screen.getByRole('button', { name: 'Match' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Matched levels on 1 item\./), 'info'));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // A second preview finds nothing left to match: cleanupActionMock resolves its fixture on Apply.
    await user.click(screen.getByRole('button', { name: 'Match levels…' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/no item on this chapter's linked track/), 'error'));
  });
});
