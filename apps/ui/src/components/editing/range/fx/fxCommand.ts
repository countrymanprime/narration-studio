import type { DawResult } from '../../../../api/contracts/daw';
import type { EditWordFxApi, WordFx, WordFxRequest } from '../../../../api/contracts/wordFx';
import type { DawClient, FxChoice } from '../../../../ports/daw';
import type { Command, Result } from '../../../../studio/journal/createJournal';
import { clock } from '../../bar/clock';
import { curTime, type CutSpan, type Range, type SelSummary } from '../../model';
import { tokensOf, type RangeLocator } from '../common/locate';
import type { RangePlan } from '../common/rangePlan';

/** The fade at each new split, in milliseconds (the mock's FX_FADE_MS). */
export const FX_FADE_MS = 8;

export const NO_AUDIO = 'There is no audio for these words.';
const CUT_ALREADY = 'These words are cut already.';
export const ONLY_SAID = 'Only words of the script can take an effect: these were said and are not in it.';
export const SPANS_TWO_TAKES = 'This selection spans two takes. An effect needs words from one take.';
export const SPANS_TWO_PARAGRAPHS = 'This selection spans two paragraphs. An effect needs words from one paragraph.';
export const NO_BACKUP = 'The audio could not be backed up, so nothing was changed.';
export const NEEDS_CONFIRM = 'The narrator has not confirmed adding this anyway, so nothing was changed.';
const CHECKING = 'Checking what the DAW can do.';

type Acting = Exclude<RangePlan, { kind: 'refused' }>;

/** A step run before the DAW is asked; a refusal stops the effect with nothing changed. A step may answer `{ backupId }`, which the record keeps. */
export interface BeforeFxStep {
  name: string;
  run(context: { chapterId: string; range: Range; label: string }): Promise<Result<unknown>>;
}

/** The steps a DAW that changes the audio itself runs before an effect. The backup slice appends its backup here; with none, such an effect is refused. */
export const beforeFx: BeforeFxStep[] = [];

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const refusal = (code: string, reason: string): Result<never> => ({ ok: false, refusal: { code, reason } });
const failed = (e: unknown): DawResult => ({ ok: false, changed: false, message: why(e), undoSteps: 0, refused: why(e) });
/** The words a record names: the script's (`pid:n`); a word said and not in the script has no key the record keeps. */
const scriptKeys = (keys: readonly string[]): string[] => keys.filter((k) => /:\d+$/.test(k));

/** The history entry's name: "Added Voice polish to 3 words at 0:12". */
const addLabel = (chain: string, n: number, start: number): string => `Added ${chain} to ${plural(n, 'word', 'words')} at ${clock(start)}`;

/** What stands in the way of confirming without being a refusal: the narrator must say "Add anyway" first. */
export interface FxOver {
  /** Effects already on some of the same words. */
  overlaps: string[];
  /** The Effects tab's cap sentence when the coverage goes over it, else ''. */
  cap: string;
  /** The sentence the dialog shows. */
  text: string;
}

export interface FxPlan {
  /** Why an effect cannot go on these words, in words; '' when it can. */
  refusal: string;
  /** The one range the effect goes on, or null while refused. */
  range: Range | null;
  /** Set when the dialog's button reads "Add anyway". */
  over: FxOver | null;
}

export interface FxPlanInput {
  /** The plan for the DAW now, or null until it has answered. */
  plan: RangePlan | null;
  summary: SelSummary;
  locator: RangeLocator;
  /** The chapter's stored effects, stale ones included (they are left out here). */
  effects: readonly WordFx[];
  /** The Effects tab's coverage cap for these words: a sentence when the effect would take the coverage over it. */
  cap?: (range: Range) => string;
}

/**
 * What adding an effect to the selected words comes to: one range, the plan's refusal, and whether it needs "Add anyway". A selection across
 * two takes (or two paragraphs) is refused with the reason, the DAW is not asked, and a DAW that changes the audio itself and has no backup step is refused.
 */
