// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { TeleprompterFlagFinding, TeleprompterFlagSave } from '../../../api/contracts/teleprompter';
import { overlay } from '../../../overlay/overlayService';
import { SuspectedLines } from './SuspectedLines';
import type { SuspectedFlag } from './suspectedLines';
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
    expect(await screen.findByText(/Skipped · down the hole/)).toBeTruthy();
    expect(screen.getByText(/Read again · Alice was beginning/)).toBeTruthy();
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
    expect(toastUndo).toHaveBeenCalledWith('Dismissed.', expect.any(Function));
    const result = await toastUndo.mock.calls[0][1]();
    expect(result.ok).toBe(true);
    expect(review).toHaveBeenCalledWith(expect.objectContaining({ status: 'unreviewed' }));
    await waitFor(() => expect(screen.queryByText('Dismissed')).toBeNull());
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

  it('shows nothing when there are no flags', () => {
    const { view } = host();
    const { container } = render(view([]));
    expect(container.textContent).toBe('');
  });
});

describe('suspected lines feed Pickups', () => {
  const read = (...ids: string[]) => ({ paragraphIds: new Set(ids) });

  it('a take that read over a flagged place adds a Speech pickup with Undo', async () => {
    const { review, wrapper, accepted } = host();
    const toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    const { result } = renderHook(() => useSuspectedPickups({ chapterId: 'c8', flags: [skipped, again] }), { wrapper });
    let added = 0;
    await act(async () => {
      added = await result.current.takeStopped(read('p9'));
    });
    // The live speech check's finding, accepted: the host's shared pickup list carries it from here (ADR 0840).
    expect(added).toBe(1);
    expect(review).toHaveBeenCalledExactlyOnceWith({ id: 'c8:p9:skipped:2-5', evidenceVersion: 'v1', status: 'accepted', note: '' });
    expect([...accepted]).toEqual(['c8:p9:skipped:2-5']);
    expect(toastUndo).toHaveBeenCalledWith('Take saved · 1 suspected line added to Pickups', expect.any(Function));
    const undone = await toastUndo.mock.calls[0][1]();
    expect(undone.ok).toBe(true);
    expect(review).toHaveBeenLastCalledWith({ id: 'c8:p9:skipped:2-5', evidenceVersion: 'v2', status: 'unreviewed', note: '' });
    expect(accepted.size).toBe(0);
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
    expect(toastUndo).toHaveBeenCalledExactlyOnceWith('Take saved · 2 suspected lines added to Pickups', expect.any(Function));
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
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('no project is open'), { tone: 'error' });
  });

  it('after pickups were marked recorded, its toast does not say the take was saved again', async () => {
    const { wrapper } = host();
    const toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    const { result } = renderHook(() => useSuspectedPickups({ chapterId: 'c8', flags: [skipped] }), { wrapper });
    await act(async () => {
      await result.current.takeStopped({ ...read('p9'), saidSaved: true });
    });
    expect(toastUndo).toHaveBeenCalledWith('1 suspected line added to Pickups', expect.any(Function));
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
