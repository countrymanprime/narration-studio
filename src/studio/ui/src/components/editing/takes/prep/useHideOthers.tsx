import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DawResult } from '../../../../api/contracts/daw';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import type { DawClient } from '../../../../ports/daw';
import type { Command, Journal, Result } from '../../../../studio/journal/createJournal';
import type { EditingKeyHandlers } from '../../keys/useEditingKeys';
import { registerWordMenuSection, type WordMenuSelection } from '../../menu/wordMenuRegistry';
import { registerTakeControl } from '../takeControls';
import type { LinePassage, TakesGate } from '../types';
import { useTakesGate } from '../useTakesGate';
import { HideOthersConfirmBody } from './HideOthersConfirm';
import { HideButton } from './PrepControls';

const KEEP_FIRST = 'Keep a take first.';
const NO_OTHERS = 'There are no other takes to hide.';

export interface HideOthersOptions {
  journal: Pick<Journal, 'act' | 'undo'>;
  /** The take the DAW said it kept for each line, by line id (`useKeepTakes`). */
  kept: Readonly<Record<string, string>>;
  /** The line the keys are on, or null. */
  current: () => LinePassage | null;
  /** The line a word-menu selection is in, or null. */
  passageOf: (selection: WordMenuSelection) => LinePassage | null;
}

export interface HideOthers {
  /** The takes hidden for a line, by take id. */
  hiddenIds: (passageId: string) => readonly string[];
  /** The passage as the page draws it: its hidden takes left out unless the narrator is looking at them. */
  shown: (passage: LinePassage) => LinePassage;
  /** Asks, then mutes every take but the kept one. Needs a kept take. */
  hideOthers: (passage: LinePassage) => Promise<void>;
  /** H: hides the others; with them hidden, looks at them or puts them away. No DAW call for the looking. */
  toggle: (passage: LinePassage) => Promise<void>;
  /** The key the Editing page binds. */
  handlers: Required<Pick<EditingKeyHandlers, 'hideOthers'>>;
}

const refusal = (r: DawResult): Result<never> => ({ ok: false, refusal: { code: r.code ?? 'daw_refused', reason: r.refused ?? r.message } });

/** Mutes the other takes in the DAW (one undo step there). Nothing is deleted. A DAW that muted nothing is a refusal, so no entry is made. */
function hideCommand(daw: DawClient, passage: LinePassage, keptId: string, count: number, dawName: string): Command<DawResult> {
  return {
    label: `Hid ${count} other ${count === 1 ? 'take' : 'takes'}`,
    touches: [`takes/${passage.id}`],
    daw: true,
    async run() {
      const result = await daw.hideTakes(passage.chapterId, passage.firstToken, passage.lastToken, keptId);
      if (!result.ok || !result.changed) return refusal(result);
      return { ok: true, value: result };
    },
    notUndoableReason: `Undo the hide in ${dawName}.`,
  };
}

const plural = (n: number) => (n === 1 ? 'take' : 'takes');

/**
 * Hide the other takes once one is kept: the DAW mutes them, asked first, and nothing is deleted. "Look at them again" shows and hides them in the
 * page without a DAW call. Registers the "Hide the other takes" and "Look at hidden takes" controls in the footer of the line's takes and the word
 * menu item.
 */
