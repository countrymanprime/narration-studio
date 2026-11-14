// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { OverlayHost } from '../../../overlay/OverlayHost';
import { expectHolderCleanAfterSave } from '../../../studio/drafts/holderContract';
import { UnsavedDraftsProvider, useUnsavedDrafts } from '../../../studio/drafts/unsavedDrafts';
import { createJournal, type Journal } from '../../../studio/journal/createJournal';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { Finding, NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import { FindingThread } from './FindingThread';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Host({ api, initial }: { api: NarrationApi; initial: Finding }) {
  const [finding, setFinding] = useState(initial);
  return <FindingThread finding={finding} api={api} onChanged={setFinding} />;
}

let registry: ReturnType<typeof useUnsavedDrafts>;
function RegistryProbe() {
  registry = useUnsavedDrafts();
  return null;
}

async function setup(journal?: Journal) {
  const api = createMockApi();
  const [first] = (await api.findingsList({})).findings;
  render(
    <ApiProvider api={api}>
      <TooltipProvider>
        <UnsavedDraftsProvider>
          <RegistryProbe />
          {journal ? (
            <StudioProvider journal={journal}>
              <Host api={api} initial={first!} />
            </StudioProvider>
          ) : (
            <Host api={api} initial={first!} />
          )}
        </UnsavedDraftsProvider>
        <OverlayHost />
      </TooltipProvider>
    </ApiProvider>,
  );
  return { api, id: first!.id };
}

const messages = () => [...document.querySelectorAll<HTMLElement>('[data-message]')].map((m) => m.textContent ?? '');
const addNote = async (text: string, who?: 'Proofer replied' | 'My note') => {
  if (who) fireEvent.click(screen.getByRole('button', { name: who }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Add a note' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  await waitFor(() => expect(messages().some((m) => m.includes(text))).toBe(true));
};

describe('holders-render-clean-after-their-save', () => {
  it('a note typed and not added renders clean once the registry has saved it', async () => {
    const { api, id } = await setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Add a note' }), { target: { value: 'Typed, not added' } });
    expect(registry.heldNow().length).toBe(1);
    await expectHolderCleanAfterSave(() => registry.save());
    expect(registry.heldNow()).toEqual([]);
    expect((await api.findingsGet(id)).review.thread?.at(-1)?.text).toBe('Typed, not added');
  });

  it('an edited note renders clean once the registry has saved it', async () => {
    await setup();
    await addNote('First wording', 'My note');
    fireEvent.click(screen.getByRole('button', { name: 'Edit this note' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit note' }), { target: { value: 'Second wording' } });
    expect(registry.heldNow().length).toBe(1);
    await expectHolderCleanAfterSave(() => registry.save());
    expect(registry.heldNow()).toEqual([]);
  });
});

describe('text typed while a note is being added', () => {
  it('stays in the box when the save resolves, and only what was sent is cleared (#3400 L6)', async () => {
    const { api } = await setup();
    let release: () => void = () => {};
    const real = api.findingsThread.bind(api);
    vi.spyOn(api, 'findingsThread').mockImplementation(async (id, change) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return real(id, change);
    });
    const box = screen.getByRole('textbox', { name: 'Add a note' }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'First part' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    fireEvent.change(box, { target: { value: 'First part and more typed while saving' } });
    await act(async () => {
      release();
    });
    await waitFor(() => expect(messages().some((m) => m.includes('First part'))).toBe(true));
    expect(box.value).toBe('First part and more typed while saving');
    expect(registry.heldNow().length).toBe(1);
  });
});

describe('an edit cleared to nothing', () => {
  it('is still held, with nothing to save, so the question offers Discard only (#3400 L2)', async () => {
    await setup();
    await addNote('First wording', 'My note');
    fireEvent.click(screen.getByRole('button', { name: 'Edit this note' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit note' }), { target: { value: '   ' } });
    const held = registry.heldNow();
    expect(held.length).toBe(1);
    expect(held[0]!.saveable).toBe(false);
  });
});

describe('notes-on-this-finding', () => {
  it('starts empty and adds a note as mine or as the proofer’s reply', async () => {
    const { api, id } = await setup();
    expect(screen.getByText('No notes yet.')).toBeTruthy();
    await addNote('Is this the room or a misread?', 'My note');
    await addNote('The room: waive it.', 'Proofer replied');
    expect(messages()[0]).toMatch(/^You/);
    expect(messages()[1]).toMatch(/^Proofer/);
    expect((await api.findingsGet(id)).review.thread?.map((m) => m.who)).toEqual(['you', 'proofer']);
    expect((screen.getByRole('textbox', { name: 'Add a note' }) as HTMLTextAreaElement).value).toBe('');
  });

  it('adds, edits and deletes a message, and Undo brings it back', async () => {
    const { api, id } = await setup();
    await addNote('one', 'My note');
    await addNote('two');
    const first = document.querySelector<HTMLElement>('[data-message="m1"]')!;
    fireEvent.click(within(first).getByRole('button', { name: 'Edit this note' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit note' }), { target: { value: 'one, edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the note' }));
    await waitFor(() => expect(messages()[0]).toContain('one, edited'));

    fireEvent.click(within(document.querySelector<HTMLElement>('[data-message="m1"]')!).getByRole('button', { name: 'Delete note' }));
    await waitFor(() => expect(messages()).toHaveLength(1));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Undo' })));
    await waitFor(() => expect(messages()).toHaveLength(2));
    expect(messages()[0]).toContain('one, edited');
    expect((await api.findingsGet(id)).review.thread?.map((m) => m.text)).toEqual(['one, edited', 'two']);
  });

  it('a deleted note is one journal entry, and Ctrl+Z brings it back', async () => {
    const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
    const { api, id } = await setup(journal);
    await addNote('one', 'My note');
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-message="m1"]')!).getByRole('button', { name: 'Delete note' }));
    await waitFor(() => expect(messages()).toHaveLength(0));
    const [row] = await journal.entries();
    expect(row).toMatchObject({ label: 'Deleted a note', touches: [`proof/finding/${id}`], undoable: true });
    await act(async () => void (await journal.undoLast()));
    await waitFor(() => expect(messages()).toHaveLength(1));
    expect((await api.findingsGet(id)).review.thread?.map((m) => m.text)).toEqual(['one']);
  });

  it('keeps Add note off for an empty note and says why a refused change was not saved', async () => {
    const { api } = await setup();
    expect((screen.getByRole('button', { name: 'Add note' }) as HTMLButtonElement).disabled).toBe(true);
    vi.spyOn(api, 'findingsThread').mockRejectedValueOnce(new Error('could not write findings'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Add a note' }), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText(/^Not saved: /)).toBeTruthy();
  });
});
