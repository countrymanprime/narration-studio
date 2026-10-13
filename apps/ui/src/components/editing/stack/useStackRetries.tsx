import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EditStackList, RetryModeAnswer } from '../../../api/contracts/editStacks';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import type { Journal } from '../../../studio/journal/createJournal';
import { registerCommandProvider } from '../../../input/commandProviders';
import { registerWordMenuSection, type WordMenuSelection } from '../menu/wordMenuRegistry';
import { registerDrawerSection } from '../drawer/drawerSections';
import { RetryBar } from './RetryBar';
import { canStack, canUnstack, movableTakes, stackable, stackPlanOf, type RetrySettings, type StackPlan } from '../model/stacking';
import { registerTakeControl } from '../takes/takeControls';
import { StackControls } from './StackControls';
import { StackDialog, stackTitle, type StackDirection } from './StackDialog';
import { cleanUpCommand, stackCommand, unstackCommand, type StackDone } from './stackCommand';
import { BUILT_IN, isRecorder, planStack, type StackActing, type StackHow } from './stackPlan';
import { canCleanUp, keptReason, otherReads, stackModeOf } from './stackedLine';
import { CHECKING, KEPT_UNSTACK, NO_ANSWER, NO_RETRIES, NO_STACKED, STACK_TEXT, plural } from './stackText';
import type { StackLine } from './types';

export interface StackOptions {
  journal: Pick<Journal, 'act' | 'undo'>;
  chapterId: string;
  /** The chapter's lines that have more than one take. */
  lines: readonly StackLine[];
  /** The line a word-menu selection is in, or null. */
  passageOf: (selection: WordMenuSelection) => StackLine | null;
}

