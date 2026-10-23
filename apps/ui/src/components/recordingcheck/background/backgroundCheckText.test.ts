import { describe, expect, it } from 'vitest';
import type { ChapterSyncBackground } from '../../../api/contracts/chapterSync';
import { doneText, modelPairText, needsNotice, queuedText, runningDetail, runningText, startedToast } from './backgroundCheckText';

const background = (over: Partial<ChapterSyncBackground> = {}): ChapterSyncBackground => ({
  enabled: true,
  wait: 'quiet',
  queued: 2,
  firstPassModel: 'tiny',
  recheckModel: 'small',
  ...over,
});
const running = { phase: 'running' as const, percent: 41.6, message: '', background: true, firstPassModel: 'tiny', recheckModel: 'small' };

describe('background check text', () => {
  it('names the pair, or the one model when the double-check is off', () => {
    expect(modelPairText(background())).toBe('tiny + small');
    expect(modelPairText(background({ recheckModel: '' }))).toBe('tiny');
  });

  it('says what runs, how far and what waits', () => {
    expect(runningText('Chapter 3', running)).toBe('Checking Chapter 3 in the background · 42%');
    expect(runningDetail(background({ queued: 1 }), running)).toBe('chapter 1 of 2 · tiny + small');
    expect(runningDetail(background({ queued: 1 }), running, 2)).toBe('chapter 3 of 4 · tiny + small');
    expect(runningDetail(background({ queued: 0 }), { ...running, firstPassModel: undefined, recheckModel: undefined })).toBe('tiny + small');
    expect(doneText(1)).toBe('Background checks done: 1 chapter checked');
  });

  it('shows a queue only with a reason it waits', () => {
    expect(queuedText(background({ wait: 'recording' }))).toBe('2 chapters waiting to be checked: REAPER is recording');
    expect(queuedText(background({ wait: 'nothing' }))).toBe('');
    expect(queuedText(background({ wait: 'confirm' }))).toBe('');
    expect(queuedText(background({ enabled: false }))).toBe('');
    expect(queuedText(background({ queued: 0 }))).toBe('');
  });

  it('says what it starts with and that only new audio is listened to', () => {
    expect(startedToast('Chapter 3', running, background())).toBe(
      'Checking Chapter 3 in the background with tiny + small. Only audio not checked before is listened to.',
    );
  });

  it('asks first only when checks are on, unanswered and there is something to check', () => {
    expect(needsNotice(background({ wait: 'confirm' }))).toBe(true);
    expect(needsNotice(background({ wait: 'confirm', queued: 0 }))).toBe(false);
    expect(needsNotice(background({ wait: 'confirm', enabled: false }))).toBe(false);
    expect(needsNotice(background({ wait: 'quiet' }))).toBe(false);
    expect(needsNotice(undefined)).toBe(false);
  });
});
