// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from '../../../../../api/mockApi';
import type { NarrationApi } from '../../../../../types';
import type { ReaderSelection } from '../../registry/contextProvider';
import { Host, view } from './harness';
import { composerTitle, MarkComposer, QUERY_NEEDED } from './MarkComposer';

let api: NarrationApi;
let selection: ReaderSelection;

beforeEach(async () => {
  api = createMockApi();
  const first = (await api.manuscriptParagraphs('chapter-1'))[0]!;
  selection = { chapterId: first.chapterId, paragraphId: first.id, start: 0, end: 5, quote: 'Alice' };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** An opener button, so focus has somewhere to return to. */
function Opener({ type, onClose }: { type: string; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Mark it
      </button>
      {open && (
        <MarkComposer
          type={type}
          selection={selection}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

async function open(type: string) {
  const onClose = vi.fn();
  render(
    <Host api={api}>
      <Opener type={type} onClose={onClose} />
    </Host>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Mark it' }));
  return { onClose, dialog: await screen.findByRole('dialog') };
}

describe('composer-creates-a-note-with-its-text', () => {
  it('is titled with the selected words, shortened at 60', () => {
    expect(composerTitle('Alice')).toBe('Alice');
    expect(composerTitle('a'.repeat(60))).toBe('a'.repeat(60));
    expect(composerTitle('a'.repeat(61))).toBe(`${'a'.repeat(60)}…`);
  });

  it('saves the note once with its text, opens the Notes tab on it and closes', async () => {
    const add = vi.spyOn(api, 'marksAdd');
    const { onClose, dialog } = await open('stress');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Alice' })).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText('Note (optional)'), 'lean on this');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(selection.chapterId, selection.paragraphId, 0, 5, 'stress', 'lean on this');
    expect(view.tab).toBe('marks');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('a-query-needs-its-question', () => {
  it('asks for "Your query", refuses an empty one with a sentence and no call, then starts the mark open', async () => {
    const add = vi.spyOn(api, 'marksAdd');
    const { dialog } = await open('ask');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText(QUERY_NEEDED)).toBeTruthy();
    expect(add).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText('Your query'), 'Which spelling?');
    expect(within(dialog).queryByText(QUERY_NEEDED)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    const saved = await add.mock.results[0]!.value;
    expect(saved).toMatchObject({ type: 'ask', status: 'open', text: 'Which spelling?' });
    expect(view.tab).toBe('queries');
  });

  it('changes the field with the type', async () => {
    const { dialog } = await open('stress');
    await userEvent.selectOptions(within(dialog).getByLabelText('Type'), 'ask');
    expect(within(dialog).getByLabelText('Your query')).toBeTruthy();
    expect(within(dialog).getByRole('option', { name: 'Query for author (tracks a reply)' })).toBeTruthy();
  });
});

describe('focus-and-aria (composer)', () => {
  it('is a named dialog and gives focus back to its opener on Cancel', async () => {
    const { onClose } = await open('stress');
    expect(screen.getByRole('dialog', { name: 'Alice' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mark it' })));
  });
});