export function fxPlanFor({ plan, summary, locator, effects, cap }: FxPlanInput): FxPlan {
  const none = (reason: string): FxPlan => ({ refusal: reason, range: null, over: null });
  if (!plan) return none(CHECKING);
  if (plan.kind === 'refused') return none(plan.reason);
  if (!summary.audible.length) return none(summary.hasCut ? CUT_ALREADY : NO_AUDIO);
  if (summary.ranges.length > 1) return none(new Set(summary.ranges.map((r) => r.pid)).size > 1 ? SPANS_TWO_PARAGRAPHS : SPANS_TWO_TAKES);
  const range = summary.ranges[0];
  if (!tokensOf(locator, range)) return none(ONLY_SAID);
  if (plan.kind === 'backup-then-daw' && !beforeFx.length) return none(NO_BACKUP);
  const overlaps = effects.filter((f) => !f.stale && f.keys.some((k) => range.keys.includes(k))).map((f) => f.chainName);
  const capText = cap?.(range) ?? '';
  if (!overlaps.length && !capText) return { refusal: '', range, over: null };
  const parts = [
    overlaps.length ? `${[...new Set(overlaps)].join(', ')} is already on some of these words; this chain goes on top of it.` : '',
    capText,
  ].filter(Boolean);
  return { refusal: '', range, over: { overlaps, cap: capText, text: parts.join(' ') } };
}

export interface FxAsk {
  chapterId: string;
  /** The one range, snapped. */
  range: Range;
  chain: FxChoice;
  /** Where the list came from, kept with the effect ("Your REAPER FX chains"). */
  source: string;
  locator: RangeLocator;
  /** The narrator has seen the overlap or the cap and said "Add anyway". */
  confirmedOver: boolean;
  /** The plan said it needs that. */
  needsOver: boolean;
  fadeMs?: number;
}

export interface FxDeps {
  daw: Pick<DawClient, 'applyFxToRange' | 'removeFxFromRange'>;
  log: Pick<EditWordFxApi, 'editingWordFxRecord' | 'editingWordFxRemove'>;
  /** The chapter's effects after each record or removal, so the page underlines the words. */
  onEffects: (effects: WordFx[]) => void;
}

export interface FxDone {
  /** The effect recorded. */
  id: string;
  /** The DAW's sentence (or the recorder's). */
  message: string;
}

const recordOf = (a: FxAsk, daw: string, backupId?: string): WordFxRequest => ({
  pid: a.range.pid,
  ...(a.range.takeId ? { takeId: a.range.takeId } : {}),
  keys: scriptKeys(a.range.keys),
  text: a.range.text,
  a: a.range.a,
  b: a.range.b,
  off0: a.range.off0,
  off1: a.range.off1,
  chainId: a.chain.id,
  chainName: a.chain.name,
  source: a.source,
  fadeMs: a.fadeMs ?? FX_FADE_MS,
  daw,
  guid: '',
  ...(backupId ? { backupId } : {}),
});

const tokenSpan = (locator: RangeLocator, keys: readonly string[]): { firstToken: number; lastToken: number } | null =>
  tokensOf(locator, { keys: [...keys] } as Range);

/** The DAW's `changed: false` after an accepted call: nothing happened, so nothing is recorded. */
const nothingChanged = (res: DawResult): Result<never> => refusal('nothing_changed', res.message);

/**
 * Puts the chain on the words as one history entry. The DAW is asked first (the recorder keeps an effect entry and asks no DAW; a DAW that changes
 * the audio itself runs the backup steps first); only an effect it accepted is recorded through the Editing records, in the recording's time before
 * any cut. A refusal records nothing and adds no entry. The inverse is the DAW's `removeFxFromRange`, then forgetting the record.
 */
export function applyFxCommand(deps: FxDeps, plan: Acting, ask: FxAsk): Command<FxDone> {
  const { chapterId, range, chain, locator } = ask;
  const label = addLabel(chain.name, range.items.length, range.start);
  const viaDaw = plan.kind !== 'recorder';
  return {
    label,
    touches: [`editing/${chapterId}/wordfx`],
    daw: viaDaw,
    async run() {
      if (ask.needsOver && !ask.confirmedOver) return refusal('needs_confirm', NEEDS_CONFIRM);
      const tokens = tokensOf(locator, range);
      if (!tokens) return refusal('only_said', ONLY_SAID);
      let backupId: string | undefined;
      if (plan.kind === 'backup-then-daw') {
        if (!beforeFx.length) return refusal('no_backup', NO_BACKUP);
        for (const step of beforeFx) {
          const done = await step.run({ chapterId, range, label });
          if (!done.ok) return done;
          const id = (done.value as { backupId?: unknown } | undefined)?.backupId;
          if (typeof id === 'string') backupId = id;
        }
      }
      let message = `${chain.name} is kept as an effect entry on these words.`;
      if (viaDaw) {
        const res = await deps.daw.applyFxToRange({ chapterId, ...tokens, chainName: chain.id, fadeMs: ask.fadeMs ?? FX_FADE_MS }).catch(failed);
        if (!res.ok) return refusal(res.code ?? 'daw_refused', res.refused ?? res.message);
        if (!res.changed) return nothingChanged(res);
        message = res.message;
      }
      try {
        const change = await deps.log.editingWordFxRecord(chapterId, {
          ...recordOf(ask, plan.dawName, backupId),
          guid: `${chapterId}/${tokens.firstToken}-${tokens.lastToken}/${chain.id}`,
        });
        deps.onEffects(change.effects);
        return { ok: true, value: { id: change.changed[0] ?? '', message } };
      } catch (e) {
        return refusal('record_failed', viaDaw ? `${why(e)} ${plan.dawName} added the effect: undo it there (Edit > Undo).` : why(e));
      }
    },
    async undo({ id }) {
      if (viaDaw) {
        const tokens = tokensOf(locator, range);
        if (!tokens) return refusal('only_said', ONLY_SAID);
        const res = await deps.daw.removeFxFromRange({ chapterId, ...tokens, chainName: chain.id }).catch(failed);
        if (!res.ok) return refusal(res.code ?? 'daw_refused', res.refused ?? res.message);
      }
      try {
        deps.onEffects((await deps.log.editingWordFxRemove(chapterId, id)).effects);
        return { ok: true, value: id };
      } catch (e) {
        return refusal('host_refused', why(e));
      }
    },
  };
}

