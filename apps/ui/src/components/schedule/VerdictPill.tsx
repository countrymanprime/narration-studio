import { StatusBadge, type StatusTone } from '../primitives/StatusBadge';
import { fmtD, addDays } from './dates';
import { PACE } from './estimates';
import { deadlineTone, type Calc, type Tone, type Verdict } from './progress';

type Kind = 'ok' | 'warn' | 'bad';
const RANK: Record<Kind, number> = { ok: 0, warn: 1, bad: 2 };
const TONE_KIND: Record<Tone, Kind> = { neutral: 'ok', success: 'ok', warn: 'warn', danger: 'bad' };
const VERDICT_KIND: Record<Verdict, Kind> = { ok: 'ok', tight: 'warn', behind: 'bad' };
const LABEL: Record<Kind, string> = { ok: 'On track', warn: 'Tight', bad: 'Behind' };
/** A shape as well as a colour, so the verdict is never told by colour alone. */
const KIND: Record<Kind, { tone: StatusTone; glyph: string }> = {
  ok: { tone: 'success', glyph: '✓' },
  warn: { tone: 'warning', glyph: '!' },
  bad: { tone: 'danger', glyph: '✕' },
};

/** The words after the verdict: when the work is done at the pace, and what the due date needs. */
function detail(k: Calc, today: Date, due: Date): string {
  const finish = fmtD(addDays(today, Math.ceil(k.days)));
  if (k.verdict === 'ok') return `at ${PACE} h/day done ${finish}`;
  const needs = `done ${finish}, due ${fmtD(due)}`;
  return k.verdict === 'tight' ? needs : `${needs} · needs ${k.reqPace.toFixed(1)} h/day`;
}

/**
 * The one-line answer to "will I make the due date" (the mock's VerdictPill): the verdict in words with a mark, and when it is done. The
 * days left set the tone and the projection can only make it worse (ADR 0801). It says so in words only when there is a due date.
 */
export function VerdictPill({ k, today, due }: { k: Calc; today: Date; due: Date | null }) {
  if (k.finished) return <StatusBadge tone="success" icon={KIND.ok.glyph} label="Finished · every chapter delivered" />;
  if (!due || !k.verdict) return <StatusBadge tone="neutral" label="No due date set" />;
  const byDays = TONE_KIND[deadlineTone(k)];
  const byPace = VERDICT_KIND[k.verdict];
  const kind = RANK[byDays] > RANK[byPace] ? byDays : byPace;
  return <StatusBadge tone={KIND[kind].tone} icon={KIND[kind].glyph} label={`${LABEL[kind]} · ${detail(k, today, due)}`} />;
}
