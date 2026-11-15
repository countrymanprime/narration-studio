// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { HINT_POPUP_ATTRIBUTE, hintOwnsEscape, rememberHintHost } from './hintLayer';

afterEach(() => {
  document.body.innerHTML = '';
});

function hint(host: Element | null): HTMLElement {
  const popup = document.createElement('div');
  popup.setAttribute(HINT_POPUP_ATTRIBUTE, '');
  document.body.append(popup);
  rememberHintHost(popup, host);
  return popup;
}

// #3500: whose Escape a showing hint is. A hint left over from the control that opened a dialog (behind it, lingering for its exit animation) is not the dialog's to answer.
describe('hintOwnsEscape', () => {
  const dialog = document.createElement('div');
  const inside = document.createElement('button');
  const outside = document.createElement('button');
  dialog.append(inside);
  document.body.append(dialog, outside);

  it('is false with no hint showing', () => {
    expect(hintOwnsEscape(dialog)).toBe(false);
  });

  it('is true for a hint on a control inside the dialog', () => {
    document.body.append(dialog, outside);
    hint(inside);
    expect(hintOwnsEscape(dialog)).toBe(true);
  });

  it('is false for a hint left on the control that opened the dialog, behind it', () => {
    document.body.append(dialog, outside);
    hint(outside);
    expect(hintOwnsEscape(dialog)).toBe(false);
  });

  it('is true for a hint with no known owner, the safe default', () => {
    document.body.append(dialog, outside);
    hint(null);
    expect(hintOwnsEscape(dialog)).toBe(true);
  });

  it('is true when any one of several hints is on something inside', () => {
    document.body.append(dialog, outside);
    hint(outside);
    hint(inside);
    expect(hintOwnsEscape(dialog)).toBe(true);
  });
});
