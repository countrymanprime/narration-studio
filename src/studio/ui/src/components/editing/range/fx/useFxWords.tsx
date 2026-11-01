import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EditCut } from '../../../../api/contracts/editCuts';
import type { WordFx } from '../../../../api/contracts/wordFx';
import { overlay } from '../../../../overlay/overlayService';
import type { FxChainsPort } from '../../../../ports/fxchains';
import type { FxChoice, FxList } from '../../../../ports/daw';
import { targetOf } from '../../effects/EffectSettings';
import { favouritesFirst } from '../../effects/favourites';
import { useFxFavourites, type FxFavourites } from '../../effects/useFxFavourites';
import { usePort } from '../../../../ports/usePort';
import type { Journal } from '../../../../studio/journal/createJournal';
import { useContextProvider, type ContextProvider } from '../../../../registries/context';
import type { ContextMenuItem } from '../../../primitives/ContextMenu';
import { registerSelectionAction } from '../../bar/selectionActions';
import { registerWordMenuSection } from '../../menu/wordMenuRegistry';
import { summarize, type Range, type SelSummary } from '../../model';
import { useEditingPage } from '../../script/EditingPageState';
import { docCutsOf, snapEnd, type RangeLocator } from '../common/locate';
import { spanForKeys } from '../common/spanRequest';
import type { Span } from '../../ribbon/rangeMath';
import { BUILT_IN, planRange, type RangePlan } from '../common/rangePlan';
import { AddFxButton } from './FxButtons';
import { FxDialog } from './FxDialog';
import { applyFxCommand, fxPlanFor, removeFxCommand, type FxPlan } from './fxCommand';
import { addFxItem, fxMenuItems } from './fxMenu';
import { fxTitle } from './fxText';
import { createHostFxChains } from '../../../../ports/fxchains';
import { returnToScript } from '../../script/returnToScript';
import { useChooseInDaw, type FxChooser } from './useChooseInDaw';
import { useDawCapabilities } from '../../../../hooks/useDawCapabilities';

export interface FxWordsOptions {
  journal: Pick<Journal, 'act' | 'undo'>;
  chapterId: string;
  chapterName: string;
  /** The chapter's stored effects as the page last read them. */
  effects: readonly WordFx[];
  /** The chapter's stored cuts, so the effect's words and times follow the audio when earlier audio is cut. */
  cuts: readonly EditCut[];
  locator: RangeLocator;
  /** The chapter's effects after an effect is added, taken off or forgotten; the page underlines the words from them. */
  onEffects: (effects: WordFx[]) => void;
  /** The Effects tab's coverage cap for these words: a sentence when the effect would take the coverage over it (#1300). */
  cap?: (range: Range) => string;
  /** The DAW's own list. Defaults to the host's `workspaceListFXChains`; a different one changes the menu with no change to the screen. */
  chains?: FxChainsPort;
}

export interface FxWords {
  /** The plan for the DAW now, or null until it has answered. */
  plan: RangePlan | null;
  /** The DAW's list with the narrator's favourites first, or null until it has answered or while it cannot list. */
  list: FxList | null;
  /** The narrator's favourite effects: what the Effects tab stars, and what put them first in `list`. */
  favourites: FxFavourites;
  /** Opens the menu of the DAW's effects at an element. */
  openMenu: (anchor: HTMLElement) => void;
  /** Asks first, then adds the chain to the words. A refusal is a toast and nothing opens. */
  ask: (keys: readonly string[], chainId?: string) => void;
  /** Takes the effect off through the history. */
  remove: (fx: WordFx) => Promise<void>;
  /** The F key handler for `useEditingKeys`. */
  fx: () => void;
  /** The menu anchor; the page renders it once, beside the script, inside the context-menu host that opens the menu from it. */
  menu: ReactNode;
  /** Why the Add FX control is off for a selection, or ''. */
  refusalOf: (summary: SelSummary) => string;
  /** Choose in the DAW (#2251): any plug-in the DAW has, chosen in the DAW's own FX window for the words. */
  chooser: FxChooser;
}

const NO_ANSWER = 'Could not ask the DAW what it can do.';
const NO_SELECTION = 'Select some words first.';

/**
 * Add FX to a range of words: registers the bar and toolbar action, the word menu section, and answers the F key. Every way in lists the DAW's own
 * effects (`FxChainsPort`) and opens the same question; nothing reaches the DAW until it is answered. The chains are never named here.
 */
