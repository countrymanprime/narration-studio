import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DawCapabilities } from '../../../../api/contracts/daw';
import type { TakeEvidenceResult } from '../../../../api/contracts/takeEvidence';
import { describeApiError } from '../../../../api/errorMessage';
import { useApi } from '../../../../api/ApiContext';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import type { Journal } from '../../../../studio/journal/createJournal';
import { suggestionFor } from '../evidence';
import { registerTakeControl } from '../takeControls';
import type { LinePassage, LineTake } from '../types';
import { PrepConfirmBody } from './PrepConfirm';
import { PrepStatus, PrepStepButton, PrepStepDone } from './PrepControls';
import { LEVEL_METRIC, LEVEL_TARGET_DB, LEVEL_TOLERANCE, STEP_TEXT, isTrim, normaliseCommand, trimCommand, type PrepStepId, type RangesOf } from './prepSteps';

export interface PrepOptions {
  journal: Pick<Journal, 'act' | 'undo'>;
  /** The takes hidden for a line (`useHideOthers`): they take no part in which steps are offered. */
  hidden?: (passageId: string) => readonly string[];
  /** Where a passage's long pauses and breaths are. Without it the two trims are off with a sentence saying so. */
  rangesOf?: RangesOf;
}

export interface PrepSteps {
  /** The passage with the evidence measured after the steps run here, and none at all while it is being measured again. */
  prepared: (passage: LinePassage) => LinePassage;
  /** Asks first, then runs the step; the evidence is asked for again afterwards. */
  run: (passage: LinePassage, step: PrepStepId) => Promise<void>;
}

type Status = 'updating' | 'stale';

const omitEvidence = ({ evidence: _evidence, ...rest }: LineTake): LineTake => rest;

const STEPS: readonly PrepStepId[] = ['trim-silence', 'trim-breaths', 'normalise'];
const CHECKING = 'Checking what the DAW can do.';
const NO_RANGES = 'The pauses and breaths of this take have not been located yet.';

/**
 * The three prep steps (trim white space, trim breaths, normalise) as footer controls under a line's takes. Each is offered when the suggestion would
 * be surer for it and runs only after the narrator accepts its confirmation. A trim is a range cut to the muted Cuts track through `deleteRange`;
 * normalise is the item-gain path. One history entry per step; afterwards the evidence is asked for again, so the suggestion is worked out again, and
 * while that runs the passage shows no figures. A refusal changes nothing.
 */
