import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditCut } from '../../../../api/contracts/editCuts';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import type { Journal } from '../../../../studio/journal/createJournal';
import { registerSelectionAction } from '../../bar/selectionActions';
import { registerFlagAction } from '../../flags/flagActions';
import { registerWordMenuSection } from '../../menu/wordMenuRegistry';
import { summarize, type SelSummary } from '../../model';
import { useEditingPage } from '../../script/EditingPageState';
import { docCutsOf, snapEnd, type RangeLocator } from '../common/locate';
import { BUILT_IN, planRange, type RangePlan } from '../common/rangePlan';
import { DeleteButton, MuteButton, RestoreButton } from './CutButtons';
import { CutDialog, cutTitle } from './CutDialog';
import { cutCommand, cutRefusal, type CutOptions } from './cutCommand';

export interface CutWordsOptions {
  journal: Pick<Journal, 'act' | 'undo'>;
  chapterId: string;
  chapterName: string;
  /** The chapter's stored cuts as the page last read them. */
  cuts: readonly EditCut[];
  locator: RangeLocator;
  /** The chapter's cuts after a cut, an undo or a forgotten record; the page rebuilds its document from them. */
  onCuts: (cuts: EditCut[]) => void;
}

export interface CutWords {
  /** The plan for the DAW now, or null until it has answered. */
  plan: RangePlan | null;
  /** Asks first, then cuts (or mutes) the words. A refusal is a toast and nothing opens. */
  ask: (keys: readonly string[], mute: boolean) => void;
  /** Puts cut words back through the history, or says where to undo them and offers to forget the record. */
  restore: (keys: readonly string[]) => Promise<void>;
  /** The Delete and M key handlers for `useEditingKeys`, on the page's selection. */
  remove: () => void;
  mute: () => void;
}

const NO_ANSWER = 'Could not ask the DAW what it can do.';

/** The DAW's own sentence for an undo it must make, and the offer to forget the record once it has. */
const undoThere = (dawName: string): string => `Undo it in ${dawName} (Edit > Undo). The app can only undo what it did this session.`;

/**
 * Delete words and audio, and Mute: registers the bar and toolbar actions, the word menu section and the flag card's slot, and answers the
 * Delete and M keys. Every way in opens the same question; nothing reaches the DAW until it is answered.
 */
