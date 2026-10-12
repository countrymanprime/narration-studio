// @vitest-environment jsdom
// SN-X522: the import dialog, ported from the Studio Next mock's tests/extraction.test.tsx ("the import dialog") and checked against the
// mock host, which plans and stores an import the way the real one does.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import type { ExtractionImportPlan } from '../../../../api/contracts/extraction';
import { createMockApi } from '../../../../api/mockApi';
import { OverlayHost } from '../../../../overlay/OverlayHost';
import { overlay } from '../../../../overlay/overlayService';
import { StudioProvider } from '../../../../studio/StudioProvider';
import type { NarrationApi } from '../../../../types';
import { ImportDialog } from './ImportDialog';
import { LIST_CAP, tooBigSentence } from './importModel';
import { openImportDialog } from './openImportDialog';

let api: NarrationApi;
const wrap = (children: React.ReactNode) => (
  <ApiProvider api={api}>
    <StudioProvider>{children}</StudioProvider>
  </ApiProvider>
);
const VALID = JSON.stringify({
  entries: [
    { name: 'The Mad Hatter', type: 'Character', confidence: 0.9 },
    { name: 'The Dormouse', type: 'Character', confidence: 0.5 },
  ],
});
const paste = (value: string) => fireEvent.change(screen.getByLabelText('Paste JSON or CSV'), { target: { value } });
const addButton = () => screen.getByRole('button', { name: /to the Story Bible$/ }) as HTMLButtonElement;

