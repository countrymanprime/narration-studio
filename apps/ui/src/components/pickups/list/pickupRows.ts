// The pure side of the Pickups list: what the columns say, how rows group by chapter, and the pickup script. The wording is the Studio
// Next mock's (`selectors/pickups.ts`: `srcLabel`, `typeLabel`; `state/commands/pickups.ts`: `pickupScript`).
import type { PickupGapKind, PickupItem } from '../../../api/contracts/pickups';
import type { StatusTone } from '../../primitives/StatusBadge';

export type ChapterRef = { id: string; name: string };

/** One chapter's pickups in the table: a group row ("<n> open") and the rows under it. */
export type PickupGroup = { chapter: ChapterRef; items: PickupItem[]; open: number };

/** The stepper's value that shows every chapter. */
export const ALL_SCOPE = 'all';

const GAP_LABEL: Record<Exclude<PickupGapKind, 'other'>, string> = { missing: 'Left out', extra: 'Extra words', misread: 'Misread' };

/** The pickups the stepper's value covers: one chapter's, or all of them. */
export const inScope = (pickups: readonly PickupItem[], scope: string): PickupItem[] =>
  scope === ALL_SCOPE ? [...pickups] : pickups.filter((pickup) => pickup.chapterId === scope);

/** A group per chapter that has pickups, in chapter order. A pickup whose chapter is not in `chapters` still shows, under its id, after the rest. */
export function groupByChapter(pickups: readonly PickupItem[], chapters: readonly ChapterRef[]): PickupGroup[] {
  const known = new Set(chapters.map((chapter) => chapter.id));
  const refs = [...chapters, ...[...new Set(pickups.map((pickup) => pickup.chapterId))].filter((id) => !known.has(id)).map((id) => ({ id, name: id }))];
  return refs
    .map((chapter) => {
      const items = pickups.filter((pickup) => pickup.chapterId === chapter.id);
      return { chapter, items, open: openPickups(items).length };
    })
    .filter((group) => group.items.length > 0);
}

/** Where a pickup came from, for the From column. A score shows only when the check had one. */
export function sourceLabel(pickup: PickupItem): string {
  switch (pickup.source) {
    case 'speech':
      return pickup.confidence === null ? 'Speech · no score' : `Speech · ${pickup.confidence.toFixed(2)}`;
    case 'audio':
      return 'Audio';
    case 'proof':
      return 'Proof note';
    case 'you':
      return 'You';
  }
}

/** Why a pickup has no score, as the From cell's title. */
export const sourceTitle = (pickup: PickupItem): string | undefined => (pickup.confidence === null && pickup.confReason ? pickup.confReason : undefined);

/** The Type column: the kind of gap a speech check found, otherwise the kind of finding the host named. */
export const typeLabel = (pickup: PickupItem): string => {
  if (pickup.gap && pickup.gap !== 'other') return GAP_LABEL[pickup.gap];
  // A note's type comes as the host wrote it ("noise", "Mouth click"): the first letter is a capital in every row.
  return pickup.type.charAt(0).toUpperCase() + pickup.type.slice(1);
};

/** The chip's colour (the mock's `t-*` classes): a misread or a left-out line in red, a mouth or noise problem in amber, a name in blue, pacing and repeats in the accent. */
export function typeTone(pickup: PickupItem): StatusTone {
  if (pickup.gap === 'misread' || pickup.gap === 'missing') return 'danger';
  if (pickup.gap === 'extra') return 'warning';
  const type = pickup.type.toLowerCase();
  if (/misread|skip/.test(type)) return 'danger';
  if (/mouth|plosive|noise|breath|click/.test(type)) return 'warning';
  if (/pron/.test(type)) return 'info';
  if (/pacing|repeat/.test(type)) return 'accent';
  return 'neutral';
}

/**
 * The open pickups: the lines still to re-record, whoever left them out of the next session. This is the one definition of "open"
 * (the Pickups page's "<n> open" per chapter, the rail's badge, Production's tile and Next up, Schedule's pickup hours all count
 * through it), so the number a page states is the length of the list it points to.
 */
export const openPickups = (pickups: readonly PickupItem[]): PickupItem[] => pickups.filter((pickup) => !pickup.done);

/** The pickups the next session takes: open and not left out. */
export const sessionPickups = (pickups: readonly PickupItem[]): PickupItem[] => pickups.filter((pickup) => !pickup.done && pickup.included);

/** Seconds into the recording as "05:12.0"; "—" when the source gave no time. */
export function clock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = String(Math.floor(tenths / 600)).padStart(2, '0');
  const rest = String(Math.floor((tenths % 600) / 10)).padStart(2, '0');
  return `${minutes}:${rest}.${tenths % 10}`;
}

/** "5:12", "05:12" or "05:12.5" to seconds; null for anything else. */
export function parseClock(text: string): number | null {
  const match = /^(\d+):(\d{2})(?:\.(\d))?$/.exec(text.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) + (match[3] ? Number(match[3]) / 10 : 0) : null;
}

export type ScriptPart = { kind: 'text' | 'b' | 'i'; text: string };

/** The line to re-record split into plain runs and the `<b>` / `<i>` words a proof note marks; nothing else is markup. */
export function scriptParts(line: string): ScriptPart[] {
  return line
    .split(/(<(?:b|i)>.*?<\/(?:b|i)>)/g)
    .filter((part) => part !== '')
    .map((part) => {
      const tagged = /^<(b|i)>(.*)<\/\1>$/.exec(part);
      return tagged ? { kind: tagged[1] as 'b' | 'i', text: tagged[2] } : { kind: 'text', text: part };
    });
}

/** The line as plain text: the same split with the tags dropped, and any other angle-bracket text left as typed. */
export const plainLine = (line: string): string =>
  scriptParts(line)
    .map((part) => part.text)
    .join('');

/** The session as text for the clipboard, one line per pickup: "<chapter> · <time>: <line>". */
export function pickupScript(pickups: readonly PickupItem[], chapters: readonly ChapterRef[]): string {
  const name = (id: string): string => chapters.find((chapter) => chapter.id === id)?.name ?? id;
  return pickups.map((pickup) => `${name(pickup.chapterId)} · ${clock(pickup.time)}: ${plainLine(pickup.script)}`).join('\n');
}