export function useCutWords({ journal, chapterId, chapterName, cuts, locator, onCuts }: CutWordsOptions): CutWords {
  const { doc, selected } = useEditingPage();
  const daw = usePort('daw');
  const log = usePort('editCuts');
  const alignment = usePort('alignment');
  const [plan, setPlan] = useState<RangePlan | null>(null);
  const [dawName, setDawName] = useState('the DAW');
  /** The history entry each cut made this session was recorded in. */
  const entries = useRef(new Map<string, number>());
  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (caps) => {
        if (!live) return;
        setPlan(planRange(caps, 'cut_range'));
        setDawName(caps.daw === 'none' || caps.daw === 'Built-in' ? BUILT_IN : caps.daw);
      },
      () => live && setPlan({ kind: 'refused', reason: NO_ANSWER }),
    );
    return () => {
      live = false;
    };
  }, [daw]);

  const docCuts = useMemo(() => docCutsOf(cuts), [cuts]);
  const refusalOf = useCallback((sum: SelSummary) => cutRefusal(plan, sum, locator), [plan, locator]);

  const run = useCallback(
    async (summary: SelSummary, options: CutOptions, mute: boolean) => {
      if (!plan || plan.kind === 'refused') return;
      const result = await journal.act(cutCommand({ daw, log, onCuts }, plan, { chapterId, summary, options, mute, locator }));
      if (!result.ok) return overlay.toast(result.refusal.reason, { tone: 'error' });
      const { id, value } = result.value;
      value.ids.forEach((cut) => entries.current.set(cut, id));
      overlay.toastUndo(value.message, async () => {
        const undone = await journal.undo(id);
        if (undone.ok) value.ids.forEach((cut) => entries.current.delete(cut));
        return undone;
      });
      if (value.refused) overlay.toast(value.refused, { tone: 'error' });
    },
    [plan, journal, daw, log, onCuts, chapterId, locator],
  );

  const ask = useCallback(
    (keys: readonly string[], mute: boolean) => {
      const sum = summarize(doc, [...keys], docCuts, (t) => t);
      const why = refusalOf(sum);
      if (why) return overlay.toast(why, { tone: 'error' });
      if (!plan || plan.kind === 'refused') return;
      const snap = (at: number) => snapEnd(alignment, chapterId, locator, at);
      overlay.open({
        kind: 'dialog',
        dismissOnOutsidePress: false,
        title: cutTitle(sum.audible.length, mute),
        render: ({ close }) => (
          <CutDialog
            doc={doc}
            keys={keys}
            cuts={docCuts}
            mute={mute}
            plan={plan}
            chapterName={chapterName}
            locator={locator}
            snap={snap}
            onCancel={close}
            onConfirm={(summary, options) => {
              close();
              void run(summary, options, mute);
            }}
          />
        ),
      });
    },
    [doc, docCuts, refusalOf, plan, alignment, chapterId, chapterName, locator, run],
  );

  const restore = useCallback(
    async (keys: readonly string[]) => {
      const ids = [...new Set(keys.map((k) => doc.items[doc.index.get(k) ?? -1]?.cut).filter((c): c is string => !!c))];
      const done = new Set<number>();
      for (const cut of ids) {
        const entry = entries.current.get(cut);
        // One entry holds every range of one cut: undoing it once restores them all.
        if (entry !== undefined && done.has(entry)) continue;
        const undone = entry === undefined ? null : await journal.undo(entry);
        if (undone?.ok && entry !== undefined) {
          done.add(entry);
          entries.current.forEach((e, c) => e === entry && entries.current.delete(c));
          overlay.toast('Restored the words and their audio.');
          continue;
        }
        if (undone && !undone.ok && !['daw-last-action', 'not-undoable', 'already-undone'].includes(undone.refusal.code)) {
          overlay.toast(undone.refusal.reason, { tone: 'error' });
          continue;
        }
        overlay.toast(undoThere(dawName), {
          action: {
            label: 'Forget the cut',
            onAction: () =>
              void log.editingCutRemove(chapterId, cut).then(
                (change) => onCuts(change.cuts),
                (e: unknown) => overlay.toast(e instanceof Error ? e.message : String(e), { tone: 'error' }),
              ),
          },
        });
      }
    },
    [doc, journal, dawName, log, chapterId, onCuts],
  );

  const latest = useRef({ ask, restore, refusalOf });
  useEffect(() => {
    latest.current = { ask, restore, refusalOf };
  });
  useEffect(() => {
    const removers = [
      registerSelectionAction({
        id: 'cut.restore',
        order: 5,
        where: 'both',
        render: ({ keys, allCut }) => (allCut ? <RestoreButton onClick={() => void latest.current.restore(keys)} /> : null),
      }),
      registerSelectionAction({
        id: 'cut.mute',
        order: 20,
        where: 'both',
        render: ({ keys, summary, allCut }) =>
          allCut ? null : <MuteButton reason={latest.current.refusalOf(summary) || undefined} onClick={() => latest.current.ask(keys, true)} />,
      }),
      registerSelectionAction({
        id: 'cut.delete',
        order: 30,
        where: 'both',
        render: ({ keys, summary, allCut }) =>
          allCut ? null : <DeleteButton reason={latest.current.refusalOf(summary) || undefined} onClick={() => latest.current.ask(keys, false)} />,
      }),
      registerWordMenuSection({
        order: 100,
        items: ({ keys, summary }) => {
          const why = latest.current.refusalOf(summary);
          const off = why ? { unavailable: why } : {};
          const allCut = summary.items.length > 0 && summary.items.every((i) => i.cut);
          return [
            { key: 'cut-mute', label: 'Mute these words (keep the audio)', ...off, onSelect: () => latest.current.ask(keys, true) },
            { key: 'cut-delete', label: 'Delete words and audio…', ...off, onSelect: () => latest.current.ask(keys, false) },
            ...(allCut ? [{ key: 'cut-restore', label: 'Restore these words', onSelect: () => void latest.current.restore(keys) }] : []),
          ];
        },
      }),
      registerFlagAction('deleteWords', (keys) => latest.current.ask(keys, false)),
    ];
    return () => removers.forEach((off) => off());
  }, [plan]);

  const remove = useCallback(() => ask(selected, false), [ask, selected]);
  const mute = useCallback(() => ask(selected, true), [ask, selected]);
  return { plan, ask, restore, remove, mute };
}
