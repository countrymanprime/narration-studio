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
  it('is disabled with the DAW’s own sentence while REAPER is not answering', async () => {
    renderAction({ daw: { reachable: false } });
    const match = await screen.findByRole('button', { name: 'Match levels…' });
    await waitFor(() => expect(match.getAttribute('aria-disabled')).toBe('true'));
  });

  // R3PR1-23: the reason the button is off is printed under it, not only in its hint.
  it('prints why Match levels is off under the button', async () => {
    renderAction({ daw: { reachable: false } });
    const match = await screen.findByRole('button', { name: 'Match levels…' });
    await waitFor(() => expect(match.getAttribute('aria-disabled')).toBe('true'));
    const reason = document.getElementById(match.getAttribute('aria-describedby')!)!.textContent!;
    expect(screen.getAllByText(reason).some((node) => !node.classList.contains('sr-only'))).toBe(true);
  });

  // SN-E9: silence trim moved to the Editing page's Clean up tab; item gain stays here, the mock having no equivalent.
  it('editing-check-panel-keeps-what-the-drawer-does-not-replace: offers item gain and no silence trim', async () => {
    renderAction();
    await screen.findByRole('button', { name: 'Match levels…' });
    expect(screen.queryByRole('button', { name: /Trim silence/ })).toBeNull();
  });

  it('previews then matches the linked track’s item levels', async () => {
    const user = userEvent.setup();
    const { notify } = renderAction({ daw: {} });
    const match = await screen.findByRole('button', { name: 'Match levels…' });
    await waitFor(() => expect(match.getAttribute('aria-disabled')).toBeNull());
    await user.click(match);

    const dialog = await screen.findByRole('alertdialog', { name: 'Match levels' });
    // R3PR1-22, XPR1-29: one item "differs", and no unit is left alone on a line.
    expect(dialog.textContent).toMatch(/1 item on this chapter's linked track differs from -20\u00a0dBFS RMS by more than 2\u00a0dB\./);

    await user.click(screen.getByRole('button', { name: 'Match' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Matched levels on 1 item\./), 'info'));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // A second preview finds nothing left to match (the host refuses it in its own words): that is the answer "already level", not a failure (#2827;
    // the test used to expect the host's sentence as an error toast).
    await user.click(screen.getByRole('button', { name: 'Match levels…' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/already within 2\u00a0dB of -20\u00a0dBFS RMS\./), 'info'));
  });

  it('an empty candidate list says every item is already level and opens no dialog', async () => {
    const user = userEvent.setup();
    const { api, notify } = renderAction({ daw: {} });
    vi.spyOn(api, 'levelMatchPreview').mockResolvedValue({ candidates: [] } as never);
    const match = await screen.findByRole('button', { name: 'Match levels…' });
    await waitFor(() => expect(match.getAttribute('aria-disabled')).toBeNull());
    await user.click(match);
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/already within/), 'info'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a match that changed nothing says so, and counts the items that moved on', async () => {
    const user = userEvent.setup();
    const { api, notify } = renderAction({ daw: {} });
    vi.spyOn(api, 'levelMatchApply').mockResolvedValue({ changed: [], stale: [{ item: 'g1' }, { item: 'g2' }] } as never);
    const match = await screen.findByRole('button', { name: 'Match levels…' });
    await waitFor(() => expect(match.getAttribute('aria-disabled')).toBeNull());
    await user.click(match);
    await user.click(await screen.findByRole('button', { name: 'Match' }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^No item's level was changed\. 2 items changed in REAPER since the preview/), 'error'),
    );
  });

  it('a chapter change closes an open preview, so Match never applies to a chapter it did not preview', async () => {
    const user = userEvent.setup();
    const api = createMockApi({}, { daw: {} });
    const apply = vi.spyOn(api, 'levelMatchApply');
    const notify = vi.fn();
    const tree = (id: string) => (
      <ApiProvider api={api}>
        <CleanupAction chapterId={id} notify={notify} />
      </ApiProvider>
    );
    const { rerender } = render(tree('chapter-1'));
    const match = await screen.findByRole('button', { name: 'Match levels…' });
    await waitFor(() => expect(match.getAttribute('aria-disabled')).toBeNull());
    await user.click(match);
    await screen.findByRole('alertdialog', { name: 'Match levels' });
    rerender(tree('chapter-2'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });
});