export interface StackRetries {
  /** How the DAW stacks now, or null until it has answered. */
  how: StackHow | null;
  /** The lines as the records have them: stacked and with their own retry choice. */
  lines: readonly StackLine[];
  settings: RetrySettings;
  /** Retries that could be stacked in the chapter, counting the lines set to stack. */
  count: number;
  /** Asks first, then stacks. With no ids, every retry group of the chapter set to stack. A refusal is a toast and nothing opens. */
  requestStack: (passageIds?: readonly string[]) => void;
  /** Asks first, with the positions the takes return to, then puts them back. */
  requestUnstack: (passageId: string, takeIds?: readonly string[]) => Promise<void>;
  /** Asks, then hides the other reads of a kept line left in place. Never deletes. */
  requestCleanUp: (passageId: string) => void;
  /** Why stacking is off for the chapter or the line, or undefined. */
  reasonFor: (line?: StackLine) => string | undefined;
  /** Reads the records again (after a retry choice changed). */
  refresh: () => void;
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const NO_SETTINGS: RetrySettings = { retryMode: 'leave', retryChapters: {} };

/**
 * Stack retries, un-stack and the clean-up: reads the chapter's stack records and retry choices, registers the word menu section and the
 * control under a line's takes, and answers the page's calls. Every way in opens the same question; nothing reaches the DAW until it is
 * answered, and the DAW is asked before anything is recorded.
 */
export function useStackRetries({ journal, chapterId, lines, passageOf }: StackOptions): StackRetries {
  const daw = usePort('daw');
  const log = usePort('editStacks');
  const [how, setHow] = useState<StackHow | null>(null);
  const [dawName, setDawName] = useState('the DAW');
  const [records, setRecords] = useState<{ stacks: EditStackList['stacks']; settings: RetrySettings; own: Record<string, RetrySettings['retryMode']> }>({
    stacks: [],
    settings: NO_SETTINGS,
    own: {},
  });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (caps) => {
        if (!live) return;
        setHow(planStack(caps));
        setDawName(isRecorder(caps) ? BUILT_IN : caps.daw);
      },
      () => live && setHow({ kind: 'refused', reason: NO_ANSWER }),
    );
    return () => {
      live = false;
    };
  }, [daw]);

  const ids = useMemo(() => lines.map((l) => l.id).join('\n'), [lines]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [list, project, chapter, ...passages] = await Promise.all([
          log.editingStacksList(chapterId),
          log.editingRetryModeGet('project', '', ''),
          log.editingRetryModeGet('chapter', chapterId, ''),
          ...lines.map((l) => log.editingRetryModeGet('passage', chapterId, l.id)),
        ]);
        if (!live) return;
        const own: Record<string, RetrySettings['retryMode']> = {};
        passages.forEach((a: RetryModeAnswer, i) => {
          if (a.set) own[lines[i].id] = a.set;
        });
        // The chapter's answer already folds in the project's choice; only a chapter that sets its own is a chapter exception.
        setRecords({
          stacks: list.stacks,
          settings: { retryMode: project.mode, retryChapters: chapter.set ? { [chapterId]: chapter.set } : {} },
          own,
        });
      } catch (e) {
        if (live) overlay.toast(why(e), { tone: 'error' });
      }
    })();
    return () => {
      live = false;
    };
    // `ids` stands for `lines`: the records are read again when the set of lines changes, not on every render.
  }, [log, chapterId, ids, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const merged = useMemo<StackLine[]>(
    () =>
      lines.map((l) => {
        const stack = records.stacks.find((s) => s.passageId === l.id);
        const own = records.own[l.id];
        return { ...l, ...(stack ? { stack: { base: stack.base, offsets: stack.offsets } } : { stack: undefined }), ...(own ? { retryMode: own } : {}) };
      }),
    [lines, records],
  );
  const { settings } = records;
  const count = useMemo(() => stackable(settings, merged, chapterId).reduce((n, p) => n + movableTakes(p).length, 0), [settings, merged, chapterId]);

  const reasonFor = useCallback(
    (line?: StackLine): string | undefined => {
      if (!how) return CHECKING;
      if (how.kind === 'refused') return how.reason;
      return line ? keptReason(line) : undefined;
    },
    [how],
  );

  const act = useCallback(
    async (direction: StackDirection, acting: StackActing, plan: StackPlan) => {
      const deps = { daw, log, onChange: refresh };
      const command = (direction === 'stack' ? stackCommand : unstackCommand)(deps, acting, { chapterId, plan });
      const result = await journal.act<StackDone>(command);
      if (!result.ok) return overlay.toast(result.refusal.reason, { tone: 'error' });
      overlay.toast(result.value.value.message);
    },
    [daw, log, refresh, chapterId, journal],
  );

  const open = useCallback(
    (direction: StackDirection, acting: StackActing, plan: StackPlan, source: readonly StackLine[]) => {
      const byId = new Map(source.map((l) => [l.id, l]));
      overlay.open({
        kind: 'dialog',
        dismissOnOutsidePress: false,
        title: stackTitle(direction),
        render: ({ close }) => (
          <StackDialog
            direction={direction}
            plan={plan}
            lines={byId}
            how={acting}
            onCancel={close}
            onConfirm={() => {
              close();
              void act(direction, acting, plan);
            }}
          />
        ),
      });
    },
    [act],
  );

  const requestStack = useCallback(
    (passageIds?: readonly string[]) => {
      if (!how) return void overlay.toast(CHECKING, { tone: 'error' });
      if (how.kind === 'refused') return void overlay.toast(how.reason, { tone: 'error' });
      const chosen = passageIds ? merged.filter((l) => passageIds.includes(l.id) && canStack(l)) : stackable(settings, merged, chapterId);
      const plan = stackPlanOf(chosen, 'stack');
      if (!plan.groups.length) return void overlay.toast(NO_RETRIES);
      open('stack', how, plan, merged);
    },
    [how, merged, settings, chapterId, open],
  );

  const requestUnstack = useCallback(
    async (passageId: string, takeIds?: readonly string[]) => {
      if (!how) return void overlay.toast(CHECKING, { tone: 'error' });
      if (how.kind === 'refused') return void overlay.toast(how.reason, { tone: 'error' });
      // The record is the truth for where the takes return to, so it is read again before asking.
      let fresh: StackLine[];
      try {
        const list = await log.editingStacksList(chapterId);
        fresh = merged.map((l) => {
          const stack = list.stacks.find((s) => s.passageId === l.id);
          return { ...l, stack: stack ? { base: stack.base, offsets: stack.offsets } : undefined };
        });
      } catch (e) {
        return void overlay.toast(why(e), { tone: 'error' });
      }
      const line = fresh.find((l) => l.id === passageId);
      if (!line) return;
      if (!canUnstack(line)) return void overlay.toast(line.kept ? KEPT_UNSTACK : NO_STACKED);
      const plan = stackPlanOf([line], 'unstack', takeIds);
      if (!plan.groups.length) return void overlay.toast(NO_STACKED);
      open('unstack', how, plan, fresh);
    },
    [how, merged, log, chapterId, open],
  );

  const requestCleanUp = useCallback(
    (passageId: string) => {
      const line = merged.find((l) => l.id === passageId);
      if (!line || !line.keptId || !canCleanUp(line, settings)) return;
      const others = otherReads(line);
      const keptId = line.keptId;
      void overlay
        .confirm({
          title: STACK_TEXT.cleanup,
          body: (
            <p className="m-0">
              Hide {plural(others.length, 'other read', 'other reads')} ({others.join(', ')}) of this passage. They are muted and put out of the way, never
              deleted, and Undo brings them back.
            </p>
          ),
          confirmLabel: 'Hide the other reads',
        })
        .then(async (yes) => {
          if (!yes) return;
          const result = await journal.act(cleanUpCommand(daw, line, keptId, others.length, dawName));
          if (!result.ok) return overlay.toast(result.refusal.reason, { tone: 'error' });
          overlay.toastUndo(result.value.value.message, () => journal.undo(result.value.id));
        });
    },
    [merged, settings, journal, daw, dawName],
  );

  const latest = useRef({ requestStack, requestUnstack, requestCleanUp, reasonFor, merged, settings, passageOf, count, refresh });
  useEffect(() => {
    latest.current = { requestStack, requestUnstack, requestCleanUp, reasonFor, merged, settings, passageOf, count, refresh };
  });
  useEffect(() => {
    const offMenu = registerWordMenuSection({
      order: 310,
      items: (selection) => {
        const l = latest.current;
        const found = l.passageOf(selection);
        const line = found && l.merged.find((m) => m.id === found.id);
        if (!line || stackModeOf(line, l.settings) !== 'stack') return [];
        const off = l.reasonFor(line);
        const unavailable = off ? { unavailable: off } : {};
        return [
          ...(canStack(line) ? [{ key: 'stack-retries', label: STACK_TEXT.action, ...unavailable, onSelect: () => l.requestStack([line.id]) }] : []),
          ...(canUnstack(line) ? [{ key: 'unstack-takes', label: STACK_TEXT.unstack, ...unavailable, onSelect: () => void l.requestUnstack(line.id) }] : []),
        ];
      },
    });
    // The jump menu's chapter command, while the chapter has retries to stack (the mock's palette entry).
    const offCommand = registerCommandProvider(() =>
      latest.current.count > 0 ? [{ id: 'editing.stack.chapter', group: 'Editing', label: STACK_TEXT.action, run: () => latest.current.requestStack() }] : [],
    );
    return () => {
      offMenu();
      offCommand();
    };
  }, []);

  // Registered again whenever what it draws changes: the registry tells the takes under a line to draw again.
  useEffect(() => {
    const offControl = registerTakeControl({
      id: 'stack',
      order: 40,
      render: ({ passage }): ReactNode => {
        const line = merged.find((m) => m.id === passage.id);
        if (!line) return null;
        return (
          <StackControls
            line={line}
            settings={settings}
            reason={reasonFor(line)}
            onStack={() => requestStack([line.id])}
            onUnstack={() => void requestUnstack(line.id)}
            onCleanUp={() => requestCleanUp(line.id)}
            onMode={() => refresh()}
          />
        );
      },
    });
    return offControl;
  }, [merged, settings, reasonFor, requestStack, requestUnstack, requestCleanUp, refresh]);

  // The chapter's retry bar at the top of the drawer's Clean up tab (the mock's "Retries" section), while the chapter has lines with takes.
  const hasLines = merged.length > 0;
  useEffect(() => {
    if (!hasLines) return undefined;
    return registerDrawerSection({
      tab: 'cleanup',
      order: 5,
      label: 'Retries',
      render: ({ chapterId: id }) => (
        <RetryBar
          level="chapter"
          chapterId={id}
          scope="chapter"
          count={latest.current.count}
          reason={latest.current.reasonFor()}
          onStack={() => latest.current.requestStack()}
          onChange={() => latest.current.refresh()}
        />
      ),
    });
  }, [hasLines, count]);

  return { how, lines: merged, settings, count, requestStack, requestUnstack, requestCleanUp, reasonFor, refresh };
}
