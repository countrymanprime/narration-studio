// @vitest-environment jsdom
// The Notes and Queries tabs over the browser mock host: the same marks in two views, the thread of a card and what its buttons do.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ApiProvider } from '../../../../../api/ApiContext';
import type { Mark } from '../../../../../api/contracts/marks';
import { createMockApi } from '../../../../../api/mockApi';
import { overlay } from '../../../../../overlay/overlayService';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import type { NarrationApi } from '../../../../../types';
import { TooltipProvider } from '../../../../primitives/Tooltip';
import { useScriptView } from '../../data/useScriptData';
import type { ScriptViewState } from '../../data/scriptView';
import { ThreadsTab, type ThreadsTabProps } from './ThreadsTab';

let api: NarrationApi;
let toast: MockInstance<typeof overlay.toast>;
let toastUndo: MockInstance<typeof overlay.toastUndo>;
let view: ScriptViewState;
let setView: ReturnType<typeof useScriptView<ScriptViewState>>[1];

beforeEach(() => {
  api = createMockApi();
  toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
  toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const lineOf = (mark: Mark) => `Chapter 1 · ¶ ${(mark.paragraph ?? 0) + 1}`;

/** A note on the first line, and a query on the second with the author's reply. */
async function seed() {
  const [first, second] = await api.manuscriptParagraphs('chapter-1');
  const note = await api.marksAdd(first!.chapterId, first!.id, 0, 5, 'stress', 'Lean on this word.');
  const asked = await api.marksAdd(second!.chapterId, second!.id, 0, 5, 'ask', 'Is this the live animal?');
  const query = await api.marksReply(asked.id, 'author', 'They meant the live animals.');
  return { note, query };
}

function Probe() {
  [view, setView] = useScriptView((state) => state);
  return null;
}

function mount(props: Partial<ThreadsTabProps> = {}) {
  const onShowInText = vi.fn();
  render(
    <ApiProvider api={api}>
      <StudioProvider>
        <TooltipProvider>
          <Probe />
          <ThreadsTab kind="notes" chapterId="chapter-1" lineOf={lineOf} onShowInText={onShowInText} {...props} />
        </TooltipProvider>
      </StudioProvider>
    </ApiProvider>,
  );
  return { onShowInText, user: userEvent.setup() };
}

const marks = async () => (await api.marksList()).marks;
const card = (id: string) => within(document.querySelector<HTMLElement>(`[data-mark="${id}"]`)!);

describe('notes-and-queries-are-two-views-of-threads', () => {
  it('the Notes tab lists the chapter marks whose type does not ask, with the type select and quote', async () => {
    const { note, query } = await seed();
    mount();
    const found = await screen.findByRole('article', { name: /Word stress/ });
    expect(found.getAttribute('data-mark')).toBe(note.id);
    expect(screen.queryByRole('article', { name: /Query for author/ })).toBeNull();
    const inCard = within(found);
    expect((inCard.getByRole('combobox', { name: 'Type' }) as HTMLSelectElement).value).toBe('stress');
    expect(inCard.getByText(`“${note.quote}”`)).toBeTruthy();
    expect(inCard.getByText('Lean on this word.')).toBeTruthy();
    expect(inCard.queryByText('Open')).toBeNull();
    expect(inCard.queryByRole('button', { name: 'Copy the query' })).toBeNull();
    expect(document.querySelector(`[data-mark="${query.id}"]`)).toBeNull();
  });

  it('the Queries tab lists the asking marks with a status pill and the whole thread', async () => {
    const { query } = await seed();
    mount({ kind: 'queries' });
    const found = await screen.findByRole('article', { name: /Query for author/ });
    const inCard = within(found);
    expect(found.getAttribute('data-mark')).toBe(query.id);
    expect(inCard.getByText('Open')).toBeTruthy();
    expect(inCard.getByText('Is this the live animal?')).toBeTruthy();
    expect(inCard.getByText('They meant the live animals.')).toBeTruthy();
    expect(inCard.getByText('Author')).toBeTruthy();
    expect(screen.queryByRole('article', { name: /Word stress/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open 1' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('says so when a tab is empty', async () => {
    mount();
    expect(await screen.findByText('No notes in this chapter yet. Select text and choose Mark.')).toBeTruthy();
    cleanup();
    mount({ kind: 'queries' });
    expect(await screen.findByText('No queries here.')).toBeTruthy();
  });

  it('a failed read shows the host sentence and Retry', async () => {
    let fail = true;
    const base = api;
    api = { ...base, marksList: () => (fail ? Promise.reject(new Error('The marks file could not be read.')) : base.marksList()) };
    const { user } = mount();
    expect((await screen.findByRole('alert')).textContent).toContain('The marks file could not be read.');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('adds-to-a-thread-and-resolves-and-reopens', () => {
  it('Reply appends as the author, Resolve and Reopen toggle the status', async () => {
    const { query } = await seed();
    const { user } = mount({ kind: 'queries' });
    await screen.findByRole('article', { name: /Query for author/ });
    setView({ qfilter: 'all' });
    await user.type(card(query.id).getByRole('textbox', { name: 'Reply or note' }), 'Also the stuffed ones.');
    await user.click(card(query.id).getByRole('button', { name: 'Reply' }));
    await waitFor(async () => expect((await marks())[1]?.thread.at(-1)).toMatchObject({ who: 'author', text: 'Also the stuffed ones.' }));
    expect(card(query.id).getByText('Also the stuffed ones.')).toBeTruthy();
    expect((card(query.id).getByRole('textbox', { name: 'Reply or note' }) as HTMLTextAreaElement).value).toBe('');

    await user.click(card(query.id).getByRole('button', { name: 'Mark resolved' }));
    await waitFor(async () => expect((await marks())[1]?.status).toBe('resolved'));
    expect(await card(query.id).findByText('Resolved')).toBeTruthy();
    await user.click(card(query.id).getByRole('button', { name: 'Reopen' }));
    await waitFor(async () => expect((await marks())[1]?.status).toBe('open'));
  });

  it('the who-select sends the reply as the narrator', async () => {
    const { query } = await seed();
    const { user } = mount({ kind: 'queries' });
    await screen.findByRole('article', { name: /Query for author/ });
    await user.click(card(query.id).getByRole('button', { name: 'My note' }));
    await user.type(card(query.id).getByRole('textbox', { name: 'Reply or note' }), 'Checked the text.');
    await user.click(card(query.id).getByRole('button', { name: 'Reply' }));
    await waitFor(async () => expect((await marks())[1]?.thread.at(-1)).toMatchObject({ who: 'you', text: 'Checked the text.' }));
  });

  it('an empty reply is refused with a sentence and no call', async () => {
    const { query } = await seed();
    const reply = vi.spyOn(api, 'marksReply');
    const { user } = mount({ kind: 'queries' });
    await screen.findByRole('article', { name: /Query for author/ });
    await user.click(card(query.id).getByRole('button', { name: 'Reply' }));
    expect(toast).toHaveBeenCalledWith('Write the reply or note first.');
    expect(reply).not.toHaveBeenCalled();
  });
});

describe('edits-a-message-and-deletes-one-with-undo', () => {
  it('Edit shows a labelled textarea; Save changes the message and Cancel leaves it', async () => {
    const { query } = await seed();
    const { user } = mount({ kind: 'queries' });
    await screen.findByRole('article', { name: /Query for author/ });
    const edit = () => card(query.id).getAllByRole('button', { name: 'Edit this message' }).at(-1)!;
    await user.click(edit());
    expect(card(query.id).getByRole('textbox', { name: 'Edit message' })).toBeTruthy();
    await user.click(card(query.id).getByRole('button', { name: 'Cancel' }));
    expect(card(query.id).queryByRole('textbox', { name: 'Edit message' })).toBeNull();

    await user.click(edit());
    const box = card(query.id).getByRole('textbox', { name: 'Edit message' });
    await user.clear(box);
    await user.type(box, 'Changed wording');
    await user.click(card(query.id).getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await marks())[1]?.thread[0]?.text).toBe('Changed wording'));
    expect(card(query.id).queryByRole('textbox', { name: 'Edit message' })).toBeNull();
    expect(card(query.id).getByText('Changed wording')).toBeTruthy();
  });

  it('Delete removes the message with a toast whose Undo restores it at its index', async () => {
    const { query } = await seed();
    const restore = vi.spyOn(api, 'marksRestoreMessage');
    const { user } = mount({ kind: 'queries' });
    await screen.findByRole('article', { name: /Query for author/ });
    await user.click(card(query.id).getAllByRole('button', { name: 'Delete the message' }).at(-1)!);
    await waitFor(async () => expect((await marks())[1]?.thread).toHaveLength(0));
    expect(toastUndo).toHaveBeenCalledWith('Message deleted.', expect.any(Function));
    await toastUndo.mock.calls[0]![1]();
    expect(restore).toHaveBeenCalledWith(query.id, 0, expect.objectContaining({ who: 'author', text: 'They meant the live animals.' }));
    expect((await marks())[1]?.thread).toHaveLength(1);
  });
});

describe('copy-the-query-puts-the-passage-and-the-question-on-the-clipboard', () => {
  const clipboard = (writeText: () => Promise<void>) => Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

  it('writes "{chapter line}: “{quote}”\\n{question}"', async () => {
    const { query } = await seed();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { user } = mount({ kind: 'queries' });
    clipboard(writeText); // after setup(), which installs a clipboard of its own
    await screen.findByRole('article', { name: /Query for author/ });
    await user.click(card(query.id).getByRole('button', { name: 'Copy the query' }));
    expect(writeText).toHaveBeenCalledWith(`${lineOf(query)}: “${query.quote}”\nIs this the live animal?`);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Query copied.'));
  });

  it('a clipboard failure says so', async () => {
    const { query } = await seed();
    const { user } = mount({ kind: 'queries' });
    clipboard(vi.fn().mockRejectedValue(new Error('denied')));
    await screen.findByRole('article', { name: /Query for author/ });
    await user.click(card(query.id).getByRole('button', { name: 'Copy the query' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Could not copy to the clipboard.', { tone: 'error' }));
  });
});

describe('change-type-and-delete', () => {
  it('the type select changes the mark type', async () => {
    const { note } = await seed();
    const { user } = mount();
    await screen.findByRole('article', { name: /Word stress/ });
    await user.selectOptions(card(note.id).getByRole('combobox', { name: 'Type' }), 'emo');
    await waitFor(async () => expect((await marks()).find((mark) => mark.quote === note.quote && mark.type === 'emo')).toBeTruthy());
    expect((await marks()).find((mark) => mark.id === note.id)).toBeUndefined();
  });

  it('the trash deletes the mark and the toast Undo brings it back', async () => {
    const { note } = await seed();
    const { user } = mount();
    await screen.findByRole('article', { name: /Word stress/ });
    await user.click(card(note.id).getByRole('button', { name: 'Delete the note' }));
    await waitFor(async () => expect((await marks()).filter((mark) => mark.type === 'stress')).toHaveLength(0));
    await waitFor(() => expect(toastUndo).toHaveBeenCalledWith('Note deleted.', expect.any(Function)));
    await toastUndo.mock.calls[0]![1]();
    expect((await marks()).filter((mark) => mark.type === 'stress')).toHaveLength(1);
  });
});

describe('show-in-text-asks-the-reader-to-scroll', () => {
  it('the locate button calls onShowInText and selects the card; the selected card follows the view state', async () => {
    const { note } = await seed();
    const { user, onShowInText } = mount();
    await screen.findByRole('article', { name: /Word stress/ });
    const found = document.querySelector<HTMLElement>(`[data-mark="${note.id}"]`)!;
    expect(found.getAttribute('aria-current')).toBeNull();
    await user.click(card(note.id).getByRole('button', { name: 'Show in text' }));
    expect(onShowInText).toHaveBeenCalledWith(note.id);
    await waitFor(() => expect(found.getAttribute('aria-current')).toBe('true'));
    expect(found.classList.contains('a-active')).toBe(true);
    setView({ sel: null });
    await waitFor(() => expect(found.getAttribute('aria-current')).toBeNull());
    expect(view.sel).toBeNull();
  });
});
