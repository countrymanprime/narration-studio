// Sample data behind the mock measurements port, ported from the Studio Next mock's `fixtures/measurements.ts`: what the
// recorder and the take log would report. The host adapter never reads this file.

/** One recorded take: when it was made (local date and time) and the seconds of audio it added. */
export type TakeLogEntry = { at: string; seconds: number };

/** The room tone each microphone reported at its last measurement, in dB. */
export const ROOM_TONE_DB: Readonly<Record<string, number>> = {
  'USB audio interface · Input 1': -64.1,
  'USB microphone': -58.6,
  'Built-in microphone': -49.3,
};

/** Takes recorded so far, one entry per sitting. */
export const TAKE_LOG: readonly TakeLogEntry[] = [
  { at: '2026-09-14T10:10', seconds: 900 },
  { at: '2026-09-15T09:30', seconds: 1000 },
  { at: '2026-09-17T14:00', seconds: 600 },
  { at: '2026-09-19T11:15', seconds: 500 },
  { at: '2026-09-21T10:00', seconds: 350 },
  { at: '2026-09-22T15:20', seconds: 400 },
  { at: '2026-09-24T09:45', seconds: 300 },
  { at: '2026-09-25T16:30', seconds: 220 },
  { at: '2026-09-26T08:40', seconds: 1500 },
];

/** Time in the Booth to redo pickups: a fixed set-up, and what each pickup redone before took. */
export const PICKUP_BOOTH: { readonly setupSeconds: number; readonly seconds: Readonly<Record<string, number>> } = {
  setupSeconds: 180,
  seconds: { c3a: 55, c3b: 40, c3c: 70, p1: 60, p2: 45, p4: 50 },
};

/** The finished length of the chapters that have been measured, in seconds, by chapter id. */
export const CHAPTER_LENGTHS: Readonly<Record<string, number>> = { '1': 685, '2': 670, '4': 868 };
