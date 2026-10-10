/**
 * Sample data behind the mock measurement provider: what the recorder and the take log would report. A real provider
 * (the recorder's input meter, the DAW's take log) replaces the mock without any screen changing.
 */
import { z } from 'zod'

export const TakeLogEntry = z.object({
  /** When the take was recorded (local date and time). */
  at: z.string(),
  /** Seconds of finished audio it added. */
  seconds: z.number().nonnegative(),
})
export type TakeLogEntry = z.infer<typeof TakeLogEntry>

/** The room tone each microphone reported at its last measurement, in dB. */
export const ROOM_TONE_DB: Record<string, number> = {
  'USB audio interface · Input 1': -64.1,
  'USB microphone': -58.6,
  'Built-in microphone': -49.3,
}

/** Takes recorded so far, one entry per sitting. Together they are the recorded length of the sample book. */
export const TAKE_LOG: TakeLogEntry[] = [
  { at: '2026-09-14T10:10', seconds: 900 },
  { at: '2026-09-15T09:30', seconds: 1000 },
  { at: '2026-09-17T14:00', seconds: 600 },
  { at: '2026-09-19T11:15', seconds: 500 },
  { at: '2026-09-21T10:00', seconds: 350 },
  { at: '2026-09-22T15:20', seconds: 400 },
  { at: '2026-09-24T09:45', seconds: 300 },
  { at: '2026-09-25T16:30', seconds: 220 },
  { at: '2026-09-26T08:40', seconds: 1500 },
]

/** Time in the booth to redo pickups: a fixed set-up, and what each pickup that was redone before took. */
export const PICKUP_BOOTH = {
  setupSeconds: 180,
  seconds: { c3a: 55, c3b: 40, c3c: 70, p1: 60, p2: 45, p4: 50 } as Record<string, number>,
}

/**
 * The finished length of chapters that have been measured (a recorded, edited chapter), in seconds, by chapter id. Together with each
 * chapter's words they give the narrator's own rate in words per finished hour.
 */
export const CHAPTER_LENGTHS: Record<string, number> = { '1': 685, '2': 670, '4': 868 }
