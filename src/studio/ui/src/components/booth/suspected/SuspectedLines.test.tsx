// @vitest-environment jsdom
import { within, act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { TeleprompterFlagFinding, TeleprompterFlagSave } from '../../../api/contracts/teleprompter';
import { overlay } from '../../../overlay/overlayService';
import { createJournal } from '../../../studio/journal/createJournal';
import { StudioProvider } from '../../../studio/StudioProvider';
import { SuspectedLines } from './SuspectedLines';
import type { SuspectedFlag } from './suspectedLinesModel';
import { useSuspectedPickups } from './useSuspectedPickups';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const skipped: SuspectedFlag = {
  chapterId: 'c8',
  paragraphId: 'p9',
  kind: 'skipped',
  wordStart: 2,
  wordEnd: 5,
  scriptStart: 40,
  scriptEnd: 43,
  script: 'down the hole',
  heard: '',
};
const again: SuspectedFlag = {
  chapterId: 'c8',
  paragraphId: 'p12',
  kind: 'restart',
  wordStart: 0,
  wordEnd: 3,
  scriptStart: 90,
  scriptEnd: 93,
  script: 'Alice was beginning',
  heard: 'Alice was be Alice was beginning',
};

/** A host that keeps decisions by finding id, as `TeleprompterSaveFlags` does. */
function host() {
  const decided = new Set<string>();
  const save = vi.fn(async (_chapter: string, flags: TeleprompterFlagSave[]) =>
    flags.map((f) => {
      const id = `c8:${f.paragraphId}:${f.kind}:${f.wordStart}-${f.wordEnd}`;
      if (f.dismissed) decided.add(id);
      const status = decided.has(id) ? 'dismissed' : accepted.has(id) ? 'accepted' : 'unreviewed';
      return { id, evidence_version: 'v1', review: { status } } as unknown as TeleprompterFlagFinding;
    }),
  );
  const accepted = new Set<string>();
  const review = vi.fn(async (request: { id: string; status: string }) => {
    decided.delete(request.id);
    if (request.status === 'accepted') accepted.add(request.id);
    else accepted.delete(request.id);
    return { id: request.id, evidence_version: 'v2', review: { status: request.status } } as never;
  });
  const api = { ...createMockApi(), teleprompterSaveFlags: save, findingsReview: review };
  const view = (flags: SuspectedFlag[]) => (
    <ApiProvider api={api}>
      <SuspectedLines chapterId="c8" flags={flags} />
    </ApiProvider>
  );
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  return { save, review, view, wrapper, accepted };
}

describe('SuspectedLines', () => {
  it('a-skip-or-restart-is-listed-as-a-suspected-line: shows the script words and what was heard', async () => {
    const { view } = host();
    render(view([skipped, again]));
    // Each is a card: a chip for what was suspected, then the line.
    const cards = await screen.findAllByRole('listitem');
    expect(within(cards[0]).getByText('Skipped')).toBeTruthy();
    expect(within(cards[0]).getByText(/down the hole/)).toBeTruthy();
    expect(within(cards[1]).getByText('Read again')).toBeTruthy();
    expect(within(cards[1]).getAllByText(/Alice was beginning/).length).toBeGreaterThan(0);
    expect(screen.getByText(/heard “Alice was be Alice was beginning”/)).toBeTruthy();
    expect(screen.getByText('Suspected · 2')).toBeTruthy();
  });

  it('each-line-can-be-dismissed-with-undo: records one dismissed decision, reads Dismissed and offers Undo', async () => {
    const { save, review, view } = host();
    const toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    render(view([skipped, again]));
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss: down the hole' }));
    await waitFor(() => expect(screen.getByText('Dismissed')).toBeTruthy());
    const dismissedSaves = save.mock.calls.flatMap(([, flags]) => flags).filter((f) => f.dismissed);
    expect(dismissedSaves).toHaveLength(1);
    expect(dismissedSaves[0]).toMatchObject({ paragraphId: 'p9', kind: 'skipped' });
    expect(screen.getByText('Suspected · 1')).toBeTruthy();
    expect(toastUndo).toHaveBeenCalledWith('Dismissed.', expect.any(Function), { entry: expect.any(Number) });
    const result = await toastUndo.mock.calls[0][1]();
    expect(result.ok).toBe(true);
    expect(review).toHaveBeenCalledWith(expect.objectContaining({ status: 'unreviewed' }));
    await waitFor(() => expect(screen.queryByText('Dismissed')).toBeNull());
  });

  it('a dismissal is one journal entry, and Ctrl+Z brings the line back', async () => {
    const { review, wrapper } = host();
    const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
    vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    render(
      <StudioProvider journal={journal}>
        <SuspectedLines chapterId="c8" flags={[skipped, again]} />
      </StudioProvider>,
      { wrapper },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss: down the hole' }));
    await waitFor(() => expect(screen.getByText('Dismissed')).toBeTruthy());
    const [row] = await journal.entries();
    expect(row).toMatchObject({ label: 'Dismissed a suspected line', undoable: true });
    expect((await journal.undoLast()).ok).toBe(true);
    expect(review).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'unreviewed' }));
    await waitFor(() => expect(screen.getByText('Suspected · 2')).toBeTruthy());
  });

  it('the-key-is-stable-and-a-dismissed-line-stays-dismissed: a re-read comes back dismissed, once', async () => {
    const { view } = host();
    vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    const first = render(view([skipped]));
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss: down the hole' }));
    await waitFor(() => expect(screen.getByText('Dismissed')).toBeTruthy());
    first.unmount();
    render(view([skipped, { ...skipped }]));
    expect(await screen.findByText('Dismissed')).toBeTruthy();
    expect(screen.getAllByText(/down the hole/)).toHaveLength(1);
  });

  // The second listen (the confirmation pass) judged each line a few seconds after it was suspected.
  it('a line the second listen cleared stays in the list as Not confirmed: dimmed, not counted, nothing to dismiss and never saved', async () => {
    const { save, view } = host();
    render(view([skipped, { ...again, check: 'cleared' }]));
    const cards = await screen.findAllByRole('listitem');
    expect(within(cards[1]).getByText('Not confirmed')).toBeTruthy();
    expect(within(cards[1]).queryByRole('button')).toBeNull();
    expect(screen.getByText('Suspected · 1')).toBeTruthy();
    await waitFor(() => expect(save).toHaveBeenCalled());
    const sent = save.mock.calls.flatMap(([, flags]) => flags);
    expect(sent.map((f) => f.paragraphId)).toEqual(['p9']);
    expect(sent.some((f) => f.check === 'cleared')).toBe(false);
  });

  it('a line the second listen heard too says Confirmed and keeps its dismiss control', async () => {
    const { save, view } = host();
    render(view([{ ...skipped, check: 'confirmed' }]));
    const [card] = await screen.findAllByRole('listitem');
    expect(within(card).getByText('Confirmed')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Dismiss: down the hole' })).toBeTruthy();
    await waitFor(() => expect(save.mock.calls.flatMap(([, flags]) => flags)[0]).toMatchObject({ check: 'confirmed' }));
  });

  it('a list of only cleared lines saves nothing and counts none open', async () => {
    const { save, view } = host();
    render(view([{ ...skipped, check: 'cleared' }]));
    expect(await screen.findByText('Suspected · 0')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it('shows nothing when there are no flags', () => {
    const { view } = host();
    const { container } = render(view([]));
    expect(container.textContent).toBe('');
  });
});

describe('suspected lines feed Pickups', () => {
  const read = (...ids: string[]) => ({ paragraphIds: new Set(ids) });

  it('the accepted lines are one journal entry, and Ctrl+Z puts them back', async () => {
    const { review, wrapper, accepted } = host();
    const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
    vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    const inJournal = ({ children }: { children: ReactNode }) => wrapper({ children: <StudioProvider journal={journal}>{children}</StudioProvider> });
    const { result } = renderHook(() => useSuspectedPickups({ chapterId: 'c8', flags: [skipped, again] }), { wrapper: inJournal });
    await act(async () => {
      await result.current.takeStopped(read('p9'));
    });
    const [row] = await journal.entries();
    expect(row).toMatchObject({ label: '1 suspected line added to Pickups', touches: ['pickups', 'proof/finding/c8:p9:skipped:2-5'], undoable: true });
    expect([...accepted]).toEqual(['c8:p9:skipped:2-5']);
    expect((await journal.undoLast()).ok).toBe(true);
    expect(review).toHaveBeenLastCalledWith({ id: 'c8:p9:skipped:2-5', evidenceVersion: 'v2', status: 'unreviewed', note: '' });
  });

  it('a take that read over a flagged place adds a Speech pickup with Undo', async () => {
    const { review, wrapper, accepted } = host();
    const toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    const { result } = renderHook(() => useSuspectedPickups({ chapterId: 'c8', flags: [skipped, again] }), { wrapper });
    let added = 0;
    await act(async () => {
      added = await result.current.takeStopped(read('p9'));
    });
    // The live speech check's finding, accepted: the host's shared pickup list carries it from here.
    expect(added).toBe(1);
    expect(review).toHaveBeenCalledExactlyOnceWith({ id: 'c8:p9:skipped:2-5', evidenceVersion: 'v1', status: 'accepted', note: '' });
    expect([...accepted]).toEqual(['c8:p9:skipped:2-5']);
    expect(toastUndo).toHaveBeenCalledWith('Take saved · 1 suspected line added to Pickups', expect.any(Function), { entry: expect.any(Number) });
    const undone = await toastUndo.mock.calls[0][1]();
    expect(undone.ok).toBe(true);
    expect(review).toHaveBeenLastCalledWith({ id: 'c8:p9:skipped:2-5', evidenceVersion: 'v2', status: 'unreviewed', note: '' });
    expect(accepted.size).toBe(0);
  });

  it('with a DAW take, the toast that says the take is saved undoes the take first; a refusal leaves the lines', async () => {
    const { review, wrapper, accepted } = host();
    const toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    const { result } = renderHook(() => useSuspectedPickups({ chapterId: 'c8', flags: [skipped, again] }), { wrapper });
    const refusedTake = vi.fn(async () => ({ ok: false as const, refusal: { code: 'daw-last-action', reason: 'not the last action' } }));
    await act(async () => {
      await result.current.takeStopped({ ...read('p9'), undoTake: refusedTake, entry: 3 });
    });
    expect(toastUndo).toHaveBeenCalledWith('Take saved · 1 suspected line added to Pickups', expect.any(Function), { entry: 3 });
    expect(await toastUndo.mock.calls[0][1]()).toEqual({ ok: false, refusal: { code: 'daw-last-action', reason: 'not the last action' } });
    expect([...accepted]).toEqual(['c8:p9:skipped:2-5']);
    expect(review).toHaveBeenCalledTimes(1);
  });

  it('with a DAW take but another toast already saying it is saved, this Undo leaves the take alone', async () => {
    const { wrapper } = host();
    const toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    const { result } = renderHook(() => useSuspectedPickups({ chapterId: 'c8', flags: [skipped, again] }), { wrapper });
    const undoTake = vi.fn(async () => ({ ok: true as const, value: null }));
    await act(async () => {
      await result.current.takeStopped({ ...read('p9'), saidSaved: true, undoTake, entry: 3 });
    });
    expect(toastUndo).toHaveBeenCalledWith('1 suspected line added to Pickups', expect.any(Function), { entry: expect.any(Number) });
    expect((await toastUndo.mock.calls[0][1]()).ok).toBe(true);
    expect(undoTake).not.toHaveBeenCalled();
  });

  it('a line the second listen cleared never becomes a pickup', async () => {
    const { review, wrapper, save } = host();
    vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    const { result } = renderHook(() => useSuspectedPickups({ chapterId: 'c8', flags: [{ ...skipped, check: 'cleared' }, again] }), { wrapper });
    await act(async () => {
      await result.current.takeStopped(read('p9', 'p12'));
    });
    expect(save.mock.calls.flatMap(([, flags]) => flags).map((f) => f.paragraphId)).toEqual(['p12']);
    expect(review).toHaveBeenCalledTimes(1);
  });

  it('a take that does not reach a flagged place adds nothing, and the same place read again is added once', async () => {
    const { review, wrapper } = host();
    const toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    const { result } = renderHook(() => useSuspectedPickups({ chapterId: 'c8', flags: [skipped, again] }), { wrapper });
    await act(async () => {
      expect(await result.current.takeStopped(read('p1'))).toBe(0);
    });
    expect(review).not.toHaveBeenCalled();
    await act(async () => {
      expect(await result.current.takeStopped(read('p9', 'p12'))).toBe(2);
      expect(await result.current.takeStopped(read('p9', 'p12'))).toBe(0);
    });
    expect(review).toHaveBeenCalledTimes(2);
    expect(toastUndo).toHaveBeenCalledExactlyOnceWith('Take saved · 2 suspected lines added to Pickups', expect.any(Function), {
      entry: expect.any(Number),
    });
  });

  it('a dismissed line is not added, and a take that leaves the Booth adds without a toast', async () => {
    const { save, review, wrapper } = host();
    await save('c8', [{ ...skipped, dismissed: true } as unknown as TeleprompterFlagSave]);
    const toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    const { result } = renderHook(() => useSuspectedPickups({ chapterId: 'c8', flags: [skipped, again] }), { wrapper });
    await act(async () => {
      expect(await result.current.takeStopped({ ...read('p9', 'p12'), quiet: true })).toBe(1);
    });
    expect(review).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'c8:p12:restart:0-3', status: 'accepted' }));
    expect(toastUndo).not.toHaveBeenCalled();
  });

  it('a refused save says the host sentence and adds nothing', async () => {
    const { save, review, wrapper } = host();
    save.mockRejectedValueOnce(new Error('no project is open'));
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const { result } = renderHook(() => useSuspectedPickups({ chapterId: 'c8', flags: [skipped] }), { wrapper });
    await act(async () => {
      expect(await result.current.takeStopped(read('p9'))).toBe(0);
    });
    expect(review).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('no project is open', { tone: 'error' });
  });

  it('after pickups were marked recorded, its toast does not say the take was saved again', async () => {
    const { wrapper } = host();
    const toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    const { result } = renderHook(() => useSuspectedPickups({ chapterId: 'c8', flags: [skipped] }), { wrapper });
    await act(async () => {
      await result.current.takeStopped({ ...read('p9'), saidSaved: true });
    });
    expect(toastUndo).toHaveBeenCalledWith('1 suspected line added to Pickups', expect.any(Function), { entry: expect.any(Number) });
  });
});

describe('there-is-no-way-to-flag-by-hand and the-provider-decides', () => {
  const sources = readdirSync(__dirname)
    .filter((name) => /\.tsx?$/.test(name) && !/\.(test|stories)\./.test(name))
    .map((name) => [name, readFileSync(join(__dirname, name), 'utf8')] as const);

  it('has no key handler and no add or flag control', () => {
    for (const [name, text] of sources) {
      expect(text, name).not.toMatch(/onKeyDown|onKeyUp|addEventListener\(\s*['"]key/);
      expect(text, name).not.toMatch(/Flag for edit|Add a flag|Flag this/i);
    }
  });

  it('names no speech engine: the host decides', () => {
    for (const [name, text] of sources) expect(text, name).not.toMatch(/moonshine|whisper/i);
  });
});