export function useHideOthers({ journal, kept, current, passageOf }: HideOthersOptions): HideOthers {
  const daw = usePort('daw');
  const gate = useTakesGate();
  const [hidden, setHidden] = useState<Record<string, readonly string[]>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [dawName, setDawName] = useState('the DAW');
  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (caps) => live && setDawName(caps.daw === 'none' ? 'the built-in recorder' : caps.daw),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [daw]);

  const hiddenIds = useCallback((id: string): readonly string[] => hidden[id] ?? [], [hidden]);
  const othersOf = (passage: LinePassage): string[] => {
    const keptId = kept[passage.id];
    return passage.takes.filter((t) => t.id !== keptId && !(hidden[passage.id] ?? []).includes(t.id)).map((t) => t.id);
  };

  const shown = useCallback(
    (passage: LinePassage): LinePassage => {
      const ids = hidden[passage.id] ?? [];
      return ids.length === 0 || revealed[passage.id] ? passage : { ...passage, takes: passage.takes.filter((t) => !ids.includes(t.id)) };
    },
    [hidden, revealed],
  );

  const hideOthers = useCallback(
    async (passage: LinePassage) => {
      const keptId = kept[passage.id];
      const keptTake = passage.takes.find((t) => t.id === keptId);
      if (!keptTake) return void overlay.toast(KEEP_FIRST);
      const others = othersOf(passage);
      if (others.length === 0) return void overlay.toast(NO_OTHERS);
      const yes = await overlay.confirm({
        title: 'Hide the other takes?',
        body: <HideOthersConfirmBody keptLabel={keptTake.label} count={others.length} dawName={dawName} />,
        confirmLabel: 'Hide takes',
      });
      if (!yes) return;
      const result = await journal.act(hideCommand(daw, passage, keptTake.id, others.length, dawName));
      if (!result.ok) return void overlay.toast(result.refusal.reason, { tone: 'error' });
      setHidden((h) => ({ ...h, [passage.id]: [...(h[passage.id] ?? []), ...others] }));
      setRevealed((r) => ({ ...r, [passage.id]: false }));
      overlay.toast(`Hid ${others.length} other ${plural(others.length)}: hidden, not deleted. They are still in the project. ${result.value.value.message}`);
    },
    // `othersOf` reads `kept` and `hidden`, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daw, dawName, journal, kept, hidden],
  );

  const toggle = useCallback(
    async (passage: LinePassage) => {
      if (!kept[passage.id]) return void overlay.toast(KEEP_FIRST);
      if (othersOf(passage).length > 0) return hideOthers(passage);
      if ((hidden[passage.id] ?? []).length > 0) setRevealed((r) => ({ ...r, [passage.id]: !r[passage.id] }));
      else overlay.toast(NO_OTHERS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kept, hidden, hideOthers],
  );

  const latest = useRef({ toggle, hideOthers, current, passageOf, othersOf, gate, kept, hidden, revealed });
  latest.current = { toggle, hideOthers, current, passageOf, othersOf, gate, kept, hidden, revealed };

  useEffect(() => {
    const offHide = registerTakeControl({
      id: 'hide-others',
      order: 10,
      render: ({ passage }): ReactNode => {
        const l = latest.current;
        const others = l.othersOf(passage).length;
        if (passage.takes.length < 2 || others === 0) return null;
        const reason = reasonToHold(l.gate, l.kept[passage.id]);
        return <HideButton id={passage.id} label={`Hide the other ${others} ${plural(others)}`} reason={reason} onPress={() => void l.hideOthers(passage)} />;
      },
    });
    const offLook = registerTakeControl({
      id: 'look-at-hidden',
      order: 11,
      render: ({ passage }): ReactNode => {
        const l = latest.current;
        const count = (l.hidden[passage.id] ?? []).length;
        if (count === 0) return null;
        const label = `${l.revealed[passage.id] ? 'Put away' : 'Look at'} ${count} hidden ${plural(count)}`;
        return <HideButton id={`${passage.id}-look`} label={label} onPress={() => void l.toggle(passage)} />;
      },
    });
    const offMenu = registerWordMenuSection({
      order: 310,
      items: (selection) => {
        const l = latest.current;
        const passage = l.passageOf(selection);
        if (!passage || passage.takes.length < 2) return [];
        const hiddenCount = (l.hidden[passage.id] ?? []).length;
        const hiding = l.othersOf(passage).length > 0;
        if (!hiding && hiddenCount === 0) return [];
        const label = hiding ? 'Hide the other takes (H)' : `${l.revealed[passage.id] ? 'Put away' : 'Look at'} the hidden takes (H)`;
        const off = hiding ? reasonToHold(l.gate, l.kept[passage.id]) : undefined;
        return [{ key: 'hide-others', label, ...(off !== undefined ? { unavailable: off } : {}), onSelect: () => void l.toggle(passage) }];
      },
    });
    return () => {
      offHide();
      offLook();
      offMenu();
    };
  }, [gate, kept, hidden, revealed]);

  const hideKey = useCallback(() => {
    const passage = latest.current.current();
    if (passage) void latest.current.toggle(passage);
  }, []);

  return { hiddenIds, shown, hideOthers, toggle, handlers: { hideOthers: hideKey } };
}

/** Why Hide the others is off now: the DAW cannot mute, or no take is kept. */
function reasonToHold(gate: TakesGate, keptId: string | undefined): string | undefined {
  if (!gate.ok) return gate.reason;
  return keptId === undefined ? KEEP_FIRST : undefined;
}
