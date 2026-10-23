// @vitest-environment jsdom
// The Import dialog's state matrix (definition-of-done rule 3): empty, one, huge, loading, refused, failed, stale, odd text, rapid
// double-fire, leave mid-action, and the host never answering or answering late. The file is untrusted input (threat-model row 6zb), so
// every case checks what the narrator reads, not only that nothing threw. Cells that jsdom cannot show are listed at the bottom.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import type { ExtractionImportPlan, ExtractionImportResult } from '../../../../api/contracts/extraction';
import { createMockApi } from '../../../../api/mockApi';
import { OverlayHost } from '../../../../overlay/OverlayHost';
import { overlay } from '../../../../overlay/overlayService';
import { StudioProvider, useJournal } from '../../../../studio/StudioProvider';
import type { Journal } from '../../../../studio/journal/createJournal';
import type { NarrationApi } from '../../../../types';
import { ImportDialog } from './ImportDialog';
import { IMPORT_MAX_BYTES, LIST_CAP, readableFailure, tooBigSentence } from './importModel';
import { openImportDialog } from './openImportDialog';

let api: NarrationApi;
let journal: Journal;
function Probe() {
  journal = useJournal();
  return null;
}
const wrap = (children: React.ReactNode) => (
  <ApiProvider api={api}>
    <StudioProvider>
      <Probe />
      {children}
    </StudioProvider>
  </ApiProvider>
);
const VALID = JSON.stringify({ entries: [{ name: 'The Mad Hatter', type: 'Character', confidence: 0.9 }] });
const PRETTY = JSON.stringify({ entries: [{ name: 'The Mad Hatter', confidence: 0.9 }] }, null, 2);
const textbox = () => screen.getByLabelText('Paste JSON or CSV') as HTMLTextAreaElement;
const paste = (value: string) => fireEvent.change(textbox(), { target: { value } });
const addButton = () => screen.getByRole('button', { name: /to the Story Bible$/ }) as HTMLButtonElement;
const input = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const choose = async (file: File) => {
  await act(async () => {
    fireEvent.change(input(), { target: { files: [file] } });
    await new Promise((r) => setTimeout(r, 30));
  });
};
const sized = (file: File, size: number) => (Object.defineProperty(file, 'size', { value: size }), file);
const plan = (over: Partial<ExtractionImportPlan> = {}): ExtractionImportPlan => ({ format: 'json', lines: [], errors: [], offered: 0, ...over });
const line = (i: number, label = `Name ${i}`): ExtractionImportPlan['lines'][number] => ({
  row: i,
  where: `row ${i}`,
  kind: 'entry',
  label,
  action: 'add',
  status: 'accepted-auto',
  confidence: 0.9,
  note: '',
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const MADE: ExtractionImportResult = { suggestions: [], entryIds: [], skipped: 0 };
const alerts = () => screen.queryAllByRole('alert').map((a) => a.textContent ?? '');

beforeEach(() => {
  api = createMockApi();
});
afterEach(() => {
  // The overlay service is a singleton: a dialog or toast a test left open would hide the next test's opener.
  const { dialogs, toasts } = overlay.getSnapshot();
  dialogs.forEach((entry) => entry.kind !== 'confirm' && entry.close());
  toasts.forEach((entry) => overlay.dismissToast(entry.id));
  cleanup();
  vi.restoreAllMocks();
});

describe('nothing chosen, empty and blank files', () => {
  it('a picker that was cancelled changes nothing and says nothing', async () => {
    const preview = vi.spyOn(api, 'extractionImportPreview');
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await act(async () => void fireEvent.change(input(), { target: { files: [] } }));
    await settle(300);
    expect(alerts()).toEqual([]);
    expect(textbox().value).toBe('');
    expect(preview).not.toHaveBeenCalled();
    expect(addButton().disabled).toBe(true);
    expect(addButton().textContent).toBe('Add to the Story Bible');
  });

  it('an empty file says so, and does not replace the text already there', async () => {
    const preview = vi.spyOn(api, 'extractionImportPreview');
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await choose(new File([''], 'empty.csv'));
    expect(alerts()).toEqual(['That file is empty.']);
    expect(screen.queryByText('empty.csv')).toBeNull();
    expect(preview).not.toHaveBeenCalled();
    expect(addButton().disabled).toBe(true);
  });

  it('a whitespace-only file says so in its own sentence', async () => {
    const preview = vi.spyOn(api, 'extractionImportPreview');
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await choose(new File(['  \n\t \r\n '], 'blank.json'));
    expect(alerts()).toEqual(['That file has only blank space in it.']);
    await settle(300);
    expect(preview).not.toHaveBeenCalled();
    expect(addButton().disabled).toBe(true);
  });

  it('whitespace pasted in the box is not sent to the host', async () => {
    const preview = vi.spyOn(api, 'extractionImportPreview');
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste('   \n  ');
    await settle(300);
    expect(preview).not.toHaveBeenCalled();
    expect(screen.queryByText(/Checking/)).toBeNull();
    expect(addButton().disabled).toBe(true);
  });
});

describe('how many rows', () => {
  it('zero rows: the narrator is told there is nothing to add, and Add is off', async () => {
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste('{"entries":[]}');
    expect(await screen.findByText('There are no entries in this file to add.')).toBeTruthy();
    expect(screen.getByText('0 to add')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(addButton().disabled).toBe(true);
  });

  it('one row: singular wording, one table row, Add 1', async () => {
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste(VALID);
    const table = await screen.findByRole('table', { name: 'What will be added' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('1 to add')).toBeTruthy();
    expect(screen.getByText('0 errors')).toBeTruthy();
    await waitFor(() => expect(addButton().textContent).toBe('Add 1 to the Story Bible'));
  });

  it('one bad row says "1 error", not "1 errors"', async () => {
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste('record,name,type\nentry,,Item');
    expect(await screen.findByText('1 error')).toBeTruthy();
  });

  it('10,000 rows the host planned: only a capped page is drawn, quickly, with exact counts', async () => {
    const lines = Array.from({ length: 10_000 }, (_, i) => line(i + 1));
    vi.spyOn(api, 'extractionImportPreview').mockResolvedValue(plan({ lines, offered: 10_000 }));
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    const began = performance.now();
    paste('{"entries":[]}');
    const table = await screen.findByRole('table', { name: 'What will be added' });
    expect(performance.now() - began).toBeLessThan(5000);
    expect(within(table).getAllByRole('row')).toHaveLength(1 + LIST_CAP + 1);
    expect(screen.getByText(`and ${10_000 - LIST_CAP} more`)).toBeTruthy();
    expect(screen.getByText('10000 to add')).toBeTruthy();
  });

  it('10,000 rows the host refuses (over its row cap): the host sentence is the one row, Add stays off', async () => {
    const reason = 'The file has 10000 rows; the limit is 5000.';
    vi.spyOn(api, 'extractionImportPreview').mockResolvedValue(plan({ errors: [{ row: 0, where: '', reason }] }));
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste('x');
    const table = await screen.findByRole('table', { name: 'Rows with errors' });
    expect(within(table).getByText(reason)).toBeTruthy();
    expect(addButton().disabled).toBe(true);
  });
});

describe('a huge file', () => {
  it('a 50 MB file is refused by the page with a readable sentence, before reading, once the host limit is known', async () => {
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await settle(30);
    const read = vi.spyOn(FileReader.prototype, 'readAsText');
    await choose(sized(new File(['{}'], 'huge.json'), 50 << 20));
    expect(alerts()).toEqual(['That file is too big to import (limit 2 MB).']);
    expect(read).not.toHaveBeenCalled();
  });

  it('is refused the same way before the host limit has been read (the default is the documented 2 MiB)', async () => {
    vi.spyOn(api, 'extractionImportPrompt').mockReturnValue(new Promise(() => {}));
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    const read = vi.spyOn(FileReader.prototype, 'readAsText');
    await choose(sized(new File(['{}'], 'huge.csv'), 50 << 20));
    expect(alerts()).toEqual([tooBigSentence(IMPORT_MAX_BYTES)]);
    expect(read).not.toHaveBeenCalled();
  });

  it('a file exactly at the limit is read', async () => {
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await choose(sized(new File([VALID], 'edge.json'), IMPORT_MAX_BYTES));
    expect(alerts()).toEqual([]);
    expect(textbox().value).toBe(VALID);
  });

  it('text pasted over the limit never reaches the host and says why', async () => {
    const preview = vi.spyOn(api, 'extractionImportPreview');
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste('a'.repeat(IMPORT_MAX_BYTES + 1));
    expect(alerts()).toEqual([tooBigSentence(IMPORT_MAX_BYTES)]);
    await settle(300);
    expect(preview).not.toHaveBeenCalled();
    expect(addButton().disabled).toBe(true);
  });
});

describe('files that are not what they say', () => {
  it('malformed JSON: the host sentence is in the table, nothing can be added', async () => {
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await choose(new File(['{"entries": [{"name": '], 'broken.json'));
    const table = await screen.findByRole('table', { name: 'Rows with errors' });
    expect(within(table).getByText('The file is not valid JSON.')).toBeTruthy();
    expect(addButton().disabled).toBe(true);
  });

  it('malformed CSV (an unterminated quote): whatever sentence the host gives is drawn, and Add stays off', async () => {
    const reason = 'Line 2: a quoted cell is not closed.';
    const preview = vi.spyOn(api, 'extractionImportPreview').mockResolvedValue(plan({ format: 'csv', errors: [{ row: 2, where: 'row 2', reason }] }));
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await choose(new File(['record,name\nentry,"The Hatter\n'], 'quote.csv'));
    expect(await screen.findByText(reason)).toBeTruthy();
    expect(preview).toHaveBeenCalledWith('record,name\nentry,"The Hatter\n', 'csv');
    expect(addButton().disabled).toBe(true);
  });

  it('a binary file renamed .csv is read as UTF-8 text (bad bytes become U+FFFD) and the host refuses it in words', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x00, 0x01]);
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await choose(new File([bytes], 'photo.csv'));
    const table = await screen.findByRole('table', { name: 'Rows with errors' });
    expect(within(table).getByText(/not valid UTF-8|NUL byte/)).toBeTruthy();
    expect(addButton().disabled).toBe(true);
  });

  it('a NUL byte in pasted text is refused by the host with a sentence', async () => {
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste('record,name\nentry,a\u0000b');
    expect(await screen.findByText('The file contains a NUL byte, so it is not a text file.')).toBeTruthy();
    expect(addButton().disabled).toBe(true);
  });

  it('an unknown extension sends no hint; the host works the format out', async () => {
    const preview = vi.spyOn(api, 'extractionImportPreview');
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await choose(new File([VALID], 'notes.txt'));
    await screen.findByRole('table', { name: 'What will be added' });
    expect(preview).toHaveBeenCalledWith(VALID, undefined);
  });

  it("a wrong hint (JSON inside a .csv, in capitals) is the host's to refuse, in words", async () => {
    const preview = vi.spyOn(api, 'extractionImportPreview');
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await choose(new File([PRETTY], 'DATA.CSV'));
    const table = await screen.findByRole('table', { name: 'Rows with errors' });
    expect(preview).toHaveBeenCalledWith(PRETTY, 'csv');
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
    expect(addButton().disabled).toBe(true);
  });

  it('a missing required column shows the host sentence in the errors table', async () => {
    const reason = 'The header needs a "record" column.';
    vi.spyOn(api, 'extractionImportPreview').mockResolvedValue(plan({ format: 'csv', errors: [{ row: 1, where: 'header', reason }] }));
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste('name,type\nThe Hatter,Character');
    const table = await screen.findByRole('table', { name: 'Rows with errors' });
    expect(within(table).getByText(reason)).toBeTruthy();
    expect(within(table).getByText('header')).toBeTruthy();
    expect(addButton().disabled).toBe(true);
  });

  it('a file name with a right-to-left override is drawn without it, so it cannot read as another extension', async () => {
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await choose(new File([VALID], 'ab‮vsc.json'));
    expect(screen.getByText('abvsc.json')).toBeTruthy();
  });
});

describe('cells that look like formulas, and odd text', () => {
  it('a cell starting with = + - or @ stays text: drawn as written, committed as written, no link, nothing opened', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const names = ['=1+1', '+SUM(A1)', '-2+3', '@SUM(1)', "=cmd|'/C calc'!A0"];
    const csv = ['record,name,type', ...names.map((n) => `entry,${n},Item`)].join('\n');
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste(csv);
    const table = await screen.findByRole('table', { name: 'What will be added' });
    const labels = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[1]!.textContent);
    expect(labels).toEqual(names.map((n) => `${n} · Item`));
    expect(table.querySelector('a, [href], form')).toBeNull();
    await waitFor(() => expect(addButton().disabled).toBe(false));
    await userEvent.click(addButton());
    await waitFor(() => expect(open).not.toHaveBeenCalled());
    const stored = (await api.extractionList()).filter((s) => s.source === 'imported').map((s) => (s.payload.kind === 'entry' ? s.payload.name : ''));
    expect(stored).toEqual(expect.arrayContaining(names));
  });

  it('control characters, right-to-left, emoji and a 10,000-character name are drawn whole, as text', async () => {
    const odd = ['A\u0001B\u0007C', 'שלום עולם', 'مرحبا بالعالم', '🧙‍♂️🎩 Hatter 👨‍👩‍👧', 'x'.repeat(10_000), '<img src=x onerror=alert(1)>'];
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste(JSON.stringify({ entries: odd.map((name) => ({ name, confidence: 0.9 })) }));
    const table = await screen.findByRole('table', { name: 'What will be added' });
    const labels = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[1]!.textContent);
    expect(labels).toEqual(odd);
    expect(table.querySelector('img')).toBeNull();
    expect(screen.getByText('6 to add')).toBeTruthy();
  });
});

