import { describe, expect, it } from 'vitest';
import type { CoverageActivity, CoveragePassActivity, CoverageRecheckActivity } from '../../api/contracts/coverage';
import { clock, recheckReason, summarizeActivity, type ChapterActivity } from './activityView';

const first = (over: Partial<CoveragePassActivity> = {}): CoveragePassActivity => ({
  model: 'small',
  workers: 4,
  busy: 3,
  total: 112,
  done: 40,
  final: true,
  ...over,
});
const second = (over: Partial<CoverageRecheckActivity> = {}): CoverageRecheckActivity => ({
  model: 'large-v3-turbo',
  workers: 1,
  busy: 1,
  total: 7,
  done: 3,
  final: false,
  reasons: ['low_confidence'],
  ...over,
});
const activity = (over: Partial<CoverageActivity> = {}): CoverageActivity => ({
  requested: 0,
  items: { total: 6, done: 2 },
  firstPass: first(),
  recheck: second(),
  ...over,
});
const running = (a?: CoverageActivity, pass?: ChapterActivity['pass']): ChapterActivity => ({ activity: a, pass, running: true });

describe('summarizeActivity', () => {
  it('shows dashes and "Starting" before the check has reported', () => {
    const view = summarizeActivity([running()]);
    expect(view).toMatchObject({ phase: 'starting', reported: false, chunks: { value: '–' }, workers: { value: '–' }, recheck: { value: '–' } });
  });

  it('counts chunks, the workers busy of the workers running, and the passages sent to the larger model', () => {
    const view = summarizeActivity([running(activity(), 'pipeline')]);
    expect(view.chunks.value).toBe('40 of 112');
    expect(view.workers.value).toBe('4/5 busy');
    expect(view.recheck.value).toBe('3 of 7+');
    expect(view.recheck.hint).toBe('large-v3-turbo re-checks passages the first model was unsure of.');
    expect(view).toMatchObject({ phase: 'both', firstModel: 'small', recheckModel: 'large-v3-turbo' });
  });

  it('says what Automatic resolved to', () => {
    expect(summarizeActivity([running(activity({ requested: 0 }))]).workers.hint).toBe('Automatic runs 4 at once, and 1 for the larger model.');
    expect(summarizeActivity([running(activity({ requested: 8 }))]).workers.hint).toBe(
      'You chose 8; this check can use 4 at once, and 1 for the larger model.',
    );
    expect(summarizeActivity([running(activity({ requested: 4 }))]).workers.hint).toBe('You chose 4; 4 run at once, and 1 for the larger model.');
  });

  it('says so when there is one chunk and nothing to run side by side', () => {
    const one = activity({ firstPass: first({ workers: 1, busy: 1, total: 1, done: 0 }), recheck: undefined });
    const view = summarizeActivity([running(one)]);
    expect(view.chunks).toEqual({ value: '0 of 1', hint: 'One piece of audio, so nothing to run side by side.' });
    expect(view.workers).toEqual({ value: '1/1 busy', hint: 'One piece of audio, so one transcription runs.' });
  });

  it('shows the re-check as off when the check did not ask for one', () => {
    const view = summarizeActivity([running(activity({ recheck: undefined }))]);
    expect(view.recheck.value).toBe('Off');
    expect(view.recheckModel).toBeUndefined();
  });

  it('shows zero re-checks as "None" once the first pass is through, and "Waiting" before', () => {
    const none = (final: boolean) => summarizeActivity([running(activity({ recheck: second({ total: 0, done: 0, busy: 0, final, reasons: [] }) }))]).recheck;
    expect(none(true).value).toBe('None');
    expect(none(false).value).toBe('Waiting');
  });

  it('shows every passage re-checked, and says why whole recordings are redone', () => {
    const all = activity({
      firstPass: first({ busy: 0, done: 112 }),
      recheck: second({ total: 112, done: 112, busy: 0, final: true, reasons: ['widespread'] }),
    });
    const view = summarizeActivity([running(all, 'recheck_whole')]);
    expect(view.recheck.value).toBe('112 of 112');
    expect(view.recheck.hint).toBe('So much was in doubt that large-v3-turbo redoes whole recordings.');
    expect(view.phase).toBe('recheck');
  });

  it('names the phases by what is running', () => {
    const firstPassOnly = activity({ recheck: second({ busy: 0 }) });
    expect(summarizeActivity([running(firstPassOnly)]).phase).toBe('first_pass');
    const done = activity({ firstPass: first({ done: 112, busy: 0 }), recheck: second({ done: 7, final: true, busy: 0 }) });
    expect(summarizeActivity([running(done)]).phase).toBe('finishing');
    expect(summarizeActivity([running(done, 'realign')]).phase).toBe('finishing');
    expect(summarizeActivity([running(done, 'recheck_windows')]).phase).toBe('recheck');
    expect(summarizeActivity([{ activity: done, running: false }]).phase).toBe('done');
  });

  it('totals several chapters; only the ones still going count workers', () => {
    const view = summarizeActivity([
      running(activity({ firstPass: first({ total: 10, done: 4, workers: 2, busy: 2 }), recheck: undefined })),
      { activity: activity({ firstPass: first({ total: 5, done: 5, workers: 2, busy: 0 }), recheck: undefined }), running: false },
    ]);
    expect(view.chunks.value).toBe('9 of 15');
    expect(view.workers.value).toBe('2/2 busy');
  });

  it("keeps a cancelled or failed chapter's counts, with nothing busy", () => {
    const view = summarizeActivity([{ activity: activity({ firstPass: first({ busy: 0, done: 12 }), recheck: second({ busy: 0 }) }), running: false }]);
    expect(view.chunks.value).toBe('12 of 112');
    expect(view.workers.value).toBe('4');
  });
});

describe('recheckReason', () => {
  it('is one short sentence for each reason', () => {
    for (const reasons of [['low_confidence'], ['missing_words'], ['low_confidence', 'missing_words'], ['widespread']] as const) {
      const text = recheckReason('large-v3-turbo', reasons);
      expect(text.length).toBeLessThanOrEqual(80);
      expect(text.endsWith('.')).toBe(true);
    }
  });
});

describe('clock', () => {
  it('reads m:ss and h:mm:ss', () => {
    expect([clock(0), clock(59.9), clock(61), clock(3600), clock(3725), clock(-3)]).toEqual(['0:00', '0:59', '1:01', '1:00:00', '1:02:05', '0:00']);
  });
});
