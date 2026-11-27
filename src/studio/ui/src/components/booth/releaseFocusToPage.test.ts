// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { pageTookFocusFrom } from '../primitives/focusReturn';
import { claimFocusForPage, releaseFocusToPage } from './releaseFocusToPage';

afterEach(() => {
  document.body.innerHTML = '';
});

const page = (html: string) => {
  document.body.innerHTML = `<main>${html}</main>`;
  return (id: string) => document.getElementById(id) as HTMLElement;
};

describe('releaseFocusToPage', () => {
  it('moves focus from a control a press activates to the page, and leaves a field its focus', () => {
    const el = page('<button id="b">Record options</button><input id="i" />');
    el('b').focus();
    releaseFocusToPage();
    expect(document.activeElement).toBe(document.querySelector('main'));
    el('i').focus();
    releaseFocusToPage();
    expect(document.activeElement).toBe(el('i'));
  });

  it('claimFocusForPage tells a popover that is still leaving the page has focus, so it does not give focus back after the key', () => {
    const el = page(
      '<div id="leaving" data-popover-popup="" data-ending-style=""><button id="inside">Pick</button></div><div id="open" data-popover-popup="" data-open=""></div>',
    );
    el('inside').focus();
    claimFocusForPage();
    expect(pageTookFocusFrom(el('leaving'))).toBe(true);
    expect(pageTookFocusFrom(el('open'))).toBe(false);
  });

  it('releaseFocusToPage alone marks nothing: a key the Booth refuses leaves the popover its hand-back', () => {
    const el = page('<div id="leaving" data-popover-popup="" data-ending-style=""><button id="inside">Pick</button></div>');
    el('inside').focus();
    releaseFocusToPage();
    expect(pageTookFocusFrom(el('leaving'))).toBe(false);
  });
});
