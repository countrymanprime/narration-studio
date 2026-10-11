// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
      return { id, evidence_version: 'v1', review: { status: decided.has(id) ? 'dismissed' : 'unreviewed' } } as unknown as TeleprompterFlagFinding;
    }),
  );
  const review = vi.fn(async (request: { id: string }) => {
    decided.delete(request.id);
    return {} as never;
  });
  const api = { ...createMockApi(), teleprompterSaveFlags: save, findingsReview: review };
  const view = (flags: SuspectedFlag[]) => (
    <ApiProvider api={api}>
      <SuspectedLines chapterId="c8" flags={flags} />
    </ApiProvider>
  );
  return { save, review, view };
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
