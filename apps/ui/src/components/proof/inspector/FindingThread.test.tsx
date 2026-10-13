// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { OverlayHost } from '../../../overlay/OverlayHost';
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

async function setup() {
  const api = createMockApi();
  const [first] = (await api.findingsList({})).findings;
  render(
    <ApiProvider api={api}>
      <TooltipProvider>
        <Host api={api} initial={first!} />
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

describe('notes-on-this-finding', () => {
  it('starts empty and adds a note as mine or as the proofer’s reply', async () => {
    const { api, id } = await setup();
    expect(screen.getByText('No notes yet.')).toBeTruthy();
    await addNote('Is this the room or a misread?');
    await addNote('The room: waive it.', 'Proofer replied');
    expect(messages()[0]).toMatch(/^You/);
    expect(messages()[1]).toMatch(/^Proofer/);
    expect((await api.findingsGet(id)).review.thread?.map((m) => m.who)).toEqual(['you', 'proofer']);
    expect((screen.getByRole('textbox', { name: 'Add a note' }) as HTMLTextAreaElement).value).toBe('');
  });

  it('adds, edits and deletes a message, and Undo brings it back', async () => {
    const { api, id } = await setup();
    await addNote('one');
    await addNote('two');
    const first = document.querySelector<HTMLElement>('[data-message="m1"]')!;
    fireEvent.click(within(first).getByRole('button', { name: 'Edit this note' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit note' }), { target: { value: 'one, edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(messages()[0]).toContain('one, edited'));

    fireEvent.click(within(document.querySelector<HTMLElement>('[data-message="m1"]')!).getByRole('button', { name: 'Delete note' }));
    await waitFor(() => expect(messages()).toHaveLength(1));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Undo' })));
    await waitFor(() => expect(messages()).toHaveLength(2));
    expect(messages()[0]).toContain('one, edited');
    expect((await api.findingsGet(id)).review.thread?.map((m) => m.text)).toEqual(['one, edited', 'two']);
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
