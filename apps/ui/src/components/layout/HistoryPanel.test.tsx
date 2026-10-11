// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { createOverlayService, type OverlayService } from '../../overlay/overlayService';
import { createJournal, type Journal } from '../../studio/journal/createJournal';
import { openHistoryPanel } from './HistoryPanel';

let service: OverlayService;
let journal: Journal;
let last: 'this' | 'other';
beforeEach(() => {
  service = createOverlayService();
  last = 'this';
  journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => last });
});
afterEach(cleanup);

const add = (label: string, daw = false, touches = [label]) =>
  journal.act({ label, touches, daw, run: async () => ({ ok: true, value: 1 }), undo: async () => ({ ok: true, value: 1 }) });

const mount = async () => {
  render(
    <OverlayProvider service={service}>
      <button>Opener</button>
    </OverlayProvider>,
  );
  const opener = screen.getByRole('button', { name: 'Opener' });
  opener.focus();
  act(() => void openHistoryPanel(service, journal, () => 'REAPER'));
  return { opener, dialog: await screen.findByRole('dialog', { name: 'Undo history' }) };
};

describe('HistoryPanel', () => {
  it('lists-newest-first-with-label-and-origin', async () => {
    await add('First', false, ['a']);
    await add('Second in REAPER', true, ['b']);
    await add('Third', false, ['c']);
    const { dialog } = await mount();
    await waitFor(() => expect(within(dialog).getAllByRole('listitem')).toHaveLength(3));
    const items = within(dialog).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Third'),
      expect.stringContaining('Second in REAPER'),
      expect.stringContaining('First'),
    ]);
    expect(items[0]!.textContent).toContain('App');
    // The DAW entry is not last, so it is refused; the other two are undoable (SNR-Q4).
    expect(within(items[1]!).getByText('REAPER')).toBeTruthy();
    expect(within(items[0]!).getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
    expect(within(dialog).getByText('Ctrl Z undoes the last one')).toBeTruthy();
  });

  it('refusal-sentence-shows-and-undo-is-off', async () => {
    await add('Marked in REAPER', true, ['a']);
    await add('Later', false, ['b']);
    const { dialog } = await mount();
    const sentence = await within(dialog).findByText("Undo 'Later' first. It came after this.");
    const item = sentence.closest('li')!;
    const button = within(item).getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe(sentence.id);
    await userEvent.click(button);
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
  });

  it('undo-runs-the-entry-and-reports: ok removes the row and announces', async () => {
    await add('Added a bookmark');
    const { dialog } = await mount();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(within(dialog).queryAllByRole('listitem')).toHaveLength(0));
    expect(service.getSnapshot().announcement).toBe('Undid Added a bookmark');
    expect(within(dialog).getByText('Nothing to undo yet.')).toBeTruthy();
  });

  it('undo-runs-the-entry-and-reports: a refusal shows as a toast and the list is unchanged', async () => {
    await journal.act({
      label: 'Renamed',
      touches: ['a'],
      run: async () => ({ ok: true, value: 1 }),
      undo: async () => ({ ok: false, refusal: { code: 'host', reason: 'The host said no.' } }),
    });
    const { dialog } = await mount();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(service.getSnapshot().toasts.map((t) => t.text)).toEqual(['The host said no.']));
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1);
  });

  it('empty-state', async () => {
    const { dialog } = await mount();
    expect(await within(dialog).findByText('Nothing to undo yet.')).toBeTruthy();
    expect(within(dialog).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('rereads-on-change: an entry added while open shows without a reopen', async () => {
    const { dialog } = await mount();
    await within(dialog).findByText('Nothing to undo yet.');
    await act(async () => void (await add('Added later')));
    expect(await within(dialog).findByText('Added later')).toBeTruthy();
  });

  it('open-and-close-through-the-overlay: Escape closes and focus returns to the opener', async () => {
    const { opener } = await mount();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('aria-roles: a dialog named Undo history with a labelled list', async () => {
    await add('One');
    const { dialog } = await mount();
    expect(await within(dialog).findByRole('list', { name: 'Changes, newest first' })).toBeTruthy();
  });
});
