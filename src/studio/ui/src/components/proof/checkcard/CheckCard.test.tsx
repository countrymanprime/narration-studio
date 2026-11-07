// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { CoverageGap, CoverageGapReviews, CoverageResult, CoverageState } from '../../../api/contracts/coverage';
import type { DawCapabilities } from '../../../api/contracts/daw';
import type { Finding } from '../../../api/contracts/findings';
import * as opener from '../../recordingcheck/openCheckRecordings';
import { createMockApi } from '../../../api/mockApi';
import { createJournal, type Journal } from '../../../studio/journal/createJournal';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { ManuscriptChapter, NarrationApi } from '../../../types';
import { CheckCard } from './CheckCard';

afterEach(cleanup);

const chapter = (extra: Partial<ManuscriptChapter> = {}): ManuscriptChapter => ({
  id: 'c1',
  title: 'Chapter 1',
  index: 1,
  wordCount: 9300,
  status: 'recording',
  recordedSeconds: 3500,
  ...extra,
});
const gap = (id: string, kind: CoverageGap['kind'], at: number): CoverageGap => ({
  id,
  kind,
  paragraphIds: ['p1'],
  tokenCount: 4,
  firstWord: 'the',
  lastWord: 'door',
  position: { itemIndex: 0, itemGuid: 'g', sourceTime: at },
  confidence: null,
  confReason: 'no_word_scores',
});
const result = (
  state: CoverageResult['state'],
  gaps: CoverageGap[] = [],
  reasons: CoverageResult['reasons'] = [],
  unfinished = { start: 0, end: 0 },
): CoverageResult =>
  ({
    chapterId: 'c1',
    state,
    reasons,
    basis: { label: 'saved project', modifiedAt: '2026-09-26T08:40:00', stale: false },
    result: state === 'never' ? undefined : { gaps, unfinished, regions: [], paragraphs: [] },
  }) as unknown as CoverageResult;
const audio = (id: string, kind: string, at: number, status: Finding['review']['status'] = 'unreviewed'): Finding =>
  ({
    id,
    category: 'audio_quality',
    evidence: { kind },
    evidence_version: 'v1',
    review: { status },
    time_range: { start: at, end: at + 1 },
    confidence_reason: 'Heard in the recording',
  }) as unknown as Finding;
const caps = (available: boolean): DawCapabilities =>
  ({
    daw: 'REAPER',
    capabilities: { review: { level: 'supported', available, ...(available ? {} : { message: 'REAPER is not answering.' }) } },
  }) as unknown as DawCapabilities;

type Setup = {
  /** Draws the Compare button beside Check recordings; 'open' when the Compare panel is open. */
  compare?: 'closed' | 'open';
  result?: CoverageResult;
  audio?: Finding[];
  state?: CoverageState;
  reviews?: CoverageGapReviews;
  available?: boolean;
  chapter?: Partial<ManuscriptChapter>;
  journal?: Journal;
};

