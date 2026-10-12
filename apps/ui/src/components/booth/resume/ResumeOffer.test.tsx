// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi, TeleprompterLocateResult, TeleprompterResumePlace, TeleprompterResumeVerdict, TeleprompterSpan } from '../../../types';
import { ResumeOffer } from './ResumeOffer';
import { resumeOfferFor, paragraphAt, saveNote } from './resumeOffer';

afterEach(cleanup);

const spans: TeleprompterSpan[] = [
  { kind: 'title', id: 't', index: null, start: 0, count: 2 },
  { kind: 'paragraph', id: 'p1', index: 1, start: 2, count: 10 },
  { kind: 'paragraph', id: 'p2', index: 2, start: 12, count: 10 },
  { kind: 'paragraph', id: 'p3', index: 3, start: 22, count: 10 },
];

const place = (word: number, over: Partial<TeleprompterResumePlace> = {}): TeleprompterResumePlace => ({
  word,
  number: word + 1,
  sentence: null,
  confident: true,
  ...over,
});
const verdict = (over: Partial<TeleprompterResumeVerdict>): TeleprompterResumeVerdict => ({
  kind: 'none',
  start: null,
  daw: null,
  prompter: null,
  tokens: 32,
  ...over,
});
const located = (over: Partial<Extract<TeleprompterLocateResult, { match: unknown }>> = {}) =>
  ({
    status: 'found',
    match: {},
    track: null,
    recordedEnd: null,
    tail: null,
    located: null,
    lastReading: null,
    verdict: verdict({}),
    ...over,
  }) as TeleprompterLocateResult;

const liveEstimate = located({
  status: 'low_confidence',
  dawSource: 'live',
  verdict: verdict({ kind: 'daw_only', daw: place(15, { confident: false, source: 'live' }) }),
});

function show(result: TeleprompterLocateResult | Promise<never>, props: Partial<Parameters<typeof ResumeOffer>[0]> = {}) {
  const onChoose = vi.fn();
  const teleprompterLocate = vi.fn(async () => result);
  const api: NarrationApi = createMockApi({ teleprompterLocate: teleprompterLocate as NarrationApi['teleprompterLocate'] });
  render(
    <ApiProvider api={api}>
      <ResumeOffer chapterId="c1" model="tiny" spans={spans} recording={false} onChoose={onChoose} {...props} />
    </ApiProvider>,
  );
  return { onChoose, teleprompterLocate };
}