export interface RemoveFxAsk {
  chapterId: string;
  fx: WordFx;
  locator: RangeLocator;
}

/** The record to put back when taking an effect off is undone: the stored effect without what the host adds. */
function requestOf(fx: WordFx): WordFxRequest {
  return {
    pid: fx.pid,
    ...(fx.takeId ? { takeId: fx.takeId } : {}),
    keys: fx.keys,
    text: fx.text,
    a: fx.a,
    b: fx.b,
    off0: fx.off0,
    off1: fx.off1,
    chainId: fx.chainId,
    chainName: fx.chainName,
    source: fx.source,
    fadeMs: fx.fadeMs,
    daw: fx.daw,
    guid: fx.guid,
    ...(fx.backupId ? { backupId: fx.backupId } : {}),
  };
}

/**
 * Takes the effect off the words as one history entry: the DAW's `removeFxFromRange` first (it joins the pieces again), then the record is removed.
 * A refusal changes nothing. The inverse puts the chain back through the DAW and records it again.
 */
export function removeFxCommand(deps: FxDeps, plan: Acting, ask: RemoveFxAsk): Command<WordFx> {
  const { chapterId, fx, locator } = ask;
  const viaDaw = plan.kind !== 'recorder';
  return {
    label: `Took ${fx.chainName} off ${fx.text}`,
    touches: [`editing/${chapterId}/wordfx`],
    daw: viaDaw,
    async run() {
      if (viaDaw) {
        const tokens = tokenSpan(locator, fx.keys);
        if (!tokens) return refusal('only_said', ONLY_SAID);
        const res = await deps.daw.removeFxFromRange({ chapterId, ...tokens, chainName: fx.chainId }).catch(failed);
        if (!res.ok) return refusal(res.code ?? 'daw_refused', res.refused ?? res.message);
      }
      try {
        deps.onEffects((await deps.log.editingWordFxRemove(chapterId, fx.id)).effects);
        return { ok: true, value: fx };
      } catch (e) {
        return refusal('record_failed', viaDaw ? `${why(e)} ${plan.dawName} took the effect off: undo it there (Edit > Undo).` : why(e));
      }
    },
    async undo(removed) {
      if (viaDaw) {
        const tokens = tokenSpan(locator, removed.keys);
        if (!tokens) return refusal('only_said', ONLY_SAID);
        const res = await deps.daw.applyFxToRange({ chapterId, ...tokens, chainName: removed.chainId, fadeMs: removed.fadeMs }).catch(failed);
        if (!res.ok) return refusal(res.code ?? 'daw_refused', res.refused ?? res.message);
      }
      try {
        const change = await deps.log.editingWordFxRecord(chapterId, requestOf(removed));
        deps.onEffects(change.effects);
        return { ok: true, value: change.changed };
      } catch (e) {
        return refusal('host_refused', why(e));
      }
    },
  };
}

/** Where an effect sounds now: its original-time span moved up by the cuts that closed their gaps before it. */
export function fxSpan(fx: Pick<WordFx, 'a' | 'b'>, cuts: readonly CutSpan[]): { start: number; end: number } {
  return { start: curTime(cuts, fx.a), end: curTime(cuts, fx.b) };
}
