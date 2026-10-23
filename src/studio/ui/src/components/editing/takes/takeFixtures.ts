import type { TakeEvidence, TakeFigure } from '../../../api/contracts/takeEvidence';
import type { LinePassage, LineTake } from './types';

const ok = (value: number): TakeFigure => ({ ok: true, value });
const no = (reason: string): TakeFigure => ({ ok: false, reason });
const SCRIPT = 'I won’t say another word about the morning, said the Pigeon.';

const evidence = (id: string, matched: number, rms: number, via: TakeEvidence['via'] = 'aligned'): TakeEvidence => ({
  id,
  matched: ok(matched),
  measure: { pause: ok(1.2), rms: ok(rms), nf: ok(-61), clarity: no('Not measured'), breaths: ok(2) },
  via,
});

const take = (id: string, patch: Partial<LineTake> = {}): LineTake => ({
  id,
  label: id.toUpperCase(),
  active: false,
  usable: true,
  sourceFile: `${id}.wav`,
  sourceStart: 12,
  sourceLength: 8,
  ...patch,
});

/** Three takes of one line at one level: measured, so the suggestion has a number. */
export function measuredPassage(): LinePassage {
  return {
    id: 'ps-9',
    chapterId: '5',
    firstToken: 10,
    lastToken: 20,
    script: SCRIPT,
    takes: [
      take('t-7', { active: true, said: SCRIPT, evidence: evidence('t-7', 100, -20.2, 'map') }),
      take('t-8', { said: 'I don’t say another word about the morning, said the Pigeon.', evidence: evidence('t-8', 90, -20.4) }),
      take('t-9', { said: 'I won’t say another word, said the Pigeon.', evidence: evidence('t-9', 70, -20.1) }),
    ],
  };
}

/** Takes recorded 6 dB apart: the suggestion cannot claim a confidence and says why. */
export function unevenPassage(): LinePassage {
  const p = measuredPassage();
  return { ...p, takes: p.takes.map((t, i) => ({ ...t, evidence: evidence(t.id, 90 - i * 5, -20 - i * 3) })) };
}

/** One take measured, one with a reason for some figures, one with none. */
export function partlyMeasuredPassage(): LinePassage {
  const p = measuredPassage();
  const reasoned: TakeEvidence = {
    id: 't-8',
    matched: ok(90),
    measure: {
      pause: no('The file is not on this machine.'),
      rms: no('The file is not on this machine.'),
      nf: no('The file is not on this machine.'),
      clarity: no('Not measured'),
      breaths: no('The file is not on this machine.'),
    },
    via: 'aligned',
  };
  const none: TakeEvidence = {
    id: 't-9',
    matched: no('This take was not aligned to the script, so its words were not matched.'),
    measure: { pause: no('Not measured'), rms: no('Not measured'), nf: no('Not measured'), clarity: no('Not measured'), breaths: no('Not measured') },
    via: 'aligned',
  };
  return {
    ...p,
    takes: [p.takes[0], { ...p.takes[1], evidence: reasoned }, { ...p.takes[2], usable: false, reason: 'This take cannot be heard.', evidence: none }],
  };
}

export const singleTakePassage = (): LinePassage => ({ ...measuredPassage(), takes: [measuredPassage().takes[0]] });