describe('ResumeOffer', () => {
  it('a-chapter-recorded-partway-offers-resume-at-the-paragraph-the-recording-ends-in', async () => {
    const { onChoose } = show(located({ verdict: verdict({ kind: 'daw_only', daw: place(15, { source: 'saved' }) }) }));
    const line = await screen.findByRole('button', { name: 'Resume at ¶ 2' });
    expect(line.textContent).toBe('Resume at ¶ 2');
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('a-chapter-with-nothing-recorded-and-a-finished-one-offer-nothing', async () => {
    for (const v of [verdict({}), verdict({ kind: 'complete', daw: place(31) })]) {
      const { teleprompterLocate } = show(located({ verdict: v }));
      await waitFor(() => expect(teleprompterLocate).toHaveBeenCalled());
      expect(screen.queryByRole('button')).toBeNull();
      cleanup();
    }
  });

  it('no-offer-while-recording', async () => {
    const { teleprompterLocate } = show(liveEstimate, { recording: true, kept: { paragraphId: 'p2', word: 3 } });
    expect(screen.queryByRole('button')).toBeNull();
    expect(teleprompterLocate).not.toHaveBeenCalled();
  });

  it('where-a-take-stopped-is-remembered-and-offered-next-time', async () => {
    show(liveEstimate, { kept: { paragraphId: 'p3', word: 4 } });
    expect(await screen.findByRole('button', { name: 'Resume at ¶ 3' })).toBeTruthy();
    expect(screen.getByText('from your last reading')).toBeTruthy();
  });

  it('the-source-and-confidence-are-shown', () => {
    const at = (source: 'live' | 'saved' | 'booth', confident: boolean) =>
      resumeOfferFor({
        spans,
        recording: false,
        result: located({ verdict: verdict({ kind: 'daw_only', daw: place(15, { source: source === 'booth' ? 'live' : source, confident }) }) }),
      });
    expect(at('live', true)).toMatchObject({ offer: { source: 'live', confident: true } });
    expect(at('saved', false)).toMatchObject({ offer: { source: 'saved', confident: false } });
  });

  it('shows-the-source-text-and-an-estimate-says-it-is-not-sure', async () => {
    show(liveEstimate);
    expect(await screen.findByText('from the live project · an estimate, not sure')).toBeTruthy();
  });

  it('shows-the-saved-project-source', async () => {
    show(located({ dawSource: 'saved', verdict: verdict({ kind: 'daw_only', daw: place(15, { source: 'saved' }) }) }));
    expect(await screen.findByText('from the saved project')).toBeTruthy();
  });

  it('as-of-last-save-says-when-the-project-was-saved', async () => {
    const saved = { savedAt: '2026-09-26T08:40', unsavedChanges: false, playState: 'stopped' as const, playPosition: 0 };
    const fromSave = located({ dawSource: 'saved', verdict: verdict({ kind: 'daw_only', daw: place(15, { source: 'saved' }) }) });
    show(fromSave, { project: saved, dawName: 'REAPER' });
    expect(await screen.findByText('from the saved project · Project saved Sep 26, 08:40')).toBeTruthy();
    cleanup();
    show(fromSave, { project: { ...saved, unsavedChanges: true }, dawName: 'REAPER' });
    expect(await screen.findByText('from the saved project · Project saved Sep 26, 08:40. Changes in REAPER since then are not included')).toBeTruthy();
    cleanup();
    // A place read from the live project or the last reading is not as of the save.
    show(liveEstimate, { project: saved, dawName: 'REAPER' });
    expect(await screen.findByText('from the live project · an estimate, not sure')).toBeTruthy();
  });

  it('choosing-it-only-sets-where-start-begins', async () => {
    const { onChoose } = show(liveEstimate);
    await userEvent.click(await screen.findByRole('button', { name: 'Resume at ¶ 2' }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith({ paragraphId: 'p2', word: 3 });
  });

  it('the-whisper-model-case-stays-out', async () => {
    const needsModel = { status: 'asset_required', model: { displayName: 'Whisper Small' } } as unknown as TeleprompterLocateResult;
    show(needsModel);
    expect(await screen.findByLabelText(/No resume point\. .*Whisper Small/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a-low-confidence-place-is-never-presented-as-sure', () => {
    const state = resumeOfferFor({ spans, recording: false, result: liveEstimate });
    expect(state).toMatchObject({ kind: 'offer', offer: { confident: false } });
  });

  it('prefers-the-last-reading-when-it-and-the-daw-disagree', () => {
    const state = resumeOfferFor({ spans, recording: false, result: located({ verdict: verdict({ kind: 'disagree', daw: place(3), prompter: place(25) }) }) });
    expect(state).toMatchObject({ offer: { paragraphId: 'p3', source: 'booth' } });
  });

  it('offers-nothing-for-a-failed-lookup', async () => {
    const { teleprompterLocate } = show(Promise.reject(new Error('x')) as never);
    await waitFor(() => expect(teleprompterLocate).toHaveBeenCalled());
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('paragraphAt', () => {
  it('maps-a-chapter-word-to-its-paragraph-and-offset', () => {
    expect(paragraphAt(spans, 12)).toEqual({ paragraphId: 'p2', word: 0, paragraph: 2 });
    expect(paragraphAt(spans, 1)).toBeNull();
    expect(paragraphAt(spans, 99)).toBeNull();
  });
});

describe('saveNote', () => {
  it('says when the project was saved and whether the DAW has more since, and nothing without a saved project', () => {
    const state = { savedAt: '2026-09-26T08:40', unsavedChanges: false };
    expect(saveNote(state, 'REAPER')).toBe('Project saved Sep 26, 08:40');
    expect(saveNote({ ...state, unsavedChanges: true }, 'REAPER')).toBe('Project saved Sep 26, 08:40. Changes in REAPER since then are not included');
    expect(saveNote({ savedAt: null, unsavedChanges: false }, 'none')).toBe('');
    expect(saveNote(null, 'REAPER')).toBe('');
  });
});
