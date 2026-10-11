import { useCallback, useMemo } from 'react';
import { useCommandProvider, type ProvidedCommand } from '../../../input/commandProviders';
import type { CommandId } from '../../../input/commands.catalog';
import { gestureKeys } from '../../../input/hints';
import type { Keymap } from '../../../input/keymap';
import { EDITABLE, KEY_WIDGET_ROLES } from '../../../input/targets';
import { useCommand } from '../../../input/useCommand';
import { flagged, stepFlag, stepKey, stepPhrase, type ChapterDoc, type DocItem } from '../model';
import { useEditingPage } from '../script/EditingPageState';
import type { PageAction, PageState } from '../script/scriptState';

/**
 * What the Editing page supplies for the keys whose work a later slice does (SN-E33 and after): delete, mute, FX, takes, the timeline, the drawer
 * and the chapter step. A key whose handler is absent is not registered, so the router leaves it alone and nothing is announced.
 */
export interface EditingKeyHandlers {
  play?: () => void;
  remove?: () => void;
  mute?: () => void;
  fx?: () => void;
  takes?: (d: 1 | -1) => void;
  /** Keeps the take the keys are on; Enter on a flagged word opens its card instead. */
  keep?: () => void;
  hideOthers?: () => void;
  strip?: () => void;
  drawer?: () => void;
  chapterStep?: (d: 1 | -1) => void;
}

export interface EditingKeysOptions {
  handlers?: EditingKeyHandlers;
  /** The narrator's keymap, so the jump menu shows the keys that work. */
  keymap: Keymap;
}

type Target = EventTarget | null;

/** A field, or a widget whose arrows move a value or a selection: it keeps the key even when a modifier is held. */
function ownsKey(target: Target): boolean {
  if (!(target instanceof Element)) return false;
  const role = target.getAttribute('role');
  return target.closest(EDITABLE) !== null || Boolean(role && KEY_WIDGET_ROLES.has(role));
}

const inDrawer = (target: Target): boolean => target instanceof Element && target.closest('#drawer') !== null;

/** The word one step from the end of the selection (or the cursor); null when the text is empty. */
const headOf = (state: PageState): string | null => state.sel?.head ?? state.cursor;

/** Where flag stepping starts: from the end of a selection going on, from its start going back, so a run of extra words is not found again. */
function flagFrom(doc: ChapterDoc, state: PageState, d: 1 | -1): string | null {
  if (!state.sel) return state.cursor;
  const at = [state.sel.anchor, state.sel.head].map((k) => doc.index.get(k) ?? 0);
  const i = d > 0 ? Math.max(...at) : Math.min(...at);
  return doc.items[i]?.key ?? null;
}

/** Puts the cursor on a flagged word: a run of extra words is selected whole, and the card opens for the word (or the doubled read). */
function focusFlag(doc: ChapterDoc, dispatch: (a: PageAction) => void, it: DocItem): void {
  if (it.st === 'extra') {
    const run = doc.items.filter((x) => x.pid === it.pid && x.st === 'extra' && x.run === it.run && !x.cut);
    if (run.length) {
      dispatch({ type: 'select', anchor: run[0].key, head: run[run.length - 1].key });
      dispatch({ type: 'openFlag', key: run.some((x) => x.dup) ? `dup:${it.pid}` : run[0].key });
      return;
    }
  }
  dispatch({ type: 'place', key: it.key });
  dispatch({ type: 'openFlag', key: it.key });
}

/** Asks the context host for the menu of the cursor word, as a right-click on it would (the menu itself is SN-E33's). */
function openWordMenu(key: string): void {
  const el = document.querySelector<HTMLElement>(`[data-k="${CSS.escape(key)}"]`);
  if (!el) return;
  const box = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: box.left, clientY: box.bottom }));
}

/**
 * The Editing page's keys over its page state: stepping and extending by word, stepping by phrase, stepping flags, Enter on a flagged word, Escape,
 * Shift+F10, and the jump menu's page commands. Each is a catalogue row bound by the router, which already keeps a plain key out of a field,
 * a button or a widget that owns it and gives a dialog the key first; a modified key repeats the field check here. With no text nothing
 * is registered. The later slices' keys come through `handlers`.
 */
