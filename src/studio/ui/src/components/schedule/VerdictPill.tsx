import { statusLabel, statusTone, type StatusId } from '../../kinds/statusTone';
import { StatusBadge } from '../primitives/StatusBadge';
import { addDays, daysText, fmtDY } from './dates';
import { deadlineTone, type Calc, type Tone, type Verdict } from './progress';

type Kind = 'ok' | 'warn' | 'bad';
const RANK: Record<Kind, number> = { ok: 0, warn: 1, bad: 2 };
const TONE_KIND: Record<Tone, Kind> = { neutral: 'ok', success: 'ok', warn: 'warn', danger: 'bad' };
const VERDICT_KIND: Record<Verdict, Kind> = { ok: 'ok', tight: 'warn', behind: 'bad' };
/** A shape as well as a colour, so the verdict is never told by colour alone; the status gives the word and the tone (kinds/statusTone.ts). */
const KIND: Record<Kind, { status: StatusId; glyph: string }> = {
  ok: { status: 'on_track', glyph: '✓' },
  warn: { status: 'tight', glyph: '!' },
  bad: { status: 'behind', glyph: '✕' },
};

/** The words after the verdict: when the work is done at the pace, and what the due date needs. */
function detail(k: Calc, today: Date, due: Date): string {
  const finish = fmtDY(addDays(today, Math.ceil(k.days)), today);
  if (k.verdict === 'ok') return `at current pace done ${finish}`;
  const needs = `done ${finish}, due ${fmtDY(due, today)}`;
  // Once the due date is today or past, no daily pace can reach it: say how late instead of a pace of Infinity.
  if (!Number.isFinite(k.reqPace)) return k.daysLeft !== null && k.daysLeft < 0 ? `${needs} · ${daysText(k.daysLeft).toLowerCase()}` : `${needs} · due today`;
  return k.verdict === 'tight' ? needs : `${needs} · needs ${k.reqPace.toFixed(1)} h/day`;
}

/**
 * The one-line answer to "will I make the due date" (the mock's VerdictPill): the verdict in words with a mark, and when it is done. The
 * days left set the tone and the projection can only make it worse. It says so in words only when there is a due date.
 */
export function VerdictPill({ k, today, due }: { k: Calc; today: Date; due: Date | null }) {
  if (k.finished) return <StatusBadge tone="success" icon={KIND.ok.glyph} label={verdictLabel(k, today, due)} />;
  if (!due || !k.verdict) return <StatusBadge tone="neutral" label={verdictLabel(k, today, due)} />;
  const kind = verdictKind(k, k.verdict);
  return <StatusBadge tone={statusTone(KIND[kind].status)} icon={KIND[kind].glyph} label={verdictLabel(k, today, due)} />;
}

/** The days set the tone and the projection can only make it worse. */
function verdictKind(k: Calc, verdict: Verdict): Kind {
  const byDays = TONE_KIND[deadlineTone(k)];
  const byPace = VERDICT_KIND[verdict];
  return RANK[byDays] > RANK[byPace] ? byDays : byPace;
}

/** The pill's words, which the page also says to a screen reader when the due date changes: "Behind · done Oct 27, due Oct 10 · 9 days overdue". */
export function verdictLabel(k: Calc, today: Date, due: Date | null): string {
  if (k.finished) return 'Finished · every chapter delivered';
  if (!due || !k.verdict) return 'No due date set';
  return `${statusLabel(KIND[verdictKind(k, k.verdict)].status)} · ${detail(k, today, due)}`;
}
