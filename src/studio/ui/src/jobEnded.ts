import type { JobEnded } from './api/contracts/system';
import { TOAST_ACTION_MS, type ToastTone } from './components/primitives/Toast';

// Kinds whose own dialog is on screen while the job runs and is modal, so the narrator is still looking at it when it ends and it
// says so itself (the import, the downloads, the update). The dictionary's download ends by answering the lookup that asked for it. The event still reaches every listener (the notification work reads
// it); the app-level toast is for the jobs that can finish while the narrator is somewhere else.
const SHOWN_BY_THEIR_DIALOG = new Set(['manuscript_import', 'tts_install', 'whisper_install', 'dictionary_install', 'app_update']);

/**
 * A failed package build is written on the Delivery page itself, under its Build button, so a toast over the same page would say it twice
 * (and at a narrow width cover the list beside it). Left for another page, the toast is the only word the narrator gets. Master & QC's
 * failed measurement, diagnostics check, export and multi-platform build are told by the page itself as an error toast (rule 7); this app's
 * queue is a second one drawn in the same corner, so a second message there would sit over the first.
 */
const SHOWN_ON_THEIR_PAGE: Record<string, string> = {
  render_package: '/delivery',
  measurement: '/master',
  diagnostics: '/master',
  render_export: '/master',
  render_package_multi: '/master',
};

/** Where a job-end toast's one button takes the narrator: a route, and the state the page there reads to open on what the job made. */
export type JobEndFollow = { label: string; to: string; state: { show: 'review' } };

/** The host's scan message starts with the count it added ("2 suggestions added; …", `suggestionsCount` in extraction_job.go). */
const SCAN_ADDED = /^([1-9]\d*) suggestions? added/;

/** What the app says when a host job ends, or nothing when the narrator does not need telling (they cancelled it, or its dialog or page says so). */
export function toastForJobEnd(event: JobEnded, pathname?: string): { text: string; tone: ToastTone; follow?: JobEndFollow; durationMs?: number } | undefined {
  if (event.outcome === 'cancelled' || SHOWN_BY_THEIR_DIALOG.has(event.kind)) return undefined;
  if (event.outcome === 'error' && pathname !== undefined && SHOWN_ON_THEIR_PAGE[event.kind] === pathname) return undefined;
  if (event.outcome === 'error') return { text: event.message || 'A background task failed.', tone: 'error' };
  const text = event.message || 'A background task finished.';
  // New suggestions sit among the entries with nothing marking them, so the toast takes the narrator to the Needs review filter.
  if (event.kind === 'extraction_scan' && SCAN_ADDED.test(text))
    return { text, tone: 'info', follow: { label: 'Show them', to: '/story-bible', state: { show: 'review' } }, durationMs: TOAST_ACTION_MS };
  return { text, tone: 'info' };
}

// Only these kinds are worth an OS notification (Story Bible build, model/voice downloads, Transcript Compare, import, a recording
// check, which transcribes minutes of audio, the pickup and duplicate scan, the take comparison, a measurement, which reads a book's
// chapters at about 90 s an hour of audio, and a diagnostics check over the same files). A manuscript import that also chains a Story Bible
// build still only notifies through its own story_bible job:ended event; a fast import stays quiet on its own account like
// everything else here.
const NOTIFIABLE_JOB_KINDS = new Set([
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
]);

/** Fast jobs stay quiet so a notification means something. */
const NOTIFY_THRESHOLD_MS = 10_000;

/**
 * Whether a host job ending is worth an OS notification. `focused` is `document.hasFocus()`: the host has no
 * way to know this, so the decision is made here, in the webview,
 * every time a job ends. A narrator watching the job does not need an OS notification about it; a job the
 * narrator cancelled was not "finished" in a way worth telling them about elsewhere; and a job that took under 10s
 * would just be noise.
 */
export function shouldNotifyForJobEnd(event: JobEnded, focused: boolean): boolean {
  if (focused) return false;
  if (event.outcome === 'cancelled') return false;
  if (!NOTIFIABLE_JOB_KINDS.has(event.kind)) return false;
  return event.durationMs >= NOTIFY_THRESHOLD_MS;
}

/** The title and body for the OS notification `shouldNotifyForJobEnd` approved. */
export function notificationForJobEnd(event: JobEnded): { title: string; body: string } {
  if (event.outcome === 'error') return { title: 'Task failed', body: event.message || 'A background task failed.' };
  return { title: 'Task finished', body: event.message || 'A background task finished.' };
}

/**
 * Whether a job-end toast must wait rather than show immediately (the booth's
 * no-sound, no-notification rule): only while the booth is recording (`useBoothRecording`), and only a success/info
 * announcement - an error is never held back (silence is a comfort rule, not a safety one). The
 * caller (App.tsx) queues it and shows it once `boothRecording` clears, so nothing is lost, only delayed.
 */
export function shouldQueueJobEndAnnouncement(announcement: { tone: ToastTone }, boothRecording: boolean): boolean {
  return boothRecording && announcement.tone !== 'error';
}
