import { useCallback, useEffect, useRef, useState } from 'react';
import { DAW_CHOSEN_CHAIN, type DawFxRangeChoice } from '../../../../api/contracts/daw';
import type { EditWordFxApi, WordFx } from '../../../../api/contracts/wordFx';
import { overlay } from '../../../../overlay/overlayService';
import type { DawClient } from '../../../../ports/daw';
import type { Journal } from '../../../../studio/journal/createJournal';
import type { Range, SelSummary } from '../../model';
import { tokensOf, type RangeLocator } from '../common/locate';
import type { RangePlan } from '../common/rangePlan';
import { FX_FADE_MS, keepChosenCommand } from './fxCommand';

/** How often the DAW is asked what the narrator has chosen while its FX window is open, in milliseconds. */
const CHOOSE_POLL_MS = 1500;

/** Where Choose in the DAW is: nothing asked, the window being opened, or open with what the DAW last said is chosen. */
export type ChooseState =
  | { phase: 'idle' }
  | { phase: 'opening' }
  | {
      phase: 'choosing';
      /** The words the window was opened for. */
      text: string;
      /** The DAW's last read of the choice, or null before the first answer. */
      choice: DawFxRangeChoice | null;
      /** When the DAW last answered, in milliseconds since the epoch, or null before it has. */
      heardAt: number | null;
      /** Why the last read or step failed, in the DAW's words, or ''. */
      problem: string;
      /** A Keep it or a Cancel is on its way. */
      busy: boolean;
    };

/** Choose in the DAW for the Effects tab: open the DAW's own FX window on the selected words, follow what is chosen, keep it or cancel. */
export interface FxChooser {
  state: ChooseState;
  /** Why Choose cannot start for these words, or ''. */
  refusalOf: (summary: SelSummary) => string;
  /** Opens the DAW's FX window for the words. A refusal is a toast and nothing opens. */
  start: (summary: SelSummary) => void;
  /** Records what the DAW holds as an effect on the words, as one history entry. */
  keep: () => void;
  /** Takes whatever was chosen off and joins the words back in the DAW, recording nothing. */
  cancel: () => void;
  /** Asks the DAW again now. */
  check: () => void;
}

