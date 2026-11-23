// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isGuardedTarget, keyContextOf, keyLayerOpen, modalLayerOpen, openModalLayer, softLayerOpen, takesTypedText, watchKeyContext } from './targets';

function el(html: string): Element {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.firstElementChild!;
}

describe('isGuardedTarget', () => {
  it('is false for null or a non-Element target', () => {
    expect(isGuardedTarget(null)).toBe(false);
  });

  it('is true for an element that scrolls its own content and keeps the keys for it (a toast text that overflows)', () => {
    expect(isGuardedTarget(el('<div data-owns-keys tabindex="0">long text</div>'))).toBe(true);
  });

  it('is false for plain text-flow elements', () => {
    expect(isGuardedTarget(el('<div></div>'))).toBe(false);
    expect(isGuardedTarget(document.body)).toBe(false);
  });

  it('is true for a field', () => {
    expect(isGuardedTarget(el('<input />'))).toBe(true);
    expect(isGuardedTarget(el('<textarea></textarea>'))).toBe(true);
    expect(isGuardedTarget(el('<select></select>'))).toBe(true);
    expect(isGuardedTarget(el('<div contenteditable="true"></div>'))).toBe(true);
    expect(isGuardedTarget(el('<div contenteditable="false"></div>'))).toBe(false);
  });

  it('is true for an element Space activates', () => {
    expect(isGuardedTarget(el('<button></button>'))).toBe(true);
    expect(isGuardedTarget(el('<a href="#"></a>'))).toBe(true);
    expect(isGuardedTarget(el('<summary></summary>'))).toBe(true);
    expect(isGuardedTarget(el('<div role="button"></div>'))).toBe(true);
    expect(isGuardedTarget(el('<div role="checkbox"></div>'))).toBe(true);
    expect(isGuardedTarget(el('<div role="switch"></div>'))).toBe(true);
  });

  it('is true for a KEY_WIDGET_ROLES role', () => {
    expect(isGuardedTarget(el('<div role="tab"></div>'))).toBe(true);
    expect(isGuardedTarget(el('<div role="slider"></div>'))).toBe(true);
  });

  it("is false for a read-only textbox (the Editing script): it owns no text, so its keys are the page's", () => {
    expect(isGuardedTarget(el('<div role="textbox" aria-readonly="true" tabindex="0"></div>'))).toBe(false);
    expect(isGuardedTarget(el('<div role="textbox" aria-readonly="true"><span>word</span></div>').firstElementChild)).toBe(false);
  });

  it('is true for a textbox that can be typed in', () => {
    expect(isGuardedTarget(el('<div role="textbox" tabindex="0"></div>'))).toBe(true);
    expect(isGuardedTarget(el('<div role="textbox" aria-readonly="false"></div>'))).toBe(true);
  });

  it('is false for an unrelated role', () => {
    expect(isGuardedTarget(el('<div role="note"></div>'))).toBe(false);
  });

  it('reaches up through a nested target (closest), not just the exact element', () => {
    const wrapper = el('<button><span>label</span></button>');
    expect(isGuardedTarget(wrapper.firstElementChild)).toBe(true);
  });
});

describe('takesTypedText', () => {
  it('is true for a text input, a textarea and editable content', () => {
    expect(takesTypedText(el('<input type="text">'))).toBe(true);
    expect(takesTypedText(el('<input>'))).toBe(true);
    expect(takesTypedText(el('<input type="search">'))).toBe(true);
    expect(takesTypedText(el('<textarea></textarea>'))).toBe(true);
    expect(takesTypedText(el('<div contenteditable="true"><span>x</span></div>').firstElementChild)).toBe(true);
  });

  it('is false for a select, a slider, a checkbox, a button and a non-editable target', () => {
    for (const html of ['<select></select>', '<input type="range">', '<input type="checkbox">', '<button></button>', '<div role="menuitem"></div>'])
      expect(takesTypedText(el(html))).toBe(false);
    expect(takesTypedText(null)).toBe(false);
  });
});

describe('softLayerOpen and modalLayerOpen', () => {
  const mount = (html: string) => {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
  };

  it('a menu or a popover popup is soft, an alert dialog or a plain dialog is modal', () => {
    expect(softLayerOpen(mount('<div role="menu"></div>'))).toBe(true);
    expect(softLayerOpen(mount('<div role="dialog" data-popover-popup></div>'))).toBe(true);
    expect(modalLayerOpen(mount('<div role="dialog" data-popover-popup></div>'))).toBe(false);
    expect(modalLayerOpen(mount('<div role="alertdialog"></div>'))).toBe(true);
    expect(modalLayerOpen(mount('<div role="dialog"></div>'))).toBe(true);
    expect(softLayerOpen(mount('<div role="dialog"></div>'))).toBe(false);
  });

  it('a hidden, inert or aria-hidden popup is not open', () => {
    for (const wrap of ['<div hidden>', '<div inert>', '<div aria-hidden="true">'])
      expect(softLayerOpen(mount(`${wrap}<div role="menu"></div></div>`))).toBe(false);
  });
});

