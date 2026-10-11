// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockApi } from '../../api/mockApi';
import { openHistoryPanel } from './HistoryPanel';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { createOverlayService } from '../../overlay/overlayService';
import { createJournal } from '../../studio/journal/createJournal';
import { createSlots } from '../../studio/slots';
import { createStudioStore } from '../../studio/store/createStudioStore';
import { addBookmark } from '../../studio/commands/bookmarks';

afterEach(cleanup);

// The History panel over the real journal after a bookmark command (SN-S72). It sits beside the panel's tests because src/studio may not import components.
describe('history-lists-it', () => {
  it('shows "Added a bookmark" and its Undo removes the bookmark and the row', async () => {
    const api = createMockApi();
    const store = createStudioStore({ registry: createSlots(api, api), subscribe: () => () => undefined, subscribeFocus: () => () => undefined });
    const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
    const [chapter] = await api.manuscriptChapters();
    const [line] = await api.manuscriptParagraphs(chapter!.id);
    await addBookmark({ journal, port: api, store }, { chapterId: chapter!.id, paragraphId: line!.id, offset: 1 });
    expect(await api.bookmarksList()).toHaveLength(1);

    const service = createOverlayService();
    render(<OverlayProvider service={service}>{null}</OverlayProvider>);
    act(() => void openHistoryPanel(service, journal, () => 'REAPER'));
    const dialog = await screen.findByRole('dialog', { name: 'Undo history' });
    await waitFor(() => expect(within(dialog).getByText('Added a bookmark')).toBeTruthy());

    await userEvent.click(within(dialog).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(within(dialog).queryByText('Added a bookmark')).toBeNull());
    expect(await api.bookmarksList()).toEqual([]);
  });
});