beforeEach(() => {
  api = createMockApi();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('previews-a-valid-blob-and-adds-it-in-one-go', () => {
  it('previews through the host, then Add commits once, closes and journals one undo step', async () => {
    const preview = vi.spyOn(api, 'extractionImportPreview');
    const commit = vi.spyOn(api, 'extractionImportCommit');
    const reopen = vi.spyOn(api, 'extractionReopen');
    const close = vi.fn();
    const changed = vi.fn();
    render(wrap(<ImportDialog onClose={close} onChanged={changed} />));
    paste(VALID);
    expect(preview).not.toHaveBeenCalled();
    await screen.findByRole('table', { name: 'What will be added' });
    expect(preview).toHaveBeenCalledTimes(1);
    expect(screen.getByText('2 to add')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'What will be added' })).getAllByRole('row')).toHaveLength(3);
    await waitFor(() => expect(addButton().disabled).toBe(false));
    expect(addButton().textContent).toBe('Add 2 to the Story Bible');
    await userEvent.click(addButton());
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    const made = (await commit.mock.results[0]!.value) as { suggestions: { id: string }[] };
    expect(made.suggestions.length).toBe(2);
    expect(reopen).not.toHaveBeenCalled();
  });

  const journalOnce = () =>
    vi.fn(async (command: { run(): Promise<unknown>; undo?(r: unknown): Promise<unknown> }) => {
      const ran = (await command.run()) as { ok: true; value: unknown };
      return { ok: true as const, value: { id: 1, value: ran.value, undo: () => command.undo!(ran.value) } };
    });

  it('undoes a fresh import with one extractionImportUndo that removes what it created', async () => {
    const { importEntries } = await import('./commands');
    const undo = vi.spyOn(api, 'extractionImportUndo');
    const reopen = vi.spyOn(api, 'extractionReopen');
    const act = journalOnce();
    const changed = vi.fn();
    const before = await api.extractionList();
    const result = await importEntries({ journal: { act } as never, port: api, changed }, VALID);
    expect(result.ok).toBe(true);
    expect(act).toHaveBeenCalledTimes(1);
    const entry = (await act.mock.results[0]!.value).value;
    const made = entry.value as { suggestions: { id: string }[] };
    expect(made.suggestions).toHaveLength(2);
    expect(await api.extractionList()).toHaveLength(before.length + 2);

    const undone = await entry.undo();
    expect(undone).toEqual({ ok: true, value: undefined });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledWith(made.suggestions.map((s) => s.id));
    expect(reopen).not.toHaveBeenCalled();
    expect(await api.extractionList()).toEqual(before);
    expect(changed).toHaveBeenCalledTimes(2);
    // The same file offers the same rows again.
    expect((await api.extractionImportPreview(VALID)).offered).toBe(2);
  });

  it('a refused undo is the host sentence and reads nothing again', async () => {
    const { importEntries } = await import('./commands');
    vi.spyOn(api, 'extractionImportUndo').mockRejectedValue(new Error('The entry is locked.'));
    const act = journalOnce();
    const changed = vi.fn();
    await importEntries({ journal: { act } as never, port: api, changed }, VALID);
    const entry = (await act.mock.results[0]!.value).value;
    expect(await entry.undo()).toEqual({ ok: false, refusal: { code: 'host-refused', reason: 'The entry is locked.' } });
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

describe('shows-each-bad-row-and-keeps-add-off', () => {
  it('lists each row, where and why, and Add is off with no count', async () => {
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste('record,name,type\nentry,,Item\nbanana,x,y');
    const table = await screen.findByRole('table', { name: 'Rows with errors' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['1', '2']);
    expect(rows.map((r) => within(r).getAllByRole('cell')[1]!.textContent)).toEqual(['row 2', 'row 3']);
    expect(screen.getByText('2 errors')).toBeTruthy();
    expect(addButton().disabled).toBe(true);
    expect(addButton().textContent).toBe('Add to the Story Bible');
  });
});

describe('reads-a-chosen-file-with-a-size-precheck', () => {
  const input = () => document.querySelector('input[type="file"]') as HTMLInputElement;
  const choose = async (file: File) => {
    await act(async () => {
      fireEvent.change(input(), { target: { files: [file] } });
      await new Promise((r) => setTimeout(r, 30));
    });
  };

  it('reads a .csv as text and sets the format hint from the extension', async () => {
    const preview = vi.spyOn(api, 'extractionImportPreview');
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    expect(input().accept).toBe('.csv,.json');
    const csv = 'record,name,type,confidence\nentry,The Dormouse,Character,0.9';
    await choose(new File([csv], 'sheet.csv', { type: 'text/csv' }));
    expect((screen.getByLabelText('Paste JSON or CSV') as HTMLTextAreaElement).value).toBe(csv);
    expect(screen.getByText('sheet.csv')).toBeTruthy();
    await screen.findByRole('table', { name: 'What will be added' });
    expect(preview).toHaveBeenCalledWith(csv, 'csv');
  });

  it('refuses a file over the host limit before reading it', async () => {
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    const prompts = await api.extractionImportPrompt('json');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy the prompt for your own LLM' })).toBeTruthy());
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
    const big = new File(['{}'], 'big.json');
    Object.defineProperty(big, 'size', { value: prompts.maxBytes + 1 });
    const read = vi.spyOn(FileReader.prototype, 'readAsText');
    await choose(big);
    expect((await screen.findByRole('alert')).textContent).toBe(tooBigSentence(prompts.maxBytes));
    expect(tooBigSentence(2 << 20)).toBe('That file is too big to import (limit 2 MB).');
    expect(read).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Paste JSON or CSV') as HTMLTextAreaElement).value).toBe('');
  });

  it('says so when the read fails', async () => {
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      queueMicrotask(() => this.onerror?.(new ProgressEvent('error') as never));
    });
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await choose(new File(['x'], 'a.json'));
    expect((await screen.findByRole('alert')).textContent).toBe('That file could not be read.');
  });
});

describe('no-path-ever-leaves-the-page', () => {
  it('passes only text and a format hint to every binding', async () => {
    const calls: unknown[][] = [];
    for (const name of ['extractionImportPreview', 'extractionImportCommit', 'extractionImportPrompt'] as const) {
      const real = api[name].bind(api) as (...a: unknown[]) => Promise<unknown>;
      (api as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        calls.push(args);
        return real(...args);
      };
    }
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await act(async () => {
      fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File([VALID], 'C:\\secret\\hatter.json')] } });
      await new Promise((r) => setTimeout(r, 30));
    });
    await screen.findByRole('table', { name: 'What will be added' });
    await waitFor(() => expect(addButton().disabled).toBe(false));
    await userEvent.click(addButton());
    await waitFor(() => expect(calls.some((c) => c.length === 2 && c[0] === VALID && c[1] === 'json')).toBe(true));
    expect(JSON.stringify(calls)).not.toMatch(/secret|hatter\.json/);
    for (const args of calls) expect(args.every((a) => a === undefined || typeof a === 'string')).toBe(true);
  });
});

