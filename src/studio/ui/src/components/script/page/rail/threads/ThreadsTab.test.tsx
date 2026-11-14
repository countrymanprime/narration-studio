// @vitest-environment jsdom
// The Notes tab over the browser mock host: every mark of the chapter as a thread, the thread of a card and what its buttons do.
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ApiProvider } from '../../../../../api/ApiContext';
import type { Mark } from '../../../../../api/contracts/marks';
import { createMockApi } from '../../../../../api/mockApi';
import { overlay } from '../../../../../overlay/overlayService';
import { expectHolderCleanAfterSave } from '../../../../../studio/drafts/holderContract';
import { UnsavedDraftsProvider, useUnsavedDrafts } from '../../../../../studio/drafts/unsavedDrafts';
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

let registry: ReturnType<typeof useUnsavedDrafts>;
function RegistryProbe() {
  registry = useUnsavedDrafts();
  return null;
}

function Probe() {
  [view, setView] = useScriptView((state) => state);
  return null;
}

function tree(onShowInText: () => void, props: Partial<ThreadsTabProps>) {
  return (
    <ApiProvider api={api}>
      <StudioProvider>
        <TooltipProvider>
          <UnsavedDraftsProvider>
            <RegistryProbe />
            <Probe />
            {/* The shell's focusable landmark, which a Retry that goes away hands focus to. */}
            <main tabIndex={-1}>
              <ThreadsTab chapterId="chapter-1" lineOf={lineOf} onShowInText={onShowInText} {...props} />
            </main>
          </UnsavedDraftsProvider>
        </TooltipProvider>
      </StudioProvider>
    </ApiProvider>
  );
}

function mount(props: Partial<ThreadsTabProps> = {}) {
  const onShowInText = vi.fn();
  const utils = render(tree(onShowInText, props));
  return { onShowInText, user: userEvent.setup(), rerenderWith: (next: Partial<ThreadsTabProps>) => utils.rerender(tree(onShowInText, next)) };
}

const marks = async () => (await api.marksList()).marks;
const card = (id: string) => within(document.querySelector<HTMLElement>(`[data-mark="${id}"]`)!);