// #3906, #3931: a Base UI popup stays in the page, marked `data-ending-style`, until a frame after Escape. The key that closed it still belongs to it; a key
// pressed after it began closing belongs to the page, though focus is still on a control inside the popup.
describe('the context a keydown begins in', () => {
  const press = (target: Element): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { code: 'Numpad1', bubbles: true });
    target.dispatchEvent(event);
    return event;
  };

  it('is a layer for a key pressed while a popup is open, though the key closes it', () => {
    watchKeyContext();
    document.body.innerHTML = '<div role="dialog" data-popover-popup=""><span role="radio" id="pick" tabindex="0"></span></div>';
    const pick = document.getElementById('pick')!;
    const popup = pick.parentElement!;
    // Whatever the key's own handlers do, here closing the popup, comes after the note.
    document.addEventListener('keydown', () => popup.setAttribute('data-ending-style', ''), { once: true });
    expect(keyContextOf(press(pick))).toEqual({ layerOpen: true, targetClosing: false });
  });

  it('is no layer, and a target inside the popup is no owner of the key, once the popup has begun closing', () => {
    watchKeyContext();
    document.body.innerHTML = '<div role="dialog" data-popover-popup="" data-ending-style=""><span role="radio" id="pick" tabindex="0"></span></div>';
    expect(keyContextOf(press(document.getElementById('pick')!))).toEqual({ layerOpen: false, targetClosing: true });
  });
});

describe('the live checks and a popup that is closing', () => {
  it('count it as gone, as the key context does, so the pedal and the router agree (#3976)', () => {
    document.body.innerHTML = '<div role="dialog" data-popover-popup="" data-ending-style=""></div><div role="alertdialog" data-ending-style=""></div>';
    expect(keyLayerOpen()).toBe(false);
    expect(softLayerOpen()).toBe(false);
    expect(modalLayerOpen()).toBe(false);
  });

  it('count it while it is open', () => {
    document.body.innerHTML = '<div role="dialog" data-popover-popup=""></div><div role="alertdialog"></div>';
    expect(keyLayerOpen()).toBe(true);
    expect(softLayerOpen()).toBe(true);
    expect(modalLayerOpen()).toBe(true);
  });
});

describe('openModalLayer: the one lookup of the topmost modal layer', () => {
  beforeEach(() => document.body.replaceChildren());
  const layer = (tag: string, attrs: Record<string, string>, parent: Element = document.body) => {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    parent.append(el);
    return el;
  };
  afterEach(() => document.body.replaceChildren());

  it('finds a role dialog, an alert dialog, a native open dialog and an aria-modal layer; the last in the page is the topmost', () => {
    expect(openModalLayer()).toBeNull();
    const first = layer('div', { role: 'dialog' });
    expect(openModalLayer()).toBe(first);
    const native = layer('dialog', { open: '' });
    expect(openModalLayer()).toBe(native);
    const modal = layer('section', { 'aria-modal': 'true' });
    expect(openModalLayer()).toBe(modal);
    const alert = layer('div', { role: 'alertdialog' });
    expect(openModalLayer()).toBe(alert);
    expect(modalLayerOpen()).toBe(true);
  });

  it('a closed native dialog is not a layer', () => {
    layer('dialog', {});
    expect(openModalLayer()).toBeNull();
    expect(modalLayerOpen()).toBe(false);
  });

  it.each([
    ['hidden', { hidden: '' }],
    ['inert', { inert: '' }],
    ['aria-hidden', { 'aria-hidden': 'true' }],
    ['closing', { 'data-ending-style': '' }],
  ])('a dialog that is %s is not a layer, and the one below it is the topmost', (_name, attrs) => {
    const below = layer('div', { role: 'dialog' });
    layer('div', { role: 'dialog', ...attrs });
    expect(openModalLayer()).toBe(below);
    below.remove();
    expect(openModalLayer()).toBeNull();
    expect(modalLayerOpen()).toBe(false);
  });

  it('a layer inside a hidden or closing ancestor is gone too', () => {
    const closing = layer('div', { 'data-ending-style': '' });
    layer('div', { role: 'dialog' }, closing);
    expect(openModalLayer()).toBeNull();
  });

  it('a popover popup is not a modal, even though it is a role dialog or aria-modal', () => {
    layer('div', { role: 'dialog', 'data-popover-popup': '' });
    layer('div', { 'aria-modal': 'true', 'data-popover-popup': '' });
    expect(openModalLayer()).toBeNull();
  });

  it('a menu is not a modal', () => {
    layer('div', { role: 'menu' });
    expect(openModalLayer()).toBeNull();
  });
});

describe('keyLayerOpen agrees with the modal layer on what a dialog is', () => {
  afterEach(() => document.body.replaceChildren());
  it.each([
    ['dialog', { open: '' }],
    ['section', { 'aria-modal': 'true' }],
  ] as const)('a %s that is open owns the keys', (tag, attrs) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.append(el);
    expect(keyLayerOpen()).toBe(true);
    expect(modalLayerOpen()).toBe(true);
    el.setAttribute('data-ending-style', '');
    expect(keyLayerOpen()).toBe(false);
  });
});