function mount(setup: Setup = {}) {
  let reviews: CoverageGapReviews = setup.reviews ?? {};
  let listener: (state: CoverageState) => void = () => undefined;
  let current = setup.result ?? result('current', [gap('g1', 'missing', 20), gap('g2', 'misread', 10)]);
  const calls = { accept: vi.fn(), ignore: vi.fn(), review: vi.fn(), cancel: vi.fn(), onCompare: vi.fn() };
  const compare = setup.compare ? { onOpen: calls.onCompare, open: setup.compare === 'open' } : undefined;
  const api: NarrationApi = createMockApi({
    coverageResult: async () => current,
    coverageGapReviews: async () => reviews,
    coverageState: async () => setup.state ?? { phase: 'idle', percent: 0, message: '' },
    subscribeCoverage: (onUpdate) => {
      listener = onUpdate;
      return () => undefined;
    },
    coverageCancel: async () => calls.cancel(),
    coverageGapAccept: async (...args) => {
      calls.accept(...args);
      reviews = { ...reviews, [args[1]]: 'accepted' };
      return {} as Finding;
    },
    coverageGapIgnore: async (...args) => {
      calls.ignore(...args);
      reviews = { ...reviews, [args[1]]: 'ignored' };
    },
    findingsList: async (query) => {
      const found = (setup.audio ?? []).filter((finding) => finding.category === query.category);
      return { findings: found, total: found.length };
    },
    findingsReview: async (request) => {
      calls.review(request);
      return audio(request.id, 'noise', 1, request.status);
    },
    dawCapabilities: async () => caps(setup.available ?? true),
    subscribeDawCapabilities: () => () => undefined,
  });
  const view = render(
    <ApiProvider api={api}>
      {setup.journal ? (
        <StudioProvider journal={setup.journal}>
          <CheckCard chapter={chapter(setup.chapter)} {...(compare ? { compare } : {})} />
        </StudioProvider>
      ) : (
        <CheckCard chapter={chapter(setup.chapter)} {...(compare ? { compare } : {})} />
      )}
    </ApiProvider>,
  );
  return { ...view, calls, emit: (state: CoverageState) => act(() => listener(state)), setResult: (next: CoverageResult) => (current = next) };
}
const card = () => screen.getByRole('region', { name: 'Recording check' });
const settled = async () => await waitFor(() => expect(card().getAttribute('data-check-state')).not.toBeNull());