export interface ChooseInDawOptions {
  journal: Pick<Journal, 'act' | 'undo'>;
  daw: Pick<DawClient, 'chooseFxForRange' | 'chosenFxForRange' | 'removeFxFromRange'>;
  log: Pick<EditWordFxApi, 'editingWordFxRecord' | 'editingWordFxRemove'>;
  chapterId: string;
  locator: RangeLocator;
  plan: RangePlan | null;
  /** Why an effect cannot go on these words (the Add FX plan's refusal, without the chain list). */
  planRefusal: (summary: SelSummary) => string;
  onEffects: (effects: WordFx[]) => void;
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
export const NOTHING_CHOSEN = 'Nothing is chosen in the DAW yet. Choose an effect in its FX window, or press Cancel.';

/**
 * Choose in the DAW (#2251): the DAW splits the words off and opens its own FX window on them, then this asks every CHOOSE_POLL_MS (and when the
 * window gets focus back) what the narrator has chosen there. Once something is chosen and the DAW's window is closed, it is kept on its own; Keep it
 * keeps it with the window open. Cancel takes it off and joins the words back. Nothing is recorded until it is kept.
 */
export function useChooseInDaw({ journal, daw, log, chapterId, locator, plan, planRefusal, onEffects }: ChooseInDawOptions): FxChooser {
  const [state, setState] = useState<ChooseState>({ phase: 'idle' });
  const target = useRef<{ range: Range; firstToken: number; lastToken: number } | null>(null);
  const acting = plan && plan.kind !== 'refused' ? plan : null;

  const refusalOf = useCallback((summary: SelSummary): string => planRefusal(summary), [planRefusal]);

  const read = useCallback(async () => {
    const at = target.current;
    if (!at) return;
    try {
      const choice = await daw.chosenFxForRange({ chapterId, firstToken: at.firstToken, lastToken: at.lastToken });
      if (target.current !== at) return;
      setState((s) =>
        s.phase !== 'choosing'
          ? s
          : {
              ...s,
              choice: choice.result.ok ? choice : s.choice,
              heardAt: Date.now(),
              problem: choice.result.ok ? '' : (choice.result.refused ?? choice.result.message),
            },
      );
    } catch (e) {
      if (target.current === at) setState((s) => (s.phase === 'choosing' ? { ...s, problem: why(e) } : s));
    }
  }, [daw, chapterId]);

  const start = useCallback(
    (summary: SelSummary) => {
      if (state.phase !== 'idle' || !acting) return;
      const reason = refusalOf(summary);
      const range = summary.ranges[0];
      const tokens = range ? tokensOf(locator, range) : null;
      if (reason || !range || !tokens) return overlay.toast(reason || 'These words cannot take an effect.', { tone: 'error' });
      setState({ phase: 'opening' });
      daw
        .chooseFxForRange({ chapterId, ...tokens, fadeMs: FX_FADE_MS })
        .then((res) => {
          if (!res.ok) {
            setState({ phase: 'idle' });
            return overlay.toast(res.refused ?? res.message, { tone: 'error' });
          }
          target.current = { range, ...tokens };
          setState({ phase: 'choosing', text: range.text, choice: null, heardAt: null, problem: '', busy: false });
          overlay.toast(res.message);
        })
        .catch((e: unknown) => {
          setState({ phase: 'idle' });
          overlay.toast(`The DAW was not asked: ${why(e)}`, { tone: 'error' });
        });
    },
    [state.phase, acting, refusalOf, locator, daw, chapterId],
  );

  const finish = useCallback(() => {
    target.current = null;
    setState({ phase: 'idle' });
  }, []);

  const keep = useCallback(() => {
    const at = target.current;
    if (state.phase !== 'choosing' || state.busy || !at || !acting) return;
    const label = state.choice?.label ?? '';
    if (!state.choice?.fx.length || !label) return setState({ ...state, problem: NOTHING_CHOSEN });
    setState({ ...state, busy: true });
    void journal
      .act(keepChosenCommand({ daw, log, onEffects }, acting, { chapterId, range: at.range, label, source: `Chosen in ${acting.dawName}`, locator }))
      .then((result) => {
        if (!result.ok) return setState((s) => (s.phase === 'choosing' ? { ...s, busy: false, problem: result.refusal.reason } : s));
        finish();
        const { id, value } = result.value;
        overlay.toastUndo(value.message, () => journal.undo(id), { entry: id });
      });
  }, [state, acting, journal, daw, log, onEffects, chapterId, locator, finish]);

  const cancel = useCallback(() => {
    const at = target.current;
    if (state.phase !== 'choosing' || state.busy || !at) return;
    setState({ ...state, busy: true });
    daw
      .removeFxFromRange({ chapterId, firstToken: at.firstToken, lastToken: at.lastToken, chainName: DAW_CHOSEN_CHAIN })
      .then((res) => {
        if (!res.ok) return setState((s) => (s.phase === 'choosing' ? { ...s, busy: false, problem: res.refused ?? res.message } : s));
        finish();
        overlay.toast(res.message);
      })
      .catch((e: unknown) => setState((s) => (s.phase === 'choosing' ? { ...s, busy: false, problem: `The DAW was not asked: ${why(e)}` } : s)));
  }, [state, daw, chapterId, finish]);

  // Follow the DAW while its window is open: on a timer, and when this window gets focus back from the DAW's.
  const choosing = state.phase === 'choosing';
  useEffect(() => {
    if (!choosing) return;
    void read();
    const timer = setInterval(() => void read(), CHOOSE_POLL_MS);
    const onFocus = () => void read();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [choosing, read]);

  // Something chosen and the DAW's window closed: the narrator is done there, so keep it.
  const ready = state.phase === 'choosing' && !state.busy && !state.problem && !!state.choice?.fx.length && !state.choice.chainOpen;
  useEffect(() => {
    if (ready) keep();
  }, [ready, keep]);

  return { state, refusalOf, start, keep, cancel, check: () => void read() };
}
