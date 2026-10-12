import type { DawResult } from '../../../../api/contracts/daw';
import type { EditCut, EditCutsApi } from '../../../../api/contracts/editCuts';
import type { DawClient } from '../../../../ports/daw';
import type { Command, Result } from '../../../../studio/journal/createJournal';
import { clock } from '../../bar/clock';
import type { Range, SelSummary } from '../../model';
import { tokensOf, type RangeLocator } from '../shared/locate';
import type { RangePlan } from '../shared/rangePlan';

export interface CutOptions {
  /** `close` moves the later audio up by the cut's length; `gap` leaves room tone and moves nothing. */
  mode: 'close' | 'gap';
  /** The crossfade at the join, in milliseconds. */
  fadeMs: number;
}
export const DEFAULT_CUT: CutOptions = { mode: 'close', fadeMs: 12 };
export const FADE_CHOICES = [0, 6, 12, 25] as const;
export const PAD_CHOICES = [0, 50, 100] as const;

export const CUT_ALREADY = 'These words are cut already.';
export const NO_AUDIO = 'There is no audio for these words.';
export const ONLY_SAID = 'Only words of the script can be cut: these were said and are not in it.';
export const NO_BACKUP = 'The audio could not be backed up, so nothing was changed.';
const CHECKING = 'Checking what the DAW can do.';

type Acting = Exclude<RangePlan, { kind: 'refused' }>;

/** A step run before the DAW is asked, for every range at once; a refusal stops the cut with nothing changed. */
export interface BeforeCutStep {
  name: string;
  run(context: { chapterId: string; ranges: readonly Range[]; label: string }): Promise<Result<unknown>>;
}

/** The steps a DAW that changes the audio itself runs before a cut. The backup slice appends its backup here; with none, such a cut is refused. */
export const beforeCut: BeforeCutStep[] = [];

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The history entry's name: "Deleted 3 words and their audio at 0:12", or "Muted 3 words at 0:12". */
function cutLabel(n: number, start: number, mute: boolean): string {
  return `${mute ? 'Muted' : 'Deleted'} ${plural(n, 'word', 'words')}${mute ? '' : ' and their audio'} at ${clock(start)}`;
}

/** Why these words cannot be cut, in words; '' when they can. */
export function cutRefusal(plan: RangePlan | null, sum: SelSummary, locator: RangeLocator): string {
  if (!plan) return CHECKING;
  if (plan.kind === 'refused') return plan.reason;
  if (!sum.audible.length) return sum.hasCut ? CUT_ALREADY : NO_AUDIO;
  if (sum.ranges.some((r) => !tokensOf(locator, r))) return ONLY_SAID;
  return '';
}

export interface CutAsk {
  chapterId: string;
  /** The words, snapped, one range for each paragraph. */
  summary: SelSummary;
  options: CutOptions;
  mute: boolean;
  locator: RangeLocator;
}

export interface CutDeps {
  daw: Pick<DawClient, 'deleteRange'>;
  log: Pick<EditCutsApi, 'editingCutRecord' | 'editingCutRemove'>;
  /** The chapter's cuts after each record or removal, so the page strikes the words and rebuilds its times. */
  onCuts: (cuts: EditCut[]) => void;
}

export interface CutDone {
  /** The cuts recorded, one for each range the DAW cut. */
  ids: string[];
  /** The DAW's sentence for the first range. */
  message: string;
  /** Why a later range was not cut; the ranges before it stay cut and are in this entry. */
  refused?: string;
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const refusal = (code: string, reason: string): Result<never> => ({ ok: false, refusal: { code, reason } });
const failed = (e: unknown): DawResult => ({ ok: false, changed: false, message: why(e), undoSteps: 0, refused: why(e) });
/** The words a cut record names: the script's (`pid:n`); a word said and not in the script has no key the record keeps. */
const scriptKeys = (r: Range): string[] => r.keys.filter((k) => /:\d+$/.test(k));

/**
 * Cuts the words and their audio, one range for each paragraph, as one history entry. The DAW is asked first for each range; only a cut it
 * accepted is recorded through the Editing records, in the recording's time before any cut. A refusal of the first range changes nothing. The
 * inverse forgets the records; for a DAW change the journal runs it only when the DAW's last action is this cut (ADR 0771 rule 4).
 */
export function cutCommand(deps: CutDeps, plan: Acting, ask: CutAsk): Command<CutDone> {
  const { chapterId, summary, options, mute, locator } = ask;
  const mode = mute ? 'gap' : options.mode;
  const label = cutLabel(summary.audible.length, summary.start, mute);
  return {
    label,
    touches: [`editing/${chapterId}/cuts`],
    daw: plan.kind !== 'recorder',
    async run() {
      if (plan.kind === 'backup-then-daw') {
        if (!beforeCut.length) return refusal('no_backup', NO_BACKUP);
        for (const step of beforeCut) {
          const done = await step.run({ chapterId, ranges: summary.ranges, label });
          if (!done.ok) return done;
        }
      }
      const ids: string[] = [];
      let message = '';
      const partly = (reason: string): Result<CutDone> =>
        ids.length ? { ok: true, value: { ids, message, refused: reason } } : refusal('daw_refused', reason);
      for (const r of summary.ranges) {
        const tokens = tokensOf(locator, r);
        if (!tokens) return partly(ONLY_SAID);
        const res = await deps.daw.deleteRange({ chapterId, ...tokens, mode, fadeMs: options.fadeMs }).catch(failed);
        if (!res.ok) return ids.length ? partly(res.refused ?? res.message) : refusal(res.code ?? 'daw_refused', res.refused ?? res.message);
        message ||= res.message;
        if (!res.changed) continue;
        try {
          const change = await deps.log.editingCutRecord(chapterId, {
            pid: r.pid,
            ...(r.takeId ? { takeId: r.takeId } : {}),
            keys: scriptKeys(r),
            text: r.text,
            a: r.a,
            b: r.b,
            off0: r.off0,
            off1: r.off1,
            mode,
            fadeMs: options.fadeMs,
            daw: plan.dawName,
            guid: `${chapterId}/${tokens.firstToken}-${tokens.lastToken}`,
            undoSteps: res.undoSteps,
          });
          ids.push(...change.changed);
          deps.onCuts(change.cuts);
        } catch (e) {
          return partly(`${why(e)} ${plan.dawName} made the cut: undo it there (Edit > Undo).`);
        }
      }
      return ids.length ? { ok: true, value: { ids, message } } : refusal('nothing_cut', message || CUT_ALREADY);
    },
    async undo({ ids }) {
      for (const id of [...ids].reverse()) {
        try {
          deps.onCuts((await deps.log.editingCutRemove(chapterId, id)).cuts);
        } catch (e) {
          return refusal('host_refused', why(e));
        }
      }
      return { ok: true, value: ids };
    },
  };
}
