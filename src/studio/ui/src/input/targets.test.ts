// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  isGuardedTarget,
  isInertLeavingMenuTarget,
  keyContextOf,
  keyLayerOpen,
  modalLayerOpen,
  openModalLayer,
  softLayerOpen,
  takesTypedText,
  watchKeyContext,
} from './targets';

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

  it('the topmost modal layer is the last dialog or alert dialog on screen; a closing, hidden or popover one is skipped', () => {
    const two = mount('<div role="dialog" id="under"></div><div role="alertdialog" id="over"></div>');
    expect(openModalLayer(two)?.id).toBe('over');
    const closing = mount('<div role="dialog" id="under"></div><div role="dialog" id="over" data-ending-style></div>');
    expect(openModalLayer(closing)?.id).toBe('under');
    const popover = mount('<div role="dialog" id="under"></div><div role="dialog" id="over" data-popover-popup></div>');
    expect(openModalLayer(popover)?.id).toBe('under');
    expect(openModalLayer(mount('<div role="menu"></div>'))).toBeNull();
    // Each of the three hidden states `GONE` names: Base UI sets aria-hidden on the parent of a nested dialog.
    for (const wrap of ['<div hidden>', '<div inert>', '<div aria-hidden="true">'])
      expect(openModalLayer(mount(`${wrap}<div role="dialog"></div></div>`))).toBeNull();
    expect(openModalLayer(mount('<div role="dialog" id="under"></div><div aria-hidden="true"><div role="dialog" id="over"></div></div>'))?.id).toBe('under');
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

// The item of a menu that presses nothing because the menu has begun to close (#4183): off by `useLeaving`, inside a popup that is `data-ending-style`.
describe('isInertLeavingMenuTarget', () => {
  const inside = (popup: string, item: string) => el(`<div ${popup}>${item}</div>`).firstElementChild!;

  it.each(['menuitem', 'menuitemradio', 'menuitemcheckbox'])('is true for a %s that is aria-disabled in a popup that is closing', (role) => {
    expect(isInertLeavingMenuTarget(inside('role="menu" data-ending-style=""', `<div role="${role}" aria-disabled="true"></div>`))).toBe(true);
  });

  it('is true for a descendant of such an item (the label a press lands on)', () => {
    const item = inside('role="menu" data-ending-style=""', '<div role="menuitem" aria-disabled="true"><span>Roll again</span></div>');
    expect(isInertLeavingMenuTarget(item.querySelector('span'))).toBe(true);
  });

  it.each([
    ['an item that is not off', 'role="menu" data-ending-style=""', '<div role="menuitem" aria-disabled="false"></div>'],
    ['an item with no aria-disabled', 'role="menu" data-ending-style=""', '<div role="menuitem"></div>'],
    ['a button in a popover that is closing, aria-disabled or not', 'data-popover-popup="" data-ending-style=""', '<button aria-disabled="true"></button>'],
    ['an item that is off in a menu that is not closing', 'role="menu"', '<div role="menuitem" aria-disabled="true"></div>'],
    ['an element of another role that is aria-disabled', 'role="menu" data-ending-style=""', '<div role="option" aria-disabled="true"></div>'],
  ])('is false for %s', (_name, popup, item) => {
    expect(isInertLeavingMenuTarget(inside(popup, item))).toBe(false);
  });

  // The popup of a menu opened by the pointer holds focus itself until an arrow moves it onto a row: a key then lands on the popup.
  it('is true for the popup of a menu that is closing', () => {
    expect(isInertLeavingMenuTarget(el('<div role="menu" data-ending-style=""></div>'))).toBe(true);
  });

  it.each([
    ['the popup of a menu that is not closing', el('<div role="menu"></div>')],
    ['a text field in a popover that is closing', inside('role="dialog" data-popover-popup="" data-ending-style=""', '<input type="text" />')],
    ['a button in a popover that is closing', inside('role="dialog" data-popover-popup="" data-ending-style=""', '<button>Save</button>')],
    ['the popup of a popover that is closing', el('<div role="dialog" data-popover-popup="" data-ending-style=""></div>')],
    ['a text field in a menu that is closing', inside('role="menu" data-ending-style=""', '<input type="text" />')],
    ['a label inside a menu that is closing', inside('role="menu" data-ending-style=""', '<div role="presentation">Group</div>')],
  ])('is false for %s', (_name, target) => {
    expect(isInertLeavingMenuTarget(target)).toBe(false);
  });

  it('is false for null and for a node that is not an element', () => {
    expect(isInertLeavingMenuTarget(null)).toBe(false);
    expect(isInertLeavingMenuTarget(document)).toBe(false);
  });
});
