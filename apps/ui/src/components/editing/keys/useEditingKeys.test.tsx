// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_CATALOG } from '../../../input/commands.catalog';
import { providedCommands } from '../../../input/commandProviders';
import { gesture, type ModifierKey } from '../../../input/gestures';
import type { GestureEvent, InputSource } from '../../../input/InputSource';
import { defaultKeymap, type Keymap } from '../../../input/keymap';
import { CommandRouter, CommandScope } from '../../../input/router';
import { flagged, stepFlag, stepKey, stepPhrase, type ChapterDoc } from '../model';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import type { PageState } from '../script/scriptState';
import { useEditingKeys, type EditingKeyHandlers } from './useEditingKeys';

afterEach(cleanup);

const keymap = defaultKeymap(COMMAND_CATALOG, false);
const emptyDoc = (): ChapterDoc => ({ ...marksDoc(), items: [], index: new Map(), paras: [] });

let page: ReturnType<typeof useEditingPage>;
let emit: (code: string, modifiers?: ModifierKey[], target?: EventTarget | null) => boolean;

function Keys({ handlers, map = keymap }: { handlers?: EditingKeyHandlers; map?: Keymap }) {
  page = useEditingPage();
  useEditingKeys({ handlers, keymap: map });
  return null;
}

function mount(doc: ChapterDoc, handlers?: EditingKeyHandlers, wrap: (c: ReactNode) => ReactNode = (c) => c) {
  let listener: ((e: GestureEvent) => void) | undefined;
  const source: InputSource = {
    subscribe(on) {
      listener = on;
      return () => {
        listener = undefined;
      };
    },
  };
  emit = (code, modifiers = [], target = null) => {
    let consumed = false;
    act(() => listener?.({ gesture: gesture('keyboard', code, modifiers), target, preventDefault: () => void (consumed = true) }));
    return consumed;
  };
  return render(
    <CommandRouter source={source} keymap={keymap}>
      <CommandScope kind="page">
        <EditingPageProvider doc={doc}>{wrap(<Keys handlers={handlers} />)}</EditingPageProvider>
      </CommandScope>
    </CommandRouter>,
  );
}
const state = (): PageState => page.state;
const place = (key: string) => act(() => page.dispatch({ type: 'place', key }));

describe('left-right-move-a-word-shift-extends', () => {
  it('moves the cursor a word, and the first press with no cursor lands on the first word', () => {
    const doc = marksDoc();
    mount(doc);
    emit('ArrowRight');
    expect(state().cursor).toBe(doc.items[0].key);
    emit('ArrowRight');
    expect(state().cursor).toBe(doc.items[1].key);
    emit('ArrowLeft');
    expect(state().cursor).toBe(doc.items[0].key);
  });

  it('Shift extends by one more each press and one fewer going back, and never leaves the text', () => {
    const doc = marksDoc();
    mount(doc);
    place(doc.items[2].key);
    emit('ArrowRight', ['Shift']);
    emit('ArrowRight', ['Shift']);
    expect(state().sel).toEqual({ anchor: doc.items[2].key, head: doc.items[4].key });
    emit('ArrowLeft', ['Shift']);
    expect(state().sel).toEqual({ anchor: doc.items[2].key, head: doc.items[3].key });
    place(doc.items[0].key);
    emit('ArrowLeft', ['Shift']);
    expect(state().sel).toEqual({ anchor: doc.items[0].key, head: doc.items[0].key });
    place(doc.items[doc.items.length - 1].key);
    emit('ArrowRight', ['Shift']);
    expect(state().sel?.head).toBe(doc.items[doc.items.length - 1].key);
  });
});

describe('ctrl-and-up-down-move-by-phrase', () => {
  it('Ctrl+Left/Right and Up/Down step a phrase of the document', () => {
    const doc = marksDoc();
    mount(doc);
    place(doc.items[1].key);
    const next = stepPhrase(doc, doc.items[1].key, 1)!;
    emit('ArrowRight', ['Ctrl']);
    expect(state().cursor).toBe(next);
    emit('ArrowLeft', ['Ctrl']);
    expect(state().cursor).toBe(stepPhrase(doc, next, -1));
    place(doc.items[1].key);
    emit('ArrowDown');
    expect(state().cursor).toBe(next);
    emit('ArrowUp');
    expect(state().cursor).toBe(stepPhrase(doc, next, -1));
  });
});

