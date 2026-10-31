import { describe, expect, it } from 'vitest';
import type { JobEnded } from './api/contracts/system';
import { TOAST_ACTION_MS } from './components/primitives/Toast';
import { notificationForJobEnd, shouldNotifyForJobEnd, shouldQueueJobEndAnnouncement, toastForJobEnd } from './jobEnded';

const ended = (patch: Partial<JobEnded>): JobEnded => ({
  id: 'job-1',
  kind: 'story_bible',
  outcome: 'success',
  message: 'Story Bible rebuild complete.',
  durationMs: 4200,
  ...patch,
});

describe('toastForJobEnd', () => {
  it('leaves a failed package build to the Delivery page, which writes it under Build, but not when the narrator is elsewhere', () => {
    const failed = ended({ kind: 'render_package', outcome: 'error', message: 'The package could not be built.' });
    expect(toastForJobEnd(failed, '/delivery')).toBeUndefined();
    expect(toastForJobEnd(failed, '/master')).toEqual({ text: 'The package could not be built.', tone: 'error' });
    expect(toastForJobEnd(failed)).toEqual({ text: 'The package could not be built.', tone: 'error' });
  });

  // Master & QC raises its own error toast for these (rule 7); the app's job-ended toast beside it was a second message in a second queue, drawn
  // over the first in the same corner (#2632), so on that page it stays quiet and anywhere else it is the only word the narrator gets.
  it.each(['measurement', 'diagnostics', 'render_export', 'render_package_multi'])(
    'leaves a failed %s to Master & QC, which tells it itself, but not elsewhere',
    (kind) => {
      const failed = ended({ kind, outcome: 'error', message: 'It stopped unexpectedly.' });
      expect(toastForJobEnd(failed, '/master')).toBeUndefined();
      expect(toastForJobEnd(failed, '/delivery')).toEqual({ text: 'It stopped unexpectedly.', tone: 'error' });
      expect(toastForJobEnd(failed)).toEqual({ text: 'It stopped unexpectedly.', tone: 'error' });
      expect(toastForJobEnd({ ...failed, outcome: 'success', message: 'Done.' }, '/master')).toEqual({ text: 'Done.', tone: 'info' });
    },
  );

  it('says what the host said when a job that can finish elsewhere succeeds', () => {
    expect(toastForJobEnd(ended({}))).toEqual({ text: 'Story Bible rebuild complete.', tone: 'info' });
    expect(toastForJobEnd(ended({ kind: 'transcript_compare', message: 'Comparison complete.' }))).toEqual({ text: 'Comparison complete.', tone: 'info' });
  });

  it('lets the narrator open the suggestions a Story Bible scan added, and offers nothing when it added none', () => {
    const scan = (message: string) => ended({ kind: 'extraction_scan', message });
    const follow = { label: 'Show them', to: '/story-bible', state: { show: 'review' } };
    expect(toastForJobEnd(scan('2 suggestions added; 1 already offered or rejected before.'))).toEqual({
      text: '2 suggestions added; 1 already offered or rejected before.',
      tone: 'info',
      follow,
      durationMs: TOAST_ACTION_MS,
    });
    expect(toastForJobEnd(scan('1 suggestion added.'))).toMatchObject({ follow, durationMs: TOAST_ACTION_MS });
    expect(toastForJobEnd(scan('0 suggestions added; 3 already offered or rejected before.'))?.follow).toBeUndefined();
    expect(
      toastForJobEnd(
        ended({ kind: 'extraction_scan', outcome: 'error', message: 'The scan did not finish: x. Kept 2 suggestions from the sources that finished.' }),
      )?.follow,
    ).toBeUndefined();
  });

  it('makes a failure an error, which stays until it is dismissed', () => {
    expect(toastForJobEnd(ended({ outcome: 'error', message: 'The build failed.' }))).toEqual({ text: 'The build failed.', tone: 'error' });
  });

  it('says something even when the host sent no message', () => {
    expect(toastForJobEnd(ended({ outcome: 'error', message: '' }))?.text).toBeTruthy();
    expect(toastForJobEnd(ended({ message: '' }))?.text).toBeTruthy();
  });

  it('says nothing about a job the narrator cancelled', () => {
    expect(toastForJobEnd(ended({ outcome: 'cancelled', message: 'Comparison cancelled.' }))).toBeUndefined();
  });

  it('leaves the jobs whose modal dialog is on screen to that dialog', () => {
    for (const kind of ['manuscript_import', 'tts_install', 'whisper_install', 'dictionary_install', 'app_update']) {
      expect(toastForJobEnd(ended({ kind })), kind).toBeUndefined();
    }
  });

  it('announces a kind it has never heard of, because a newer host may add jobs', () => {
    expect(toastForJobEnd(ended({ kind: 'future_job', message: 'Done.' }))).toEqual({ text: 'Done.', tone: 'info' });
  });
});

describe('shouldNotifyForJobEnd', () => {
  it('never notifies while the window is focused', () => {
    expect(shouldNotifyForJobEnd(ended({ durationMs: 20_000 }), true)).toBe(false);
  });

  it('notifies for a qualifying job that ran 10s or more while unfocused', () => {
    for (const kind of [
      'story_bible',
      'tts_install',
      'whisper_install',
      'spacy_install',
      'transcript_compare',
      'manuscript_import',
      'recording_coverage',
      'take_review',
      'take_comparison',
      'measurement',
      'diagnostics',
    ]) {
      expect(shouldNotifyForJobEnd(ended({ kind, durationMs: 10_000 }), false), kind).toBe(true);
    }
  });

  it('stays quiet for a fast job so a sub-10s job is not worth interrupting for', () => {
    expect(shouldNotifyForJobEnd(ended({ durationMs: 9_999 }), false)).toBe(false);
  });

  it('says nothing about a job the narrator cancelled', () => {
    expect(shouldNotifyForJobEnd(ended({ outcome: 'cancelled', durationMs: 60_000 }), false)).toBe(false);
  });

  it('stays quiet for a kind not in the notifiable set, because a newer host may add jobs nobody has reviewed for notifications', () => {
    expect(shouldNotifyForJobEnd(ended({ kind: 'future_job', durationMs: 60_000 }), false)).toBe(false);
  });
});

describe('shouldQueueJobEndAnnouncement', () => {
  it('queues a success/info announcement while the booth is recording', () => {
    const announcement = toastForJobEnd(ended({}));
    expect(announcement && shouldQueueJobEndAnnouncement(announcement, true)).toBe(true);
  });

  it('never queues while the booth is not recording', () => {
    const announcement = toastForJobEnd(ended({}));
    expect(announcement && shouldQueueJobEndAnnouncement(announcement, false)).toBe(false);
  });

  it('never queues an error announcement, even while recording, because silence is a comfort rule, not a safety one', () => {
    const announcement = toastForJobEnd(ended({ outcome: 'error', message: 'The build failed.' }));
    expect(announcement && shouldQueueJobEndAnnouncement(announcement, true)).toBe(false);
  });
});

describe('notificationForJobEnd', () => {
  it('uses the host message as the body and says what finished', () => {
    expect(notificationForJobEnd(ended({ message: 'Story Bible rebuild complete.' }))).toEqual({
      title: 'Task finished',
      body: 'Story Bible rebuild complete.',
    });
  });

  it('titles a failure differently and still carries the host message', () => {
    expect(notificationForJobEnd(ended({ outcome: 'error', message: 'The build failed.' }))).toEqual({
      title: 'Task failed',
      body: 'The build failed.',
    });
  });
});