describe('the host is slow, silent or late', () => {
  it('never answers the preview: the narrator sees it is being checked, Add is off, Cancel closes', async () => {
    vi.spyOn(api, 'extractionImportPreview').mockReturnValue(new Promise(() => {}));
    const close = vi.fn();
    render(wrap(<ImportDialog onClose={close} />));
    paste(VALID);
    expect(await screen.findByText('Checking the text with the host…')).toBeTruthy();
    expect(addButton().disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('answers late after the dialog closed: nothing is applied, toasted or reopened', async () => {
    const late = deferred<ExtractionImportPlan>();
    vi.spyOn(api, 'extractionImportPreview').mockReturnValue(late.promise);
    const toast = vi.spyOn(overlay, 'toast');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const u = userEvent.setup();
    render(
      wrap(
        <>
          <button onClick={() => openImportDialog()}>Open import</button>
          <OverlayHost />
        </>,
      ),
    );
    await u.click(screen.getByRole('button', { name: 'Open import' }));
    await screen.findByRole('dialog', { name: 'Import entries' });
    paste(VALID);
    await settle(300);
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => late.resolve(plan({ lines: [line(1)], offered: 1 })));
    await settle(30);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(toast).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it('answers a failure late after the dialog closed: no toast, no dialog', async () => {
    const late = deferred<ExtractionImportPlan>();
    vi.spyOn(api, 'extractionImportPreview').mockReturnValue(late.promise);
    const toast = vi.spyOn(overlay, 'toast');
    const view = render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste(VALID);
    await settle(300);
    view.unmount();
    await act(async () => late.reject(new Error('too late')));
    expect(toast).not.toHaveBeenCalled();
  });

  it('answers out of order: the answer for older text never lands on newer text', async () => {
    const first = deferred<ExtractionImportPlan>();
    const preview = vi.spyOn(api, 'extractionImportPreview');
    preview.mockReturnValueOnce(first.promise);
    preview.mockResolvedValueOnce(plan({ lines: [line(1, 'Newer')], offered: 1 }));
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste('one');
    await settle(300);
    paste('two');
    await screen.findByText('Newer');
    await act(async () => first.resolve(plan({ lines: [line(1, 'Older'), line(2, 'Older too')], offered: 2 })));
    expect(screen.queryByText('Older')).toBeNull();
    expect(screen.getByText('1 to add')).toBeTruthy();
  });

  it('while newer text is being checked, Add is off even though an older plan is on show', async () => {
    const second = deferred<ExtractionImportPlan>();
    const preview = vi.spyOn(api, 'extractionImportPreview');
    preview.mockResolvedValueOnce(plan({ lines: [line(1)], offered: 1 }));
    preview.mockReturnValueOnce(second.promise);
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste('one');
    await waitFor(() => expect(addButton().disabled).toBe(false));
    paste('two');
    await settle(300);
    expect(addButton().disabled).toBe(true);
  });
});

describe('a preview that fails is a sentence, never silence or "Error: ..."', () => {
  const failWith = async (error: unknown) => {
    vi.spyOn(api, 'extractionImportPreview').mockRejectedValue(error);
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste(VALID);
    await waitFor(() => expect(alerts().length).toBe(1));
    return alerts()[0]!;
  };

  it('shows the host sentence', async () => {
    expect(await failWith(new Error('The host is busy.'))).toBe('The preview could not be made: The host is busy.');
    expect(addButton().disabled).toBe(true);
  });
  it('strips a raw "Error: " prefix', async () => {
    expect(await failWith(new Error('Error: Error: socket closed'))).toBe('The preview could not be made: socket closed');
  });
  it('reads a bare string rejection', async () => {
    expect(await failWith('the bridge is down')).toBe('The preview could not be made: the bridge is down');
  });
  it('says something when the host gives no words at all', async () => {
    expect(await failWith(new Error(''))).toBe('The preview could not be made: The host did not say why.');
  });
  it('says something for an object rejection', async () => {
    expect(await failWith({ code: 5 })).toBe('The preview could not be made: The host did not say why.');
  });
  it('readableFailure never returns an empty string', () => {
    for (const bad of [undefined, null, '', '  ', new Error(''), {}]) expect(readableFailure(bad, 'fallback')).toBe('fallback');
  });
});

describe('Add', () => {
  const ready = async () => {
    render(wrap(<ImportDialog onClose={close} />));
    paste(VALID);
    await screen.findByRole('table', { name: 'What will be added' });
    await waitFor(() => expect(addButton().disabled).toBe(false));
  };
  let close = vi.fn();
  beforeEach(() => {
    close = vi.fn();
  });

  it('a commit the host rejects: the sentence is shown, nothing is journalled, the dialog stays and Add works again', async () => {
    const commit = vi.spyOn(api, 'extractionImportCommit');
    commit.mockRejectedValueOnce(new Error('Error: The store is full.'));
    await ready();
    await userEvent.click(addButton());
    expect(await screen.findByText('Nothing was added: The store is full.')).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    expect(await journal.entries()).toHaveLength(0);
    expect(addButton().disabled).toBe(false);
    await userEvent.click(addButton());
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(commit).toHaveBeenCalledTimes(2);
    expect(await journal.entries()).toHaveLength(1);
  });

  it('a commit rejected with no words still says something', async () => {
    vi.spyOn(api, 'extractionImportCommit').mockRejectedValue(new Error(''));
    await ready();
    await userEvent.click(addButton());
    expect(await screen.findByText('Nothing was added: The host could not import that.')).toBeTruthy();
  });

  it('a failure after the host answered (the journal throws) cannot leave Add busy, and does not claim nothing was added', async () => {
    await ready();
    journal.subscribe(() => {
      throw new Error('listener broke');
    });
    await userEvent.click(addButton());
    const text = await screen.findByText(/The import may not have finished \(listener broke\)/);
    expect(text.textContent).toContain('Check the Story Bible before adding again.');
    expect(addButton().disabled).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it('a double click commits exactly once', async () => {
    const slow = deferred<ExtractionImportResult>();
    const commit = vi.spyOn(api, 'extractionImportCommit').mockReturnValue(slow.promise);
    await ready();
    const button = addButton();
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-busy') === 'true' || button.disabled).toBe(true);
    await act(async () => slow.resolve(MADE));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(await journal.entries()).toHaveLength(1);
  });

  it('closing mid-commit, then a success: one commit, one undo step, no second close, no dialog back', async () => {
    const slow = deferred<ExtractionImportResult>();
    const commit = vi.spyOn(api, 'extractionImportCommit').mockReturnValue(slow.promise);
    const toast = vi.spyOn(overlay, 'toast');
    const u = userEvent.setup();
    render(
      wrap(
        <>
          <button onClick={() => openImportDialog()}>Open import</button>
          <OverlayHost />
        </>,
      ),
    );
    await u.click(screen.getByRole('button', { name: 'Open import' }));
    await screen.findByRole('dialog', { name: 'Import entries' });
    paste(VALID);
    await waitFor(() => expect(addButton().disabled).toBe(false));
    await u.click(addButton());
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => slow.resolve(MADE));
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    expect(await journal.entries()).toHaveLength(1);
  });

  it('closing mid-commit, then a refusal: the narrator still hears it, in a toast', async () => {
    const slow = deferred<ExtractionImportResult>();
    vi.spyOn(api, 'extractionImportCommit').mockReturnValue(slow.promise);
    const toast = vi.spyOn(overlay, 'toast');
    const view = render(wrap(<ImportDialog onClose={close} />));
    paste(VALID);
    await screen.findByRole('table', { name: 'What will be added' });
    await waitFor(() => expect(addButton().disabled).toBe(false));
    await userEvent.click(addButton());
    view.unmount();
    await act(async () => slow.reject(new Error('The entry is locked.')));
    expect(toast).toHaveBeenCalledWith('Nothing was added: The entry is locked.', { tone: 'error' });
    expect(close).not.toHaveBeenCalled();
    expect(await journal.entries()).toHaveLength(0);
  });

  it('a file read that finishes after the narrator typed does not overwrite what they typed', async () => {
    const readers: FileReader[] = [];
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      readers.push(this);
    });
    render(wrap(<ImportDialog onClose={close} />));
    await choose(new File(['from the file'], 'slow.json'));
    paste('typed meanwhile');
    await act(async () => {
      Object.defineProperty(readers[0], 'result', { value: 'from the file' });
      readers[0]!.onload?.(new ProgressEvent('load') as never);
    });
    expect(textbox().value).toBe('typed meanwhile');
  });

  it('a dialog opened again after a reload-like remount starts empty, and a commit still in flight from the old one adds nothing here', async () => {
    const slow = deferred<ExtractionImportResult>();
    vi.spyOn(api, 'extractionImportCommit').mockReturnValue(slow.promise);
    const first = render(wrap(<ImportDialog onClose={close} />));
    paste(VALID);
    await screen.findByRole('table', { name: 'What will be added' });
    await waitFor(() => expect(addButton().disabled).toBe(false));
    await userEvent.click(addButton());
    first.unmount();
    render(wrap(<ImportDialog onClose={close} />));
    expect(textbox().value).toBe('');
    expect(addButton().disabled).toBe(true);
    await act(async () => slow.resolve(MADE));
    expect(close).not.toHaveBeenCalled();
  });
});

describe('Undo', () => {
  const imported = async () => {
    const changed = vi.fn();
    const close = vi.fn();
    render(wrap(<ImportDialog onClose={close} onChanged={changed} />));
    paste(VALID);
    await screen.findByRole('table', { name: 'What will be added' });
    await waitFor(() => expect(addButton().disabled).toBe(false));
    await userEvent.click(addButton());
    await waitFor(() => expect(close).toHaveBeenCalled());
    const [entry] = await journal.entries();
    return { entry: entry!, changed };
  };

  it('takes back what the import added, with one host call, and tells the page', async () => {
    const before = (await api.extractionList()).length;
    const undo = vi.spyOn(api, 'extractionImportUndo');
    const { entry, changed } = await imported();
    expect(entry.label).toBe('Imported entries');
    expect((await api.extractionList()).length).toBe(before + 1);
    expect(await journal.undo(entry.id)).toEqual({ ok: true, value: undefined });
    expect(undo).toHaveBeenCalledTimes(1);
    expect((await api.extractionList()).length).toBe(before);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(await journal.entries()).toHaveLength(0);
  });

  it('after a later edit of the same things, is refused in a sentence and the host is not called', async () => {
    const undo = vi.spyOn(api, 'extractionImportUndo');
    const { entry } = await imported();
    await journal.act({
      label: 'Edited a suggestion',
      touches: ['extraction'],
      run: async () => ({ ok: true, value: 1 }),
      undo: async () => ({ ok: true, value: 1 }),
    });
    const result = await journal.undo(entry.id);
    expect(result).toEqual({ ok: false, refusal: { code: 'same-thing', reason: "Undo 'Edited a suggestion' first. It changed the same thing." } });
    expect(undo).not.toHaveBeenCalled();
  });

  it('after an edit of something else, still goes ahead', async () => {
    const { entry } = await imported();
    await journal.act({
      label: 'Renamed a chapter',
      touches: ['chapters/3'],
      run: async () => ({ ok: true, value: 1 }),
      undo: async () => ({ ok: true, value: 1 }),
    });
    expect((await journal.undo(entry.id)).ok).toBe(true);
  });

  it('when the host refuses, shows the host sentence, keeps the step and does not re-read the page', async () => {
    vi.spyOn(api, 'extractionImportUndo').mockRejectedValue(new Error('Error: The entry is locked.'));
    const { entry, changed } = await imported();
    expect(await journal.undo(entry.id)).toEqual({ ok: false, refusal: { code: 'host-refused', reason: 'The entry is locked.' } });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(await journal.entries()).toHaveLength(1);
  });

  it('when the host refuses with no words, still says something', async () => {
    vi.spyOn(api, 'extractionImportUndo').mockRejectedValue(undefined);
    const { entry } = await imported();
    expect(await journal.undo(entry.id)).toEqual({ ok: false, refusal: { code: 'host-refused', reason: 'The host could not take the import back.' } });
  });

  it('called twice (even at once) takes the import back once; the second says "Already undone."', async () => {
    const undo = vi.spyOn(api, 'extractionImportUndo');
    const { entry } = await imported();
    const [a, b] = await Promise.all([journal.undo(entry.id), journal.undo(entry.id)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const refused = [a, b].find((r) => !r.ok)!;
    expect(refused).toEqual({ ok: false, refusal: { code: 'already-undone', reason: 'Already undone.' } });
    expect((await journal.undo(entry.id)).ok).toBe(false);
    expect(undo).toHaveBeenCalledTimes(1);
  });
});

// Base UI's focus guards sit at the dialog's edges and hand focus back inside; landing on one is the trap working, not leaving.
// jsdom cannot finish the wrap (focus ends on <body> after a guard), so the check is that Tab never reaches the page behind the dialog.
const stays = (dialog: HTMLElement) => {
  const now = document.activeElement;
  return dialog.contains(now) || now === document.body || now?.hasAttribute('data-base-ui-focus-guard') === true;
};

describe('the dialog as a dialog', () => {
  const open = async () => {
    const u = userEvent.setup();
    render(
      wrap(
        <>
          <button onClick={() => openImportDialog()}>Import entries</button>
          <OverlayHost />
        </>,
      ),
    );
    const opener = screen.getByRole('button', { name: 'Import entries' });
    await u.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Import entries' });
    return { u, opener, dialog };
  };

  it('is a dialog named "Import entries" that holds focus inside', async () => {
    const { dialog } = await open();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('Tab and Shift+Tab never reach the page behind the dialog', async () => {
    const { u, dialog } = await open();
    for (let i = 0; i < 25; i++) {
      await u.tab();
      // Base UI's focus guards hand focus back on the next task, which a loaded machine delays.
      await waitFor(() => expect(stays(dialog)).toBe(true));
    }
    for (let i = 0; i < 3; i++) {
      await u.tab({ shift: true });
      // Base UI's focus guards hand focus back on the next task, which a loaded machine delays.
      await waitFor(() => expect(stays(dialog)).toBe(true));
    }
  });

  it('Escape closes it without importing and gives focus back to the Import button, even with text and a preview on show', async () => {
    const commit = vi.spyOn(api, 'extractionImportCommit');
    const { u, opener } = await open();
    paste(VALID);
    await screen.findByRole('table', { name: 'What will be added' });
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(commit).not.toHaveBeenCalled();
  });

  it('a click outside does not close it (a half-pasted file is not thrown away by a stray click)', async () => {
    const { u, opener } = await open();
    paste(VALID);
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);
    await settle();
    expect(screen.getByRole('dialog', { name: 'Import entries' })).toBeTruthy();
    expect(textbox().value).toBe(VALID);
    void u;
    void opener;
  });
});

// Not tested here, with reasons:
// - Focus wrapping from the last control back to the first: jsdom ends on <body> after Base UI's focus guard, so only "never reaches the page
//   behind" is asserted; the wrap itself is the overlay primitive's, checked in the browser (ui-visual-verification, `pnpm run aria`).
// - A real reload mid-import: a reload discards the page and the dialog's state; nothing about an import is persisted by the page, and the
//   host's commit is one call that either stored everything or refused. The remount test above covers a fresh dialog beside an old call.
// - A real 50 MB file through the OS picker, and a real pasted 50 MB: jsdom has no picker; the page's guard is the `size` check and the
//   text-length check tested above, and the host re-checks (threat-model row 6zb).
// - Whether the host parses a quoted CSV cell, an unterminated quote or a 5000-row cap correctly: that is apps/desktop/internal/extraction/importer
//   (Go tests); the mock host here does not parse quotes. The page's part is drawing the host's sentence, tested with a stubbed plan.
// - Bidi and emoji glyph shaping: jsdom draws nothing; the tests check the text is carried whole and as text. The Playwright visual suite owns the pixels.
