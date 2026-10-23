// The first-use tips: one entry for each thing a page tells the narrator once. A tip is a short sentence over the page, dismissed with
// "Got it" (or by using what it explains) and never shown again to that narrator (`tipsStore.ts` keeps what was dismissed in the host's
// settings, Tips.seen). A page does not print instructions that stay on screen; it adds a tip here and renders `<FirstUseTip id=…/>`.
//
// To show a feature's tip again after it changes, give the tip a new id: an id the narrator has not dismissed is new to them.

export const TIPS = {
  'script.select-text': {
    page: 'Script',
    text: 'Select text in the reader to mark it, add a note, or look it up.',
  },
} as const satisfies Record<string, { page: string; text: string }>;

export type TipId = keyof typeof TIPS;
