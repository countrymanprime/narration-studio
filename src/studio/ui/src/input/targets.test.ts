// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isGuardedTarget, keyContextOf, modalLayerOpen, softLayerOpen, takesTypedText, watchKeyContext } from './targets';

function el(html: string): Element {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.firstElementChild!;
}

describe('isGuardedTarget', () => {
  it('is false for null or a non-Element target', () => {
    expect(isGuardedTarget(null)).toBe(false);
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
