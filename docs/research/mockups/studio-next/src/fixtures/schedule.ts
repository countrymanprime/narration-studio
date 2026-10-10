/** Sample data for the delivery plan: how the narrator can be paid and the sample contract. */
import type { Contract, PaymentType, RecordingCheck } from '@/domain/schemas'

export const PAYMENT_TYPES: PaymentType[] = [
  { id: 'pfh', label: 'Per finished hour', unit: 'per finished hour' },
  { id: 'royalty', label: 'Royalty share', unit: '% of royalties' },
  { id: 'none', label: 'None or unspecified', unit: '' },
]

export const CONTRACT: Contract = { payment: 'pfh', amount: 250 }

/** Recording checks already run on the sample book. Chapter 5 was checked when less of it was recorded, so its result is out of date. */
export const SAMPLE_CHECKS: Array<Omit<RecordingCheck, 'textKey'>> = [
  { chapterId: '3', model: 'Whisper base', rec: 100, at: '2026-09-22', basis: '2026-09-26T08:40', gaps: 2, readTo: 4, paras: 4, unfinished: { start: 0, end: 0 } },
  { chapterId: '5', model: 'Whisper base', rec: 60, at: '2026-09-24', basis: '2026-09-26T08:40', gaps: 0, readTo: 10, paras: 16, unfinished: { start: 0, end: 6 } },
]