describe('every-mark-of-the-chapter-is-a-threaded-note', () => {
  it('lists a plain mark with the type select and quote, and no status or copy button', async () => {
    const { note } = await seed();
    mount();
    const found = await screen.findByRole('article', { name: /Word stress/ });
    expect(found.getAttribute('data-mark')).toBe(note.id);
    const inCard = within(found);
    expect((inCard.getByRole('combobox', { name: 'Type' }) as HTMLSelectElement).value).toBe('stress');
    expect(inCard.getByText(`“${note.quote}”`)).toBeTruthy();
    expect(inCard.getByText('Lean on this word.')).toBeTruthy();
    expect(inCard.queryByText('Open')).toBeNull();
    expect(inCard.queryByRole('button', { name: 'Copy the note' })).toBeNull();
  });

  it('lists a mark that asks beside it, with its status pill and the whole thread', async () => {
    const { query } = await seed();
    mount();
    const found = await screen.findByRole('article', { name: /Query for author/ });
    const inCard = within(found);
    expect(found.getAttribute('data-mark')).toBe(query.id);
    expect(inCard.getByText('Open')).toBeTruthy();
    expect(inCard.getByText('Is this the live animal?')).toBeTruthy();
    expect(inCard.getByText('They meant the live animals.')).toBeTruthy();
    expect(inCard.getByText('Author')).toBeTruthy();
    expect(screen.getByRole('article', { name: /Word stress/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open 1' })).toBeNull();
  });

  it('says so when the chapter has no notes', async () => {
    mount();
    expect(await screen.findByText('No notes in this chapter yet. Select text and choose Mark.')).toBeTruthy();
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

describe('a failed read and Retry', () => {
  it('keeps focus on the page when Retry removes the error it was pressed on', async () => {
    let fail = true;
    const base = api;
    api = { ...base, marksList: () => (fail ? Promise.reject(new Error('The marks file could not be read.')) : base.marksList()) };
    const { user } = mount();
    await screen.findByRole('alert');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});

describe('adds-to-a-thread-and-resolves-and-reopens', () => {
  it('Reply appends as the author, Resolve and Reopen toggle the status', async () => {
    const { query } = await seed();
    const { user } = mount();
    await screen.findByRole('article', { name: /Query for author/ });
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
    const { user } = mount();
    await screen.findByRole('article', { name: /Query for author/ });
    await user.click(card(query.id).getByRole('button', { name: 'My note' }));
    await user.type(card(query.id).getByRole('textbox', { name: 'Reply or note' }), 'Checked the text.');
    await user.click(card(query.id).getByRole('button', { name: 'Reply' }));
    await waitFor(async () => expect((await marks())[1]?.thread.at(-1)).toMatchObject({ who: 'you', text: 'Checked the text.' }));
  });

  it('an empty reply is refused with a sentence and no call', async () => {
    const { query } = await seed();
    const reply = vi.spyOn(api, 'marksReply');
    const { user } = mount();
    await screen.findByRole('article', { name: /Query for author/ });
    await user.click(card(query.id).getByRole('button', { name: 'Reply' }));
    expect(toast).toHaveBeenCalledWith('Write the reply or note first.');
    expect(reply).not.toHaveBeenCalled();
  });
});

// What a card keeps while the narrator is typing in it, through every change the page makes to the mark under it (#3400, qa-breaker on #3458).
describe('a typed reply survives what happens to its note', () => {
  it('changing the Type of the note keeps the reply typed under it', async () => {
    const { note } = await seed();
    const { user } = mount();
    const box = await screen.findByRole('textbox', { name: 'Add to this note' });
    await user.type(box, 'still here');
    const type = card(note.id).getByRole('combobox', { name: 'Type' }) as HTMLSelectElement;
    const other = [...type.options].find((option) => option.value !== note.type)!.value;
    await user.selectOptions(type, other);
    await waitFor(async () => expect((await marks()).some((mark) => mark.type === other)).toBe(true));
    expect((screen.getAllByRole('textbox', { name: /Add to this note|Reply or note/ })[0] as HTMLTextAreaElement).value).toBe('still here');
  });

  it('selecting the other of two notes on one passage and type does not hand the reply to it', async () => {
    const [first] = await api.manuscriptParagraphs('chapter-1');
    const one = await api.marksAdd(first!.chapterId, first!.id, 0, 5, 'stress', 'FIRST');
    const two = await api.marksAdd(first!.chapterId, first!.id, 0, 5, 'stress', 'SECOND');
    mount();
    await screen.findByRole('article', { name: /Word stress/, hidden: false }).catch(() => undefined);
    await waitFor(() => expect(document.querySelectorAll('[data-mark]').length).toBe(2));
    await userEvent.type(card(one.id).getByRole('textbox', { name: 'Add to this note' }), 'for-FIRST');
    act(() => setView({ sel: two.id }));
    await waitFor(() => expect(document.querySelector('[data-mark]')!.getAttribute('data-mark')).toBe(two.id));
    expect((card(one.id).getByRole('textbox', { name: 'Add to this note' }) as HTMLTextAreaElement).value).toBe('for-FIRST');
    expect((card(two.id).getByRole('textbox', { name: 'Add to this note' }) as HTMLTextAreaElement).value).toBe('');
  });

  it('a chapter that holds a reply stays the one shown when the reader scrolls into the next, until the reply is gone', async () => {
    const { note } = await seed();
    const { user, rerenderWith } = mount();
    await user.type(await screen.findByRole('textbox', { name: 'Add to this note' }), 'kept across chapters');
    rerenderWith({ chapterId: 'chapter-2' });
    expect((card(note.id).getByRole('textbox', { name: 'Add to this note' }) as HTMLTextAreaElement).value).toBe('kept across chapters');
    act(() => void registry.discard());
    rerenderWith({ chapterId: 'chapter-2' });
    await waitFor(() => expect(document.querySelector(`[data-mark="${note.id}"]`)).toBeNull());
  });
});

describe('deleting while typing in the same card', () => {
  it('"Delete the note" asks when an edit of one of its messages is typed, and Keep it leaves both', async () => {
    const { query } = await seed();
    const confirm = vi.spyOn(overlay, 'confirm').mockResolvedValue(false);
    const { user } = mount();
    await screen.findByRole('article', { name: /Query for author/ });
    await user.click(card(query.id).getAllByRole('button', { name: 'Edit this message' }).at(-1)!);
    const box = card(query.id).getByRole('textbox', { name: 'Edit message' });
    await user.clear(box);
    await user.type(box, 'EDITED');
    await user.click(card(query.id).getByRole('button', { name: 'Delete the note' }));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete the note?' }));
    expect((await marks()).some((mark) => mark.id === query.id)).toBe(true);
    expect((card(query.id).getByRole('textbox', { name: 'Edit message' }) as HTMLTextAreaElement).value).toBe('EDITED');
  });

  it('deleting an earlier message while editing a later one asks, and never saves the typed text onto another message', async () => {
    const [first] = await api.manuscriptParagraphs('chapter-1');
    const asked = await api.marksAdd(first!.chapterId, first!.id, 0, 5, 'ask', 'Opening question?');
    await api.marksReply(asked.id, 'author', 'reply one');
    await api.marksReply(asked.id, 'author', 'reply two');
    await api.marksReply(asked.id, 'author', 'reply three');
    const { user } = mount();
    await screen.findByRole('article', { name: /Query for author/ });
    const answers: Array<() => void> = [];
    let holding = false;
    act(() => registry.setShell({ ask: (run) => (holding ? void answers.push(run) : run()), go: () => {} }));
    await user.click(card(asked.id).getAllByRole('button', { name: 'Edit this message' })[2]!);
    const box = card(asked.id).getByRole('textbox', { name: 'Edit message' });
    await user.clear(box);
    await user.type(box, 'EDITED reply two');
    holding = true;
    await user.click(card(asked.id).getAllByRole('button', { name: 'Delete the message' })[1]!);
    // Asked, and nothing happened yet: the thread is whole and the editor keeps its text.
    expect(answers).toHaveLength(1);
    expect((await marks()).find((mark) => mark.id === asked.id)?.thread).toHaveLength(3);
    expect((card(asked.id).getByRole('textbox', { name: 'Edit message' }) as HTMLTextAreaElement).value).toBe('EDITED reply two');
    // Discard & continue: the message goes and the editor moves with its own message, whose text is the saved one; a Save then writes onto that message.
    await act(async () => answers[0]!());
    await waitFor(async () => expect((await marks()).find((mark) => mark.id === asked.id)?.thread).toHaveLength(2));
    await user.click(card(asked.id).getByRole('button', { name: 'Save' }));
    await waitFor(async () =>
      expect((await marks()).find((mark) => mark.id === asked.id)?.thread.map((message) => message.text)).toEqual(['reply two', 'reply three']),
    );
  });
});

describe('a reply typed while the first is being added', () => {
  it('stays in the box when the save resolves (#3400)', async () => {
    const { note } = await seed();
    const { user } = mount();
    let release: () => void = () => {};
    const real = api.marksReply.bind(api);
    vi.spyOn(api, 'marksReply').mockImplementation(async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return real(...args);
    });
    const box = await screen.findByRole('textbox', { name: 'Add to this note' });
    await user.type(box, 'First');
    await user.click(card(note.id).getByRole('button', { name: 'Reply' }));
    await user.type(box, ' and more');
    release();
    await waitFor(async () => expect((await marks()).find((mark) => mark.id === note.id)?.thread.at(-1)?.text).toBe('First'));
    // The part already sent is not left in the box, or the next Reply would send it twice.
    expect((box as HTMLTextAreaElement).value).toBe(' and more');
  });
});

// holder: script/page/rail/threads/NoteCard.tsx
// holder: script/page/rail/threads/MessageEditor.tsx
describe('holders-render-clean-after-their-save', () => {
  it('a reply typed under a note renders clean once the registry has saved it', async () => {
    const { note } = await seed();
    const { user } = mount();
    await user.type(await screen.findByRole('textbox', { name: 'Add to this note' }), 'A reply');
    expect(registry.heldNow().length).toBe(1);
    await expectHolderCleanAfterSave(() => registry.save());
    expect(registry.heldNow()).toEqual([]);
    expect((await marks()).find((mark) => mark.id === note.id)?.thread.at(-1)?.text).toBe('A reply');
  });

  it('an edited message renders clean once the registry has saved it', async () => {
    const { query } = await seed();
    const { user } = mount();
    await screen.findByRole('article', { name: /Query for author/ });
    await user.click(card(query.id).getAllByRole('button', { name: 'Edit this message' }).at(-1)!);
    const box = card(query.id).getByRole('textbox', { name: 'Edit message' });
    await user.clear(box);
    await user.type(box, 'Changed wording');
    expect(registry.heldNow().length).toBe(1);
    await expectHolderCleanAfterSave(() => registry.save());
    expect(registry.heldNow()).toEqual([]);
  });
});

describe('edits-a-message-and-deletes-one-with-undo', () => {
  it('Edit shows a labelled textarea; Save changes the message and Cancel leaves it', async () => {
    const { query } = await seed();
    const { user } = mount();
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
    const { user } = mount();
    await screen.findByRole('article', { name: /Query for author/ });
    await user.click(card(query.id).getAllByRole('button', { name: 'Delete the message' }).at(-1)!);
    await waitFor(async () => expect((await marks())[1]?.thread).toHaveLength(0));
    expect(toastUndo).toHaveBeenCalledWith('Message deleted.', expect.any(Function), { entry: expect.any(Number) });
    await toastUndo.mock.calls[0]![1]();
    expect(restore).toHaveBeenCalledWith(query.id, 0, expect.objectContaining({ who: 'author', text: 'They meant the live animals.' }));
    expect((await marks())[1]?.thread).toHaveLength(1);
  });
});

describe('deleting a message keeps what is typed under it (#3404)', () => {
  it('a reply typed in the card stays when the opening message is deleted, which replaces the mark with a new id', async () => {
    const { note } = await seed();
    await api.marksReply(note.id, 'you', 'Second message');
    const { user } = mount();
    await screen.findByText('Second message');
    const cardOf = () => within(screen.getByText('Second message').closest('article')!);
    await user.type(cardOf().getByRole('textbox', { name: 'Add to this note' }), 'Typed reply keep me');
    await user.click(cardOf().getAllByRole('button', { name: 'Delete the message' })[0]!);
    await waitFor(async () => expect((await marks()).find((mark) => mark.thread.length === 1)?.text).toBe(''));
    expect((cardOf().getByRole('textbox', { name: 'Add to this note' }) as HTMLTextAreaElement).value).toBe('Typed reply keep me');
  });
});

describe('copy-the-query-puts-the-passage-and-the-question-on-the-clipboard', () => {
  const clipboard = (writeText: () => Promise<void>) => Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

  it('writes "{chapter line}: “{quote}”\\n{question}"', async () => {
    const { query } = await seed();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { user } = mount();
    clipboard(writeText); // after setup(), which installs a clipboard of its own
    await screen.findByRole('article', { name: /Query for author/ });
    await user.click(card(query.id).getByRole('button', { name: 'Copy the note' }));
    expect(writeText).toHaveBeenCalledWith(`${lineOf(query)}: “${query.quote}”\nIs this the live animal?`);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Note copied.'));
  });

  it('a clipboard failure says so', async () => {
    const { query } = await seed();
    const { user } = mount();
    clipboard(vi.fn().mockRejectedValue(new Error('denied')));
    await screen.findByRole('article', { name: /Query for author/ });
    await user.click(card(query.id).getByRole('button', { name: 'Copy the note' }));
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

  it('the trash asks before it deletes a note that has a reply typed under it, and Keep it leaves both (#3400)', async () => {
    const { note } = await seed();
    const confirm = vi.spyOn(overlay, 'confirm').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { user } = mount();
    await screen.findByRole('article', { name: /Word stress/ });
    await user.type(card(note.id).getByRole('textbox', { name: 'Add to this note' }), 'A reply not added yet');
    await user.click(card(note.id).getByRole('button', { name: 'Delete the note' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(confirm.mock.calls[0]![0]).toMatchObject({ title: 'Delete the note?', confirmLabel: 'Delete the note', cancelLabel: 'Keep it' });
    // Keep it: the note and the typed reply stay.
    expect((await marks()).filter((mark) => mark.type === 'stress')).toHaveLength(1);
    expect((card(note.id).getByRole('textbox', { name: 'Add to this note' }) as HTMLTextAreaElement).value).toBe('A reply not added yet');
    // Delete the note: it goes.
    await user.click(card(note.id).getByRole('button', { name: 'Delete the note' }));
    await waitFor(async () => expect((await marks()).filter((mark) => mark.type === 'stress')).toHaveLength(0));
    confirm.mockRestore();
  });

  it('the trash deletes a note with nothing typed under it without asking', async () => {
    const { note } = await seed();
    const confirm = vi.spyOn(overlay, 'confirm');
    const { user } = mount();
    await screen.findByRole('article', { name: /Word stress/ });
    await user.click(card(note.id).getByRole('button', { name: 'Delete the note' }));
    await waitFor(async () => expect((await marks()).filter((mark) => mark.type === 'stress')).toHaveLength(0));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('the trash deletes the mark and the toast Undo brings it back', async () => {
    const { note } = await seed();
    const { user } = mount();
    await screen.findByRole('article', { name: /Word stress/ });
    await user.click(card(note.id).getByRole('button', { name: 'Delete the note' }));
    await waitFor(async () => expect((await marks()).filter((mark) => mark.type === 'stress')).toHaveLength(0));
    await waitFor(() => expect(toastUndo).toHaveBeenCalledWith('Note deleted.', expect.any(Function), { entry: expect.any(Number) }));
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
