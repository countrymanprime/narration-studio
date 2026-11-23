// The pure side of the Pickups list: what the columns say, how rows group by chapter, and the pickup script. The wording is the research
// mock's (`selectors/pickups.ts`: `srcLabel`, `typeLabel`; `state/commands/pickups.ts`: `pickupScript`).
import type { PickupGapKind, PickupItem } from '../../../api/contracts/pickups';
import type { KindId } from '../../../kinds/kindMap';
import { clock } from '../../../clock';

/** A chapter in the Pickups scope. The credits are listed like any chapter but never hold a pickup: the host's list skips them (a pickup is a line of text to re-read). */
export type ChapterRef = { id: string; name: string; credits?: true };

/** One chapter's pickups in the table: a group row ("<n> open") and the rows under it. */
export type PickupGroup = { chapter: ChapterRef; items: PickupItem[]; open: number };

/** The stepper's value that shows every chapter. */
export const ALL_SCOPE = 'all';

const GAP_LABEL: Record<Exclude<PickupGapKind, 'other'>, string> = { missing: 'Left out', extra: 'Extra words', misread: 'Misread' };

/** The pickups the stepper's value covers: one chapter's, or all of them. */
export const inScope = (pickups: readonly PickupItem[], scope: string): PickupItem[] =>
  scope === ALL_SCOPE ? [...pickups] : pickups.filter((pickup) => pickup.chapterId === scope);

/** Earlier in the recording first; a line with no time after the rest, in the order the host gave. Stable. */
const byTime = (a: PickupItem, b: PickupItem): number => (a.time ?? Infinity) - (b.time ?? Infinity) || 0;

/** A group per chapter that has pickups, in chapter order. A pickup whose chapter is not in `chapters` still shows, under its id, after the rest. */
export function groupByChapter(pickups: readonly PickupItem[], chapters: readonly ChapterRef[]): PickupGroup[] {
  const known = new Set(chapters.map((chapter) => chapter.id));
  const refs = [...chapters, ...[...new Set(pickups.map((pickup) => pickup.chapterId))].filter((id) => !known.has(id)).map((id) => ({ id, name: id }))];
  return refs
    .map((chapter) => {
      const items = pickups.filter((pickup) => pickup.chapterId === chapter.id).sort(byTime);
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

/**
 * The kind a pickup is, for the Type column's chip (kinds/kindMap.ts draws it): a gap a speech check found, otherwise the kind of
 * finding the host named. A type the registry has no kind for (a free-text note) is null and draws as a neutral chip.
 */
export function pickupKind(pickup: PickupItem): KindId | null {
  if (pickup.gap && pickup.gap !== 'other') return pickup.gap;
  const type = pickup.type.toLowerCase();
  if (/misread/.test(type)) return 'misread';
  if (/skip|missing|left out/.test(type)) return 'missing';
  if (/extra/.test(type)) return 'extra';
  if (/repeat/.test(type)) return 'repeat';
  if (/pacing|silence/.test(type)) return 'pacing';
  if (/plosive/.test(type)) return 'plosive';
  if (/noise/.test(type)) return 'noise';
  if (/breath/.test(type)) return 'breath';
  if (/click|mouth/.test(type)) return 'click';
  if (/pron/.test(type)) return 'pron';
  return null;
}

/**
 * The open pickups: the lines still to re-record, whoever left them out of the next session. This is the one definition of "open"
 * (the Pickups page's "<n> open" per chapter, the rail's badge, Production's tile and Next up, Schedule's pickup hours all count
 * through it), so the number a page states is the length of the list it points to.
 */
export const openPickups = (pickups: readonly PickupItem[]): PickupItem[] => pickups.filter((pickup) => !pickup.done);

/** The pickups the next session takes: open and not left out. */
export const sessionPickups = (pickups: readonly PickupItem[]): PickupItem[] => pickups.filter((pickup) => !pickup.done && pickup.included);

/** The most characters the host keeps in a hand-added line. */
export const PICKUP_LINE_MAX = 500;

/** Seconds into the recording as "00:05:12", to the nearest second (owner, 2026-11-22, #3590); "—" when the source gave no time. The one Pickups time, on every page that shows one. */
export function pickupTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  return clock(seconds, { hms: true });
}

/** The longest time the Time column holds ("99:59:59"): a recording is never 100 hours long, and a time that rounds past it is not one `parseClock` accepts, so what it accepts `pickupTime` writes back in a form it accepts again. */
const LONGEST_TIME = 99 * 3600 + 59 * 60 + 59;

/**
 * "5:12", "05:12", "05:12.5", "00:05:12.500" (a position as Proof writes it, to the millisecond) or, from an hour, "1:02:05.5" (and what `pickupTime` writes, "00:05:12") to seconds;
 * null for anything else, including minutes or seconds past 59 ("5:99") and a time that rounds past 99:59:59.
 */
export function parseClock(text: string): number | null {
  const match = /^(\d{1,5})(?::([0-5]\d))?:([0-5]\d)(?:\.(\d{1,3}))?$/.exec(text.trim());
  if (!match) return null;
  const [, first, minutes, seconds, fraction] = match;
  const whole = minutes === undefined ? Number(first) * 60 + Number(seconds) : Number(first) * 3600 + Number(minutes) * 60 + Number(seconds);
  const total = whole + (fraction ? Number(`0.${fraction}`) : 0);
  return Math.round(total) > LONGEST_TIME ? null : total;
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

/** The line as it reads: a line the narrator typed is exactly what they typed, markup and all; any other carries `<b>` and `<i>` from a note. */
export const lineText = (pickup: Pick<PickupItem, 'source' | 'script'>): string => (pickup.source === 'you' ? pickup.script : plainLine(pickup.script));

/** The session as text for the clipboard, one line per pickup in the order the screen lists them: "<chapter> · <time>: <line>". */
export function pickupScript(pickups: readonly PickupItem[], chapters: readonly ChapterRef[]): string {
  const name = (id: string): string => chapters.find((chapter) => chapter.id === id)?.name ?? id;
  const rank = (id: string): number => {
    const at = chapters.findIndex((chapter) => chapter.id === id);
    return at < 0 ? chapters.length : at;
  };
  return [...pickups]
    .sort((a, b) => rank(a.chapterId) - rank(b.chapterId) || byTime(a, b))
    .map((pickup) => `${name(pickup.chapterId)} · ${pickupTime(pickup.time)}: ${lineText(pickup)}`)
    .join('\n');
}