describe('four states', () => {
  it('shows none, current and stale as a word and a shape', async () => {
    mount({ result: result('never') });
    await waitFor(() => expect(card().getAttribute('data-check-state')).toBe('none'));
    expect(card().getAttribute('data-check-state')).toBe('none');
    expect(within(card()).getByText('Not checked yet')).toBeTruthy();
    expect(card().textContent).toContain('○');
  });
  it('shows a run for this chapter as checking with its real percent', async () => {
    mount({ state: { phase: 'running', chapterId: 'c1', percent: 37, message: '' } });
    await waitFor(() => expect(card().getAttribute('data-check-state')).toBe('checking'));
    expect(screen.getByRole('progressbar', { name: 'Checking' }).getAttribute('aria-valuenow')).toBe('37');
    expect(screen.getByText('37%')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop checking' })).toBeTruthy();
  });
  it('ignores a run of another chapter', async () => {
    mount({ state: { phase: 'running', chapterId: 'other', percent: 37, message: '' } });
    await waitFor(() => expect(card().getAttribute('data-check-state')).toBe('current'));
  });
  it('moves to checking from the event and back to current when the run ends', async () => {
    const { emit } = mount();
    await waitFor(() => expect(card().getAttribute('data-check-state')).toBe('current'));
    emit({ phase: 'running', chapterId: 'c1', percent: 10, message: '' });
    await waitFor(() => expect(card().getAttribute('data-check-state')).toBe('checking'));
    emit({ phase: 'complete', chapterId: 'c1', percent: 100, message: '' });
    await waitFor(() => expect(card().getAttribute('data-check-state')).toBe('current'));
  });
});

describe('recorded against the estimate', () => {
  it('shows the measured length and the estimate at the standard rate', async () => {
    mount();
    await settled();
    expect(card().querySelector('[data-cc-recorded]')?.textContent).toBe('58:20');
    expect(card().querySelector('[data-cc-estimate]')?.textContent).toBe('~1:00:00');
  });
  it('invents neither when its source is missing', async () => {
    mount({ chapter: { recordedSeconds: undefined, wordCount: 0 } });
    await settled();
    expect(card().querySelector('[data-cc-recorded]')?.textContent).toBe('—');
    expect(card().querySelector('[data-cc-estimate]')?.textContent).toBe('—');
  });
});

describe('counts, sentence and as-of', () => {
  it('counts by category and words the sentence, the as-of and the unfinished end', async () => {
    mount({
      result: result('current', [gap('g1', 'missing', 20), gap('g2', 'misread', 10)], [], { start: 0, end: 3 }),
      audio: [audio('a1', 'breath', 5), audio('a2', 'breath', 6), audio('a3', 'click', 7)],
    });
    await waitFor(() => expect(card().querySelector('[data-cc-sentence]')).toBeTruthy());
    const count = (key: string) => card().querySelector(`[data-count="${key}"] b`)?.textContent;
    expect([count('misread'), count('missing'), count('extra'), count('noise'), count('breath'), count('click')]).toEqual(['1', '1', '0', '0', '2', '1']);
    expect(within(card()).getByText('Skipped')).toBeTruthy();
    expect(card().querySelector('[data-cc-sentence]')?.textContent).toBe('Checked against the script: 2 differences found');
    expect(card().querySelector('[data-cc-asof]')?.textContent).toMatch(/^As of last save · /);
    expect(card().querySelector('[data-cc-unfinished]')?.textContent).toBe('Not recorded to the end.');
  });
  it('reads — while there is no result and one difference in the singular', async () => {
    mount({ result: result('never') });
    await settled();
    expect(card().querySelector('[data-count="misread"] b')?.textContent).toBe('—');
    cleanup();
    mount({ result: result('current', [gap('g1', 'extra', 2)]) });
    await waitFor(() => expect(card().querySelector('[data-cc-sentence]')?.textContent).toBe('Checked against the script: 1 difference found'));
    cleanup();
    mount({ result: result('current') });
    await waitFor(() => expect(card().querySelector('[data-cc-sentence]')?.textContent).toBe('Checked against the script: no differences found'));
  });
});

describe('stale', () => {
  it.each([
    [['manuscript_changed'], 'The text changed since this check: check again'],
    [['item_moved'], 'Recording changed since this check: check again'],
    [['project_unreadable'], 'The project was saved again since this check: check again'],
  ] as const)('says why for %s, lists no findings and keeps the counts dimmed', async (reasons, sentence) => {
    mount({ result: result('stale', [gap('g1', 'missing', 20)], [...reasons]) });
    expect((await screen.findByRole('alert')).textContent).toContain(sentence);
    expect(card().getAttribute('data-check-state')).toBe('stale');
    expect(screen.queryByRole('button', { name: 'Show the findings' })).toBeNull();
    expect(card().querySelector('[data-findings]')).toBeNull();
    expect(card().querySelector('[data-count="missing"] b')?.textContent).toBe('1');
  });
});

describe('findings', () => {
  const open = async (setup: Setup = {}) => {
    const mounted = mount(setup);
    const toggle = await screen.findByRole('button', { name: 'Show the findings' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide the findings' }).getAttribute('aria-expanded')).toBe('true');
    return mounted;
  };
  it('Accept on a gap calls coverageGapAccept, shows Needs pickup and moves the row to Accepted', async () => {
    const { calls } = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Accept Skipped at 0:20' }));
    await waitFor(() => expect(calls.accept).toHaveBeenCalledWith('c1', 'g1'));
    await userEvent.click(screen.getByRole('button', { name: /^Accepted 1/ }));
    const row = card().querySelector('[data-finding="g1"]')!;
    expect(row.textContent).toContain('Needs pickup');
    expect(row.textContent).toContain('Accepted');
  });
  it('Accept on an audio finding reviews it as accepted and starts as Fix in edit', async () => {
    const { calls } = await open({ audio: [audio('a1', 'noise', 5)] });
    expect(card().querySelector('[data-finding="a1"]')?.textContent).toContain('Fix in edit');
    await userEvent.click(screen.getByRole('button', { name: 'Accept Background noise at 0:05' }));
    await waitFor(() => expect(calls.review).toHaveBeenCalledWith({ id: 'a1', evidenceVersion: 'v1', status: 'accepted', note: '' }));
    expect(calls.accept).not.toHaveBeenCalled();
  });
  it('Accept on an audio finding is one journal entry, and Undo puts the earlier decision back', async () => {
    const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
    const { calls } = await open({ audio: [audio('a1', 'noise', 5)], journal });
    await userEvent.click(screen.getByRole('button', { name: 'Accept Background noise at 0:05' }));
    await waitFor(async () => expect(await journal.entries()).toHaveLength(1));
    const [entry] = await journal.entries();
    expect(entry).toMatchObject({ label: 'Accepted a check finding', touches: ['proof/finding/a1'], undoable: true });
    expect((await journal.undo(entry!.id)).ok).toBe(true);
    expect(calls.review).toHaveBeenLastCalledWith({ id: 'a1', evidenceVersion: 'v1', status: 'unreviewed', note: '' });
  });
  it('Ignore calls coverageGapIgnore, and an audio finding is dismissed', async () => {
    const { calls } = await open({ audio: [audio('a1', 'noise', 5)] });
    await userEvent.click(screen.getByRole('button', { name: 'Ignore Skipped at 0:20' }));
    await waitFor(() => expect(calls.ignore).toHaveBeenCalledWith('c1', 'g1'));
    await userEvent.click(screen.getByRole('button', { name: 'Ignore Background noise at 0:05' }));
    await waitFor(() => expect(calls.review).toHaveBeenCalledWith({ id: 'a1', evidenceVersion: 'v1', status: 'dismissed', note: '' }));
  });
  it('reads a remembered ignore as Ignored after a reload', async () => {
    mount({ reviews: { g1: 'ignored' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Show the findings' }));
    await userEvent.click(screen.getByRole('button', { name: /^Ignored 1/ }));
    expect(card().querySelector('[data-finding="g1"]')?.textContent).toContain('Ignored');
  });
  it('filters with counts and says Nothing here. on an empty list', async () => {
    await open({ reviews: { g1: 'ignored' } });
    expect(screen.getByRole('button', { name: /^To decide 1/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^Accepted 0/ }));
    expect(screen.getByText('Nothing here.')).toBeTruthy();
    expect(screen.getByText('Check findings · 2')).toBeTruthy();
  });
});

describe('the Check recordings button', () => {
  // The card's button is the shared one (#2833): it opens the one dialog with this chapter ticked, and the DAW's reason is its own.
  it('opens the Check recordings dialog with this chapter ticked', async () => {
    const open = vi.spyOn(opener, 'openCheckRecordings').mockReturnValue(() => {});
    mount();
    await screen.findByRole('button', { name: 'Check recordings' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check recordings' }).getAttribute('aria-disabled')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Check recordings' }));
    expect(open).toHaveBeenCalledWith(['c1'], expect.anything());
  });
  it.each([
    [{ chapter: { recordedSeconds: 0 } }, 'This chapter has no recording to check.'],
    [{ chapter: { wordCount: 0 } }, 'This chapter has no text to check against.'],
  ] as const)('is disabled with its own reason: %j', async (setup, reason) => {
    mount(setup);
    expect(await screen.findByText(reason)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check recordings' }).getAttribute('aria-disabled')).toBe('true');
  });
  it('is disabled with the DAW’s own sentence, the one every page gives, when the DAW cannot review', async () => {
    mount({ available: false });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check recordings' }).getAttribute('aria-disabled')).toBe('true'));
    expect(caps(false).capabilities.review?.message).toBeTruthy();
    expect(screen.getAllByText(caps(false).capabilities.review!.message!).length).toBeGreaterThan(0);
  });
  it('is replaced by Cancel while checking, and Cancel calls coverageCancel', async () => {
    const { calls } = mount({ state: { phase: 'running', chapterId: 'c1', percent: 5, message: '' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Stop checking' }));
    expect(calls.cancel).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Check recordings' })).toBeNull();
  });
});

describe('the Compare with the script button (#2822)', () => {
  it('is not drawn unless the page offers it', async () => {
    mount();
    await screen.findByRole('button', { name: 'Check recordings' });
    expect(screen.queryByRole('button', { name: 'Compare with the script' })).toBeNull();
  });
  it('sits beside Check recordings and tells the page to open the Compare panel', async () => {
    const { calls } = mount({ compare: 'closed' });
    const compare = await screen.findByRole('button', { name: 'Compare with the script' });
    expect(compare.getAttribute('aria-expanded')).toBe('false');
    expect(compare.parentElement).toBe(screen.getByRole('button', { name: 'Check recordings' }).parentElement);
    await userEvent.click(compare);
    expect(calls.onCompare).toHaveBeenCalledTimes(1);
  });
  it('is pressed once by a held Enter, not toggled by each key repeat', async () => {
    const { calls } = mount({ compare: 'closed' });
    const compare = await screen.findByRole('button', { name: 'Compare with the script' });
    const repeated = fireEvent.keyDown(compare, { key: 'Enter', code: 'Enter', repeat: true });
    expect(repeated).toBe(false);
    expect(calls.onCompare).not.toHaveBeenCalled();
  });
  it('says the Compare panel is open', async () => {
    mount({ compare: 'open' });
    expect((await screen.findByRole('button', { name: 'Compare with the script' })).getAttribute('aria-expanded')).toBe('true');
  });
  it('stays while a check runs (a comparison is not a check)', async () => {
    mount({ compare: 'closed', state: { phase: 'running', chapterId: 'c1', percent: 5, message: '' } });
    expect(await screen.findByRole('button', { name: 'Compare with the script' })).toBeTruthy();
  });
  it('is off with the reason when the chapter has no recording', async () => {
    mount({ compare: 'closed', chapter: { recordedSeconds: 0 } });
    expect(await screen.findByText('This chapter has no recording to check.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Compare with the script' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('a chapter with no recording', () => {
  // A stored result cannot be current for a recording that is not there: the card says no recording, not "Up to date" beside "Recorded —".
  it.each([
    ['unlinked', 'No track is linked to it.', true],
    ['multiple_tracks', 'More than one track is linked to it.', true],
    ['track_missing', 'Its linked track is not in the saved project.', true],
    ['no_project', 'No saved project could be read.', false],
  ] as const)('%s: shows no check result and says why', async (recordedUnavailable, why, offersEngine) => {
    mount({ chapter: { recordedSeconds: undefined, recordedUnavailable } });
    await waitFor(() => expect(card().getAttribute('data-check-state')).toBe('none'));
    expect(within(card()).getByText('This chapter has no recording to check.')).toBeTruthy();
    expect(within(card()).getByText(why)).toBeTruthy();
    expect(within(card()).queryByRole('button', { name: 'Open the audio engine panel' }) !== null).toBe(offersEngine);
    expect(card().textContent).not.toContain('Up to date');
    expect(card().querySelector('[data-cc-sentence]')).toBeNull();
    expect(card().querySelector('[data-cc-asof]')).toBeNull();
    expect(within(card()).getByText('Not checked yet')).toBeTruthy();
  });
  it('a chapter with a recording still shows its stored result', async () => {
    mount();
    await waitFor(() => expect(card().getAttribute('data-check-state')).toBe('current'));
    expect(card().querySelector('[data-cc-sentence]')).not.toBeNull();
  });
});

describe('running a check decides nothing', () => {
  it('mounting and a finished run call no accept, ignore or review', async () => {
    const { calls, emit } = mount({ audio: [audio('a1', 'noise', 5)] });
    await screen.findByRole('button', { name: 'Show the findings' });
    emit({ phase: 'running', chapterId: 'c1', percent: 50, message: '' });
    emit({ phase: 'complete', chapterId: 'c1', percent: 100, message: '' });
    await waitFor(() => expect(card().getAttribute('data-check-state')).toBe('current'));
    expect(calls.accept).not.toHaveBeenCalled();
    expect(calls.ignore).not.toHaveBeenCalled();
    expect(calls.review).not.toHaveBeenCalled();
  });
});