describe('brackets-step-flags-enter-opens-the-card', () => {
  it('[ and ] step flagged words and open the card of the one landed on', () => {
    const doc = marksDoc();
    expect(flagged(doc).length).toBeGreaterThan(1);
    mount(doc);
    emit('BracketRight');
    const first = stepFlag(doc, null, 1)!;
    expect(state().cursor ?? state().sel?.head).toBeTruthy();
    expect(state().flag).not.toBeNull();
    expect(doc.items[doc.index.get(first)!].st).toBeDefined();
    const a = state().flag;
    emit('BracketRight');
    expect(state().flag).not.toBe(a);
    emit('BracketLeft');
    expect(state().flag).toBe(a);
  });

  it('Enter on a flagged word opens its card; on another word it asks the page to keep the take', () => {
    const doc = marksDoc();
    const keep = vi.fn();
    mount(doc, { keep });
    const flaggedItem = flagged(doc).find((i) => i.st !== 'extra')!;
    const plain = doc.items.find((i) => !flagged(doc).includes(i))!;
    place(plain.key);
    emit('Enter');
    expect(keep).toHaveBeenCalledTimes(1);
    expect(state().flag).toBeNull();
    place(flaggedItem.key);
    emit('Enter');
    expect(state().flag).toBe(flaggedItem.key);
    expect(keep).toHaveBeenCalledTimes(1);
  });

  it('Escape closes the card, then clears the selection, then blurs', () => {
    const doc = marksDoc();
    mount(doc);
    act(() => {
      page.dispatch({ type: 'select', anchor: doc.items[0].key, head: doc.items[2].key });
      page.dispatch({ type: 'openFlag', key: doc.items[1].key });
    });
    emit('Escape');
    expect(state().flag).toBeNull();
    expect(state().sel).not.toBeNull();
    emit('Escape');
    expect(state().sel).toBeNull();
    const el = document.createElement('div');
    el.tabIndex = 0;
    document.body.append(el);
    el.focus();
    emit('Escape', [], el);
    expect(document.activeElement).toBe(document.body);
    el.remove();
  });
});

describe('a-control-that-owns-the-key-keeps-it', () => {
  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    ['slider', () => Object.assign(document.createElement('div'), { role: 'slider' })],
    ['tab', () => Object.assign(document.createElement('div'), { role: 'tab' })],
    ['combobox', () => Object.assign(document.createElement('div'), { role: 'combobox' })],
    ['menuitem', () => Object.assign(document.createElement('div'), { role: 'menuitem' })],
  ])('a %s keeps the arrows, the modified arrows and Shift+T', (_name, make) => {
    const doc = marksDoc();
    const takes = vi.fn();
    mount(doc, { takes });
    const el = make();
    el.setAttribute('role', (el as HTMLElement & { role?: string }).role ?? el.getAttribute('role') ?? '');
    if (!el.getAttribute('role')) el.removeAttribute('role');
    document.body.append(el);
    emit('ArrowRight', ['Shift'], el);
    emit('ArrowRight', ['Ctrl'], el);
    emit('KeyT', ['Shift'], el);
    expect(state().cursor).toBeNull();
    expect(state().sel).toBeNull();
    expect(takes).not.toHaveBeenCalled();
    el.remove();
  });

  it('a field or a button keeps the plain keys (the router) and the drawer keeps Delete', () => {
    const doc = marksDoc();
    const remove = vi.fn();
    const play = vi.fn();
    mount(doc, { remove, play });
    const input = document.createElement('input');
    const button = document.createElement('button');
    const drawer = document.createElement('div');
    drawer.id = 'drawer';
    const row = document.createElement('div');
    drawer.append(row);
    document.body.append(input, button, drawer);
    emit('ArrowRight', [], input);
    emit('Space', [], button);
    emit('Enter', [], button);
    emit('Delete', [], row);
    expect(state().cursor).toBeNull();
    expect(play).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    input.remove();
    button.remove();
    drawer.remove();
  });
});