export function useFxWords({ journal, chapterId, chapterName, effects, cuts, locator, onEffects, cap, chains }: FxWordsOptions): FxWords {
  const { doc, selected, state } = useEditingPage();
  const daw = usePort('daw');
  const log = usePort('editWordFx');
  const alignment = usePort('alignment');
  const workspace = usePort('workspace');
  const port = useMemo(
    () => chains ?? createHostFxChains({ dawCapabilities: () => daw.capabilities(), workspaceListFXChains: () => workspace.workspaceListFXChains() }),
    [chains, daw, workspace],
  );
  const [dawList, setList] = useState<FxList | null>(null);
  const { names, error, toggle } = useFxFavourites();
  const favourites = useMemo<FxFavourites>(() => ({ names, error, toggle }), [names, error, toggle]);
  const list = useMemo(() => (dawList ? favouritesFirst(dawList, names) : null), [dawList, names]);
  const [listWhy, setListWhy] = useState('');
  const anchor = useRef<HTMLSpanElement>(null);

  const { caps: dawCaps, failed: dawFailed } = useDawCapabilities();
  const plan = useMemo<RangePlan | null>(
    () => (dawFailed ? { kind: 'refused', reason: NO_ANSWER } : dawCaps ? planRange(dawCaps, 'fx_range') : null),
    [dawCaps, dawFailed],
  );
  const dawName = dawCaps ? (dawCaps.daw === 'none' || dawCaps.daw === 'Built-in' ? BUILT_IN : dawCaps.daw) : 'the DAW';
  useEffect(() => {
    let live = true;
    port.list().then(
      (l) => {
        if (!live) return;
        setList(l);
        setListWhy('');
      },
      (e: unknown) => {
        if (!live) return;
        setList(null);
        setListWhy(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [port, plan]);

  const docCuts = useMemo(() => docCutsOf(cuts), [cuts]);
  const planOf = useCallback((summary: SelSummary): FxPlan => fxPlanFor({ plan, summary, locator, effects, cap }), [plan, locator, effects, cap]);
  /** Why Add FX is off: the plan's refusal, else the list's own sentence when the DAW cannot list. */
  const refusalOf = useCallback((summary: SelSummary): string => planOf(summary).refusal || (list ? '' : listWhy), [planOf, list, listWhy]);
  const planRefusal = useCallback((summary: SelSummary): string => planOf(summary).refusal, [planOf]);
  const chooser = useChooseInDaw({ journal, daw, log, chapterId, locator, plan, planRefusal, onEffects });

  const run = useCallback(
    async (range: Range, chain: { id: string; name: string }, source: string, needsOver: boolean, confirmedOver: boolean, span?: Span) => {
      if (!plan || plan.kind === 'refused') return;
      const result = await journal.act(
        applyFxCommand({ daw, log, onEffects }, plan, { chapterId, range, chain, source, locator, needsOver, confirmedOver, ...(span ? { span } : {}) }),
      );
      if (!result.ok) return overlay.toast(result.refusal.reason, { tone: 'error' });
      const { id, value } = result.value;
      overlay.toastUndo(value.message, () => journal.undo(id), { entry: id });
    },
    [plan, journal, daw, log, onEffects, chapterId, locator],
  );

  /** The effect already on these words with this chain: the DAW's Compare plays a chain it finds on the words, so A/B needs one. */
  const onTheWords = useCallback(
    (summary: SelSummary, chainId: string): WordFx | undefined => {
      const words = new Set(summary.ranges.flatMap((r) => r.keys));
      return effects.find((f) => f.chainId === chainId && f.keys.some((k) => words.has(k)));
    },
    [effects],
  );
  const compareReason = useCallback(
    (summary: SelSummary, chain: FxChoice): string => {
      if (!plan || plan.kind === 'refused') return plan?.kind === 'refused' ? plan.reason : 'Checking what the DAW can do.';
      return onTheWords(summary, chain.id)
        ? ''
        : `The DAW compares an effect that is on the words. Add ${chain.name} first, then compare it in the Effects tab.`;
    },
    [plan, onTheWords],
  );
  const compare = useCallback(
    async (summary: SelSummary, chain: FxChoice) => {
      const on = onTheWords(summary, chain.id);
      const target = on ? targetOf(on, chapterId, locator) : null;
      if (!target) return overlay.toast('These words are not in the script, so the DAW cannot be asked about them.', { tone: 'error' });
      try {
        const { result } = await daw.compareFxRange(target);
        overlay.toast(result.ok ? result.message : (result.refused ?? result.message), result.ok ? undefined : { tone: 'error' });
      } catch (e) {
        overlay.toast(`The DAW was not asked: ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
      }
    },
    [onTheWords, chapterId, locator, daw],
  );

  const ask = useCallback(
    (keys: readonly string[], chainId?: string) => {
      if (!keys.length) return overlay.toast(NO_SELECTION);
      const span = spanForKeys(state.span, keys, selected);
      const sum = summarize(doc, [...keys], docCuts, (t) => t);
      const why = refusalOf(sum);
      if (why) return overlay.toast(why, { tone: 'error' });
      if (!plan || plan.kind === 'refused' || !list) return;
      const snap = (at: number) => snapEnd(alignment, chapterId, locator, at);
      overlay.open({
        kind: 'dialog',
        dismissOnOutsidePress: false,
        returnFocus: returnToScript,
        title: fxTitle(sum.audible.length),
        render: ({ close }) => (
          <FxDialog
            doc={doc}
            keys={keys}
            cuts={docCuts}
            plan={plan}
            list={list}
            chainId={chainId}
            chapterName={chapterName}
            locator={locator}
            span={span}
            snap={snap}
            overOf={(summary) => planOf(summary).over}
            compareReason={compareReason}
            onCompare={(summary, chain) => void compare(summary, chain)}
            onCancel={close}
            onConfirm={(summary, chain, over) => {
              close();
              const range = summary.ranges[0];
              if (range) void run(range, chain, list.source, over !== null, over !== null, span);
            }}
          />
        ),
      });
    },
    [doc, docCuts, refusalOf, plan, list, alignment, chapterId, chapterName, locator, planOf, run, compareReason, compare, state.span, selected],
  );

  const remove = useCallback(
    async (fx: WordFx) => {
      if (!plan || plan.kind === 'refused') return overlay.toast(plan?.kind === 'refused' ? plan.reason : 'Checking what the DAW can do.', { tone: 'error' });
      const result = await journal.act(removeFxCommand({ daw, log, onEffects }, plan, { chapterId, fx, locator }));
      if (!result.ok) return overlay.toast(result.refusal.reason, { tone: 'error' });
      const { id } = result.value;
      overlay.toastUndo(`Took ${fx.chainName} off the words.`, () => journal.undo(id), { entry: id });
    },
    [plan, journal, daw, log, onEffects, chapterId, locator],
  );

  /** The menu of the DAW's effects for these keys; `summary` is what the word menu already worked out, else it is worked out here. */
  const itemsOf = useCallback(
    (keys: readonly string[], summary: SelSummary | null): ContextMenuItem[] =>
      fxMenuItems({
        list,
        listWhy,
        refusal: summary ? refusalOf(summary) : refusalOf(summarize(doc, [...keys], docCuts, (t) => t)),
        dawName,
        onPick: (chainId) => ask(keys, chainId),
      }),
    [refusalOf, doc, docCuts, list, listWhy, dawName, ask],
  );

  // From the bar at the foot of the card the list ends just above the button, over the script, so it neither covers the bar's own Delete
  // nor the key hints nor runs past the card (alignment audit R3ED-4, XED-22): the menu opens down from the point it is given, so once it
  // is drawn and its height known it is opened again that far above the button. From a word it opens under the word.
  const openMenu = useCallback((el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    const target = anchor.current ?? el;
    const at = (y: number) =>
      target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: box.left, clientY: y }));
    if (!el.closest('[role="toolbar"][aria-label="Playback and selection"]')) return void at(box.bottom);
    at(box.top);
    requestAnimationFrame(() => {
      const popup = document.querySelector<HTMLElement>('[role="menu"]');
      const height = popup?.getBoundingClientRect().height ?? 0;
      if (height > 0 && box.top - 6 - height >= 8) at(box.top - 6 - height);
    });
  }, []);

  const fx = useCallback(() => {
    if (!selected.length) return overlay.toast(NO_SELECTION);
    const sum = summarize(doc, selected, docCuts, (t) => t);
    const why = refusalOf(sum);
    if (why) return overlay.toast(why, { tone: 'error' });
    const last = document.querySelector<HTMLElement>(`[data-k="${CSS.escape(selected[selected.length - 1])}"]`);
    const at = last ?? anchor.current;
    if (at) openMenu(at);
  }, [selected, doc, docCuts, refusalOf, openMenu]);

  const latest = useRef({ openMenu, refusalOf, itemsOf, selected, effects, remove });
  useEffect(() => {
    latest.current = { openMenu, refusalOf, itemsOf, selected, effects, remove };
  });
  useEffect(() => {
    const removers = [
      registerSelectionAction({
        id: 'fx.add',
        order: 10,
        where: 'both',
        render: ({ summary, allCut }) =>
          allCut ? null : <AddFxButton reason={latest.current.refusalOf(summary) || undefined} onClick={(el) => latest.current.openMenu(el)} />,
      }),
      registerWordMenuSection({
        order: 90,
        items: ({ keys, summary }) =>
          summary.items.length > 0 && summary.items.every((i) => i.cut)
            ? []
            : [addFxItem(latest.current.itemsOf(keys, summary), latest.current.refusalOf(summary))],
      }),
      // "Remove <chain>" for the first effect on the selected words, as the mock's menu has it.
      registerWordMenuSection({
        order: 105,
        items: ({ summary }) => {
          const id = summary.items.map((i) => i.fx[0]).find((x) => x !== undefined);
          const on = id === undefined ? undefined : latest.current.effects.find((f) => f.id === id);
          return on ? [{ key: 'fx-remove', label: `Remove ${on.chainName}`, onSelect: () => void latest.current.remove(on) }] : [];
        },
      }),
    ];
    return () => removers.forEach((off) => off());
  }, [plan, list]);

  // The context-menu host asks this provider when the menu opens on the anchor, so the list is chosen for the selection each time.
  const provider = useMemo<ContextProvider>(
    () => ({
      match: (target) => target.closest('[data-fx-anchor]') !== null,
      items: () => latest.current.itemsOf(latest.current.selected, null),
      // A list of effects, not a page menu: the search items belong to the right-click menu.
      tail: false,
    }),
    [],
  );
  useContextProvider(provider);
  const menu = <span ref={anchor} aria-hidden="true" data-fx-anchor className="contents" />;
  return { plan, list, favourites, openMenu, ask, remove, fx, menu, refusalOf, chooser };
}