export function useEditingKeys({ handlers = {}, keymap }: EditingKeysOptions): void {
  const { doc, state, dispatch } = useEditingPage();
  const on = doc.items.length > 0;
  const { play, remove, mute, fx, takes, keep, hideOthers, strip, drawer, chapterStep } = handlers;

  const move = useCallback(
    (d: number) => {
      const to = stepKey(doc, headOf(state), d);
      if (to) dispatch({ type: 'place', key: to });
    },
    [doc, state, dispatch],
  );
  const extend = useCallback(
    (d: number) => {
      const anchor = state.sel?.anchor ?? state.cursor ?? stepKey(doc, null, 1);
      const to = stepKey(doc, headOf(state), d);
      if (anchor && to) dispatch({ type: 'select', anchor, head: to });
    },
    [doc, state, dispatch],
  );
  const phrase = useCallback(
    (d: 1 | -1) => {
      const to = stepPhrase(doc, headOf(state), d);
      if (to) dispatch({ type: 'place', key: to });
    },
    [doc, state, dispatch],
  );
  const flag = useCallback(
    (d: 1 | -1) => {
      const to = stepFlag(doc, flagFrom(doc, state, d), d);
      const it = to ? doc.items[doc.index.get(to) ?? -1] : undefined;
      if (it) focusFlag(doc, dispatch, it);
    },
    [doc, state, dispatch],
  );

  // Plain keys: the router has already kept them out of a field, a button or a widget.
  useCommand('workspace.word.prev', () => move(-1), on);
  useCommand('workspace.word.next', () => move(1), on);
  useCommand('workspace.paragraph.prev', () => phrase(-1), on);
  useCommand('workspace.paragraph.next', () => phrase(1), on);
  useCommand('workspace.flag.prev', () => flag(-1), on);
  useCommand('workspace.flag.next', () => flag(1), on);
  useCommand('workspace.play', () => play?.(), on && play !== undefined);
  useCommand('editing.delete', (e) => !inDrawer(e.target) && remove?.(), on && remove !== undefined);
  useCommand('editing.mute', () => mute?.(), on && mute !== undefined);
  useCommand('editing.fx', () => fx?.(), on && fx !== undefined);
  useCommand('editing.hide-others', () => hideOthers?.(), on && hideOthers !== undefined);
  useCommand('editing.strip', () => strip?.(), on && strip !== undefined);
  useCommand(
    'editing.keep',
    () => {
      const it = state.cursor ? doc.items[doc.index.get(state.cursor) ?? -1] : undefined;
      if (it && flagged(doc).some((x) => x.key === it.key)) focusFlag(doc, dispatch, it);
      else keep?.();
    },
    on,
  );
  useCommand(
    'editing.escape',
    (e) => {
      if (state.flag || state.sel) dispatch({ type: 'clear' });
      else if (e.target instanceof HTMLElement && e.target !== document.body) e.target.blur();
    },
    on,
  );

  // Modified keys reach the handler whatever has focus, so a field or widget keeps its own.
  const unowned = (fn: () => void) => (e: { target: Target }) => {
    if (!ownsKey(e.target)) fn();
  };
  useCommand(
    'editing.word.extend.prev',
    unowned(() => extend(-1)),
    on,
  );
  useCommand(
    'editing.word.extend.next',
    unowned(() => extend(1)),
    on,
  );
  useCommand(
    'editing.phrase.prev',
    unowned(() => phrase(-1)),
    on,
  );
  useCommand(
    'editing.phrase.next',
    unowned(() => phrase(1)),
    on,
  );
  useCommand('editing.takes.next', () => takes?.(1), on && takes !== undefined);
  useCommand(
    'editing.takes.prev',
    unowned(() => takes?.(-1)),
    on && takes !== undefined,
  );
  useCommand('editing.drawer', () => drawer?.(), on && drawer !== undefined);
  useCommand('editing.chapter.next', () => chapterStep?.(1), on && chapterStep !== undefined);
  useCommand('editing.chapter.prev', () => chapterStep?.(-1), on && chapterStep !== undefined);
  useCommand('editing.menu', () => state.cursor && openWordMenu(state.cursor), on);

  // The jump menu lists the page commands with their first key while the page is mounted; a provided command carries no key of its own.
  const provider = useMemo(
    () => (): ProvidedCommand[] => {
      const keyOf = (id: CommandId): string | undefined => {
        const first = keymap[id]?.[0];
        return first ? gestureKeys(first).join('+') : undefined;
      };
      const entry = (id: CommandId, label: string, run: () => void): ProvidedCommand => ({ id: `${id}.menu`, group: 'Editing', label, hint: keyOf(id), run });
      const out: ProvidedCommand[] = [];
      if (!on) return out;
      if (chapterStep) {
        out.push(
          entry('editing.chapter.next', 'Next chapter', () => chapterStep(1)),
          entry('editing.chapter.prev', 'Previous chapter', () => chapterStep(-1)),
        );
      }
      if (play) out.push(entry('workspace.play', 'Play from the cursor or the selection', play));
      if (remove) out.push(entry('editing.delete', 'Delete the selected words and audio', remove));
      if (fx) out.push(entry('editing.fx', 'Add FX to the selected words', fx));
      out.push(
        entry('workspace.flag.next', 'Next flagged word', () => flag(1)),
        entry('workspace.flag.prev', 'Previous flagged word', () => flag(-1)),
      );
      if (strip) out.push(entry('editing.strip', 'Show or hide the timeline', strip));
      if (keep) out.push(entry('editing.keep', 'Keep the take the keys are on', keep));
      if (hideOthers) out.push(entry('editing.hide-others', 'Hide or show the other takes', hideOthers));
      return out;
    },
    [on, keymap, chapterStep, play, remove, fx, strip, keep, hideOthers, flag],
  );
  useCommandProvider(provider);
}