describe('keys-do-nothing-without-a-manuscript-or-in-a-dialog', () => {
  it('with no text no key is taken', () => {
    const remove = vi.fn();
    mount(emptyDoc(), { remove });
    expect(emit('ArrowRight')).toBe(false);
    expect(emit('Delete')).toBe(false);
    expect(emit('BracketRight')).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(state().cursor).toBeNull();
  });

  it('while a dialog is open the page scope is inactive, so Delete never cuts', () => {
    const remove = vi.fn();
    mount(marksDoc(), { remove }, (keys) => (
      <>
        {keys}
        <CommandScope kind="dialog">
          <span />
        </CommandScope>
      </>
    ));
    expect(emit('Delete')).toBe(false);
    expect(emit('ArrowRight')).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('delete-mute-fx-takes-hide-strip-are-registered-not-implemented', () => {
  it('with no handler a key does nothing and is left to the browser', () => {
    mount(marksDoc());
    for (const [code, mods] of [
      ['Delete'],
      ['Backspace'],
      ['KeyM'],
      ['KeyF'],
      ['KeyT'],
      ['KeyT', ['Shift']],
      ['KeyH'],
      ['KeyS'],
      ['KeyC', ['Ctrl', 'Shift']],
      ['Space'],
      ['ArrowDown', ['Alt']],
    ] as [string, ModifierKey[]?][]) {
      expect(emit(code, mods ?? []), code).toBe(false);
    }
  });

  it('a supplied handler is called by its key', () => {
    const h = { play: vi.fn(), remove: vi.fn(), mute: vi.fn(), fx: vi.fn(), takes: vi.fn(), hideOthers: vi.fn(), strip: vi.fn(), drawer: vi.fn() };
    mount(marksDoc(), h);
    emit('Space');
    emit('Delete');
    emit('Backspace');
    emit('KeyM');
    emit('KeyF');
    emit('KeyT');
    emit('KeyT', ['Shift']);
    emit('KeyH');
    emit('KeyS');
    emit('KeyC', ['Ctrl', 'Shift']);
    expect(h.play).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledTimes(2);
    expect(h.mute).toHaveBeenCalledTimes(1);
    expect(h.fx).toHaveBeenCalledTimes(1);
    expect(h.takes.mock.calls).toEqual([[1], [-1]]);
    expect(h.hideOthers).toHaveBeenCalledTimes(1);
    expect(h.strip).toHaveBeenCalledTimes(1);
    expect(h.drawer).toHaveBeenCalledTimes(1);
  });
});

describe('chapter-step-and-jump-menu', () => {
  it('Alt+Down and Alt+Up call the chapter step the page supplies', () => {
    const chapterStep = vi.fn();
    mount(marksDoc(), { chapterStep });
    emit('ArrowDown', ['Alt']);
    emit('ArrowUp', ['Alt']);
    expect(chapterStep.mock.calls).toEqual([[1], [-1]]);
  });

  it('while mounted the jump menu lists the page commands with their keys; unmounted it lists none', () => {
    const chapterStep = vi.fn();
    const { unmount } = mount(marksDoc(), { chapterStep, play: vi.fn() });
    const listed = providedCommands(COMMAND_CATALOG);
    const byLabel = Object.fromEntries(listed.map((c) => [c.label, c]));
    expect(byLabel['Next chapter'].hint).toBe('Alt+↓');
    expect(byLabel['Previous chapter'].hint).toBe('Alt+↑');
    expect(byLabel['Play from the cursor or the selection'].hint).toBe('Space');
    expect(byLabel['Next flagged word'].hint).toBe(']');
    expect(listed.every((c) => c.group === 'Editing')).toBe(true);
    act(() => byLabel['Next chapter'].run());
    expect(chapterStep).toHaveBeenCalledWith(1);
    unmount();
    expect(providedCommands(COMMAND_CATALOG)).toEqual([]);
  });
});

describe('shift-f10-opens-the-word-menu', () => {
  it('sends a contextmenu event from the cursor word', () => {
    const doc = marksDoc();
    const word = document.createElement('span');
    word.dataset.k = doc.items[1].key;
    document.body.append(word);
    const seen = vi.fn();
    document.addEventListener('contextmenu', seen);
    mount(doc);
    emit('F10', ['Shift']);
    expect(seen).not.toHaveBeenCalled();
    place(doc.items[1].key);
    emit('F10', ['Shift']);
    expect(seen).toHaveBeenCalledTimes(1);
    expect((seen.mock.calls[0][0] as Event).target).toBe(word);
    document.removeEventListener('contextmenu', seen);
    word.remove();
  });
});

describe('stepKey is what the word keys use', () => {
  it('a step past the end stays on the last word', () => {
    const doc = marksDoc();
    const last = doc.items[doc.items.length - 1].key;
    expect(stepKey(doc, last, 1)).toBe(last);
  });
});
