import type { DawActionKind, DawCapabilities, DawLastAction, DawResult } from '../api/contracts/daw';
import { DAW_RESULT_MAX_UNDO_STEPS } from '../api/contracts/daw';
import { brand } from '../brand.gen';

// The mock DAW's undo history: a stack of the undo labels REAPER's script closes its blocks with, so the mock's `dawLastAction` and
// `dawUndoLast` answer as narration_undo.lua and dawport/reaper's undo_last role do. The labels are the mock's model of the DAW
// (each the constant of the narration_*.lua file named beside it); the page never names one.

/** The label each mocked DAW edit leaves on the history, as the Lua command closes its undo block. */
export const MOCK_DAW_UNDO_LABELS = {
  /** narration_range.lua's UNDO_DELETE_WORDS (narration_bridge_core.lua's cut_range): delete_range, for a cut and a trim. */
  cut: `${brand.name}: delete words`,
  addChain: `${brand.name}: add chain to range`,
  removeChain: `${brand.name}: remove chain from range`,
  setParam: `${brand.name}: change effect setting`,
  bypass: `${brand.name}: bypass effect`,
  enable: `${brand.name}: turn effect back on`,
  reduceGain: `${brand.name}: lower stretches`,
  repairClicks: `${brand.name}: repair clicks`,
  /** narration_takes.lua */
  hideTakes: `${brand.name}: hide other takes`,
  stack: `${brand.name}: stack takes`,
  unstack: `${brand.name}: unstack takes`,
  split: `${brand.name}: split take`,
  /** narration_workspace.lua */
  useTake: `${brand.name}: use take`,
  /** narration_navigation.lua */
  addMarker: `${brand.name}: add approved marker`,
  /** narration_pickups.lua */
  importPickups: `${brand.name}: import pickups`,
  resolvePickup: `${brand.name}: resolve pickup`,
  reopenPickup: `${brand.name}: reopen pickup`,
  /** narration_replace.lua (narration_bridge_core.lua's replace_range and restore_replacement). */
  replace: `${brand.name}: replace audio`,
  restoreReplacement: `${brand.name}: put audio back`,
  /** REAPER's own point for a stopped recording (REAPER 7.82, docs/research/reaper-recording-undo-2026-10-23.md), which record_take undoes. */
  recordedMedia: 'Recorded media',
} as const;

/** The one label each action kind may undo (narration_bridge_core.lua's table; for record_take, the label REAPER gives a stopped recording). */
const KIND_LABELS: Readonly<Record<DawActionKind, string>> = {
  cut_range: MOCK_DAW_UNDO_LABELS.cut,
  record_take: MOCK_DAW_UNDO_LABELS.recordedMedia,
  replace_range: MOCK_DAW_UNDO_LABELS.replace,
  restore_replacement: MOCK_DAW_UNDO_LABELS.restoreReplacement,
};

/** Each kind worded for the answers, one and several (dawport/reaper's actionNouns). */
const KIND_NOUNS: Readonly<Record<DawActionKind, readonly [string, string]>> = {
  cut_range: ['cut', 'cuts'],
  record_take: ['take', 'recorded passes of the take'],
  replace_range: ['replacement', 'replacements'],
  restore_replacement: ['put-back', 'put-backs'],
};

/** dawport/reaper's answer when the DAW's next undo point is not the kind's: nothing was undone. */
export const notLastAnswer = (daw: string): string => `${daw}'s last action is not this one, so it was left alone. Use Edit > Undo in ${daw}.`;

/** dawport/reaper's answer for steps outside 1 to DAW_RESULT_MAX_UNDO_STEPS. */
export const UNDO_STEPS_ANSWER = 'The number of steps to undo must be 1 to 12, so nothing was undone.';

/** dawport/reaper's answer when `undone` of `steps` points of `kind` were undone (undone at least 1). */
export function undoneAnswer(daw: string, kind: DawActionKind, undone: number, steps: number): string {
  const [one, several] = KIND_NOUNS[kind];
  if (undone < steps)
    return `Undid ${undone} of the ${steps} ${several} in ${daw}. The rest are no longer ${daw}'s last actions, so they were left alone. Use Edit > Undo in ${daw} for them.`;
  // A take is one take however many points it left (dawport/reaper's messageUndoneTake).
  if (kind === 'record_take') return `Undid the take in ${daw}.`;
  return undone === 1 ? `Undid the ${one} in ${daw}.` : `Undid the last ${undone} ${several} in ${daw}.`;
}

/** Whether `kind` is one this build knows; the host rejects any other. */
export function knownActionKind(kind: string): kind is DawActionKind {
  return Object.hasOwn(KIND_LABELS, kind);
}

/** The history one mock DAW keeps, newest last. */
export class MockUndoHistory {
  private readonly labels: string[] = [];

  /** Puts `label` on the history when `result` is an edit that added an undo point, and passes `result` on. */
  record(label: string, result: DawResult): DawResult {
    if (result.ok && result.undoSteps >= 1) this.push(label, 1);
    return result;
  }

  /** Puts `count` points labelled `label` on the history: a stopped take leaves one per stop. */
  push(label: string, count: number): void {
    for (let i = 0; i < count; i += 1) this.labels.push(label);
  }

  /** narration_undo.lua's last_action: `this` when the top label is exactly the kind's, else `other`. */
  lastAction(kind: DawActionKind): DawLastAction {
    return this.labels.at(-1) === KIND_LABELS[kind] ? 'this' : 'other';
  }

  /** narration_undo.lua's undo_last and dawport/reaper's answers: up to `steps` points of `kind` from the top, one at a time, stopping
   * at the first other label; none undone is the refusal that names the setup's DAW. `undoSteps` is 0: an undo adds no undo point. */
  undoLast(setup: Pick<DawCapabilities, 'daw'>, kind: DawActionKind, steps: number): DawResult {
    const { daw } = setup;
    if (!Number.isInteger(steps) || steps < 1 || steps > DAW_RESULT_MAX_UNDO_STEPS) return refusal(UNDO_STEPS_ANSWER);
    let undone = 0;
    while (undone < steps && this.labels.at(-1) === KIND_LABELS[kind]) {
      this.labels.pop();
      undone += 1;
    }
    if (undone === 0) return refusal(notLastAnswer(daw));
    return { ok: true, changed: true, message: undoneAnswer(daw, kind, undone, steps), undoSteps: 0 };
  }
}

function refusal(sentence: string): DawResult {
  return { ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence };
}