export function usePrepSteps({ journal, hidden, rangesOf }: PrepOptions): PrepSteps {
  const daw = usePort('daw');
  const takes = usePort('takes');
  const matcher = useApi();
  const [caps, setCaps] = useState<DawCapabilities | 'error' | null>(null);
  const [fresh, setFresh] = useState<Record<string, TakeEvidenceResult>>({});
  const [status, setStatus] = useState<Record<string, Status | undefined>>({});
  const [done, setDone] = useState<Record<string, readonly PrepStepId[]>>({});
  const running = useRef(new Set<string>());

  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (c) => live && setCaps(c),
      () => live && setCaps('error'),
    );
    return () => {
      live = false;
    };
  }, [daw]);

  const dawName = caps && caps !== 'error' ? (caps.daw === 'none' ? 'the built-in recorder' : caps.daw) : 'the DAW';
  /** Why the step cannot run now, or undefined. */
  const holdOf = (step: PrepStepId): string | undefined => {
    if (caps === null) return CHECKING;
    if (caps === 'error') return 'Could not ask the DAW what it can do.';
    const support = caps.capabilities[STEP_TEXT[step].capability];
    if (!support?.available) return support?.message ?? `${caps.daw} cannot do this now.`;
    return isTrim(step) && !rangesOf ? NO_RANGES : undefined;
  };

  const prepared = useCallback(
    (passage: LinePassage): LinePassage => {
      const wait = status[passage.id] !== undefined;
      const result = fresh[passage.id];
      return {
        ...passage,
        takes: passage.takes.map((t) => {
          const evidence = wait ? undefined : (result?.takes.find((e) => e.id === t.id) ?? t.evidence);
          return evidence ? { ...t, evidence } : omitEvidence(t);
        }),
      };
    },
    [fresh, status],
  );

  const run = useCallback(
    async (passage: LinePassage, step: PrepStepId) => {
      if (running.current.has(passage.id)) return;
      const hold = holdOf(step);
      if (hold) return void overlay.toast(hold, { tone: 'error' });
      running.current.add(passage.id);
      try {
        const asked = await ask(passage, step);
        if (!asked) return;
        setStatus((s) => ({ ...s, [passage.id]: 'updating' }));
        const result = await journal.act<unknown>(asked.command);
        if (!result.ok) {
          setStatus((s) => ({ ...s, [passage.id]: undefined }));
          return void overlay.toast(result.refusal.reason, { tone: 'error' });
        }
        setDone((d) => ({ ...d, [passage.id]: [...(d[passage.id] ?? []), step] }));
        try {
          const again = await takes.evidence(passage.chapterId, passage.firstToken, passage.lastToken);
          setFresh((f) => ({ ...f, [passage.id]: again }));
          setStatus((s) => ({ ...s, [passage.id]: undefined }));
          overlay.toast(`${STEP_TEXT[step].entry}. ${asked.undoHint}`);
        } catch (error) {
          setStatus((s) => ({ ...s, [passage.id]: 'stale' }));
          overlay.toast(`${STEP_TEXT[step].entry}, but the figures could not be measured again: ${describeApiError(error)}`, { tone: 'error' });
        }
      } finally {
        running.current.delete(passage.id);
      }
    },
    // `ask` and `holdOf` read only what is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [caps, journal, takes, rangesOf, matcher, daw, dawName],
  );

  /** The confirmation for the step, then the command to run, or null when the narrator said no or there is nothing to do. */
  async function ask(passage: LinePassage, step: PrepStepId) {
    const label = STEP_TEXT[step].label;
    if (isTrim(step)) {
      let ranges;
      try {
        ranges = await rangesOf!(passage, step);
      } catch (error) {
        overlay.toast(describeApiError(error), { tone: 'error' });
        return null;
      }
      if (ranges.length === 0) {
        overlay.toast(`Nothing to trim: no ${step === 'trim-silence' ? 'long pauses' : 'breaths'} were found in this passage.`);
        return null;
      }
      const yes = await overlay.confirm({
        title: `${label}?`,
        body: <PrepConfirmBody step={step} dawName={dawName} cuts={ranges.length} />,
        confirmLabel: label,
      });
      return yes ? { command: trimCommand(daw, passage, step, ranges, dawName), undoHint: `Undo it in ${dawName}.` } : null;
    }
    let items: number;
    try {
      items = (await matcher.levelMatchPreview(passage.chapterId, LEVEL_METRIC, LEVEL_TARGET_DB, LEVEL_TOLERANCE)).candidates.length;
    } catch (error) {
      overlay.toast(describeApiError(error), { tone: 'error' });
      return null;
    }
    const yes = await overlay.confirm({ title: `${label}?`, body: <PrepConfirmBody step={step} dawName={dawName} items={items} />, confirmLabel: label });
    return yes ? { command: normaliseCommand(matcher, passage, dawName), undoHint: `Undo it in ${dawName}.` } : null;
  }

  const latest = useRef({ run, prepared, hidden, hold: holdOf, done, status });
  latest.current = { run, prepared, hidden, hold: holdOf, done, status };

  useEffect(() => {
    const offs = STEPS.map((step, i) =>
      registerTakeControl({
        id: `prep-${step}`,
        order: 20 + i,
        render: ({ passage }): ReactNode => {
          const l = latest.current;
          if (passage.takes.length < 2) return null;
          const state = l.status[passage.id];
          const shown = l.prepared(passage).takes.filter((t) => !(l.hidden?.(passage.id) ?? []).includes(t.id));
          const needed = state === undefined && suggestionFor(shown).steps.some((s) => s.id === step && s.needed);
          if (needed) return <PrepStepButton id={step} label={STEP_TEXT[step].label} reason={l.hold(step)} onRun={() => void l.run(passage, step)} />;
          return (l.done[passage.id] ?? []).includes(step) ? <PrepStepDone id={step} label={STEP_TEXT[step].label} /> : null;
        },
      }),
    );
    const offStatus = registerTakeControl({
      id: 'prep-status',
      order: 29,
      render: ({ passage }): ReactNode => {
        const state = latest.current.status[passage.id];
        return state ? <PrepStatus state={state} /> : null;
      },
    });
    return () => {
      offs.forEach((off) => off());
      offStatus();
    };
  }, [caps, fresh, status, done, rangesOf, hidden]);

  return { prepared, run };
}
