import type { ChapterStatus } from '../../../api/contracts/manuscript';
import { PICKUP_HOURS, RATIO, WPH } from '../../schedule/estimates';

/** Where an item sits among the stages (Prep, Record, Edit, Proof, Pickups, Master): the least advanced comes first on a tie. */
const STAGE = { prep: 0, record: 1, pickups: 4, master: 5 } as const;
/** ADR 0404's groups: in progress and not ready, other in progress, ready to confirm, not started. */
type Group = 0 | 1 | 2 | 3;

/** What the page knows that Next up can list. An input is null when its source has nothing to say, and then its item is absent. */
export type NextUpInputs = {
  /** The chapter being recorded: the first whose status is `recording`. `share` is the measured fraction recorded, null when not measured. */
  recording: { chapterId: string; stage: ChapterStatus; name: string; words: number; share: number | null } | null;
  /** The open pickup lines, project-wide, and the names of the chapters they are in. */
  pickups: { lines: number; chapters: readonly string[] } | null;
  /** The first chapter that fails the delivery check, and what failed. */
  failing: { chapterId: string; tag: string; fails: readonly string[] } | null;
  /** Chapters changed by a new manuscript; only a host that reports them fills it. */
  changed: { count: number; names: readonly string[] } | null;
};

export type NextItem =
  | {
      kind: 'rec';
      group: Group;
      stage: number;
      risk: number;
      chapterId: string;
      chapterStage: ChapterStatus;
      name: string;
      share: number | null;
      hoursLeft: number | null;
    }
  | { kind: 'pick'; group: Group; stage: number; risk: number; lines: number; chapters: readonly string[] }
  | { kind: 'fail'; group: Group; stage: number; risk: number; chapterId: string; tag: string; fails: readonly string[] }
  | { kind: 'flags'; group: Group; stage: number; risk: number; count: number; names: readonly string[] };

/**
 * What to do next, ranked by risk to the due date: the work-hours at risk first, then ADR 0404's group order, then the least advanced
 * stage; an item that blocks the work without a time estimate carries no hours. The sort is stable on the order the items are listed.
 */
export function rankNextUp(inputs: NextUpInputs): NextItem[] {
  const items: NextItem[] = [];
  const rec = inputs.recording;
  if (rec) {
    const finishedLeft = (rec.words / WPH) * (1 - (rec.share ?? 0));
    items.push({
      kind: 'rec',
      group: 1,
      stage: STAGE.record,
      risk: finishedLeft * RATIO.rec,
      chapterId: rec.chapterId,
      chapterStage: rec.stage,
      name: rec.name,
      share: rec.share,
      hoursLeft: rec.share === null ? null : finishedLeft,
    });
  }
  if (inputs.pickups && inputs.pickups.lines > 0) {
    items.push({
      kind: 'pick',
      group: 1,
      stage: STAGE.pickups,
      risk: inputs.pickups.lines * PICKUP_HOURS,
      lines: inputs.pickups.lines,
      chapters: inputs.pickups.chapters,
    });
  }
  if (inputs.failing && inputs.failing.fails.length > 0) {
    items.push({
      kind: 'fail',
      group: 0,
      stage: STAGE.master,
      risk: 0,
      chapterId: inputs.failing.chapterId,
      tag: inputs.failing.tag,
      fails: inputs.failing.fails,
    });
  }
  if (inputs.changed && inputs.changed.count > 0) {
    items.push({ kind: 'flags', group: 1, stage: STAGE.prep, risk: 0, count: inputs.changed.count, names: inputs.changed.names });
  }
  const hundredths = (item: NextItem): number => Math.round(item.risk * 100);
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => hundredths(b.item) - hundredths(a.item) || a.item.group - b.item.group || a.item.stage - b.item.stage || a.index - b.index)
    .map((entry) => entry.item);
}