describe('copies-the-prompt-and-the-example', () => {
  const clipboard = () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => (written.push(t), Promise.resolve()) } });
    return written;
  };

  it('copies exactly the host prompt for the input format, or the example format', async () => {
    const written = clipboard();
    const csvPrompt = await api.extractionImportPrompt('csv');
    const jsonPrompt = await api.extractionImportPrompt('json');
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    const copy = screen.getByRole('button', { name: 'Copy the prompt for your own LLM' });
    await waitFor(async () => {
      await userEvent.click(copy);
      expect(written.length).toBeGreaterThan(0);
    });
    expect(written[0]).toBe(jsonPrompt.prompt);
    written.length = 0;
    paste('record,name,type,confidence\nentry,The Dormouse,Character,0.9');
    await screen.findByRole('table', { name: 'What will be added' });
    await userEvent.click(copy);
    await waitFor(() => expect(written).toEqual([csvPrompt.prompt]));
  });

  it('says "Copy failed." when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('no')) } });
    const toast = vi.spyOn(overlay, 'toast');
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
    await userEvent.click(screen.getByRole('button', { name: 'Copy the prompt for your own LLM' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Copy failed.', { tone: 'error' }));
  });
});

describe('example-box-switches-format', () => {
  it('shows the host JSON and CSV examples in a focusable, labelled box and copies them', async () => {
    const json = await api.extractionImportPrompt('json');
    const csv = await api.extractionImportPrompt('csv');
    const u = userEvent.setup();
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => (written.push(t), Promise.resolve()) } });
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    await u.click(screen.getByRole('button', { name: 'Show the format example' }));
    const box = await screen.findByLabelText('Format example');
    expect(box.getAttribute('tabindex')).toBe('0');
    await waitFor(() => expect(box.textContent).toBe(json.example));
    await u.click(screen.getByRole('button', { name: 'CSV' }));
    expect(box.textContent).toBe(csv.example);
    await u.click(screen.getByRole('button', { name: 'Copy the example' }));
    await waitFor(() => expect(written).toEqual([csv.example]));
    expect(screen.getByRole('button', { name: 'Hide the format example' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('dialog-behaves-as-a-dialog', () => {
  it('moves focus in, closes on Escape and Cancel without importing, and returns focus to the opener', async () => {
    const commit = vi.spyOn(api, 'extractionImportCommit');
    const u = userEvent.setup();
    render(
      wrap(
        <>
          <button onClick={() => openImportDialog()}>Open import</button>
          <OverlayHost />
        </>,
      ),
    );
    const opener = screen.getByRole('button', { name: 'Open import' });
    await u.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Import entries' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    await u.click(opener);
    await u.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('long-previews-stay-usable', () => {
  it('draws a capped list with "and N more" while the counts stay exact', async () => {
    const lines = Array.from({ length: 5000 }, (_, i) => ({
      row: i + 1,
      where: `row ${i + 1}`,
      kind: 'entry' as const,
      label: `Name ${i}`,
      action: 'add' as const,
      status: 'accepted-auto' as const,
      confidence: 0.9,
      note: '',
    }));
    const plan: ExtractionImportPlan = { format: 'json', lines, errors: [], offered: 5000 };
    vi.spyOn(api, 'extractionImportPreview').mockResolvedValue(plan);
    render(wrap(<ImportDialog onClose={vi.fn()} />));
    paste('{"entries":[]}');
    const table = await screen.findByRole('table', { name: 'What will be added' });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + LIST_CAP + 1);
    expect(screen.getByText(`and ${5000 - LIST_CAP} more`)).toBeTruthy();
    expect(screen.getByText('5000 to add')).toBeTruthy();
    await waitFor(() => expect(addButton().textContent).toBe('Add 5000 to the Story Bible'));
  });
});
