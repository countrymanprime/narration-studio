// @vitest-environment jsdom
// The press that answers a question hands the focus back to the box it came from; the next Enter in the same moment is its echo (#3457 B10).
import { afterEach, describe, expect, it, vi } from 'vitest';
import './App';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('an Enter right after a question was answered by key', () => {
  const press = (target: Element, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  const scene = () => {
    document.body.innerHTML = '<div role="alertdialog"><button id="keep">Keep editing</button></div><input id="alias" />';
    const reached = vi.fn();
    document.getElementById('alias')!.addEventListener('keydown', reached);
    return { keep: document.getElementById('keep')!, alias: document.getElementById('alias')!, reached };
  };

  it('does not reach the field it returns to, so a held or doubled Enter adds nothing', () => {
    const { keep, alias, reached } = scene();
    press(keep);
    const echo = press(alias, { repeat: true });
    expect(echo.defaultPrevented).toBe(true);
    expect(reached).not.toHaveBeenCalled();
  });

  it('a fresh press after the window is the field’s own', async () => {
    const { keep, alias, reached } = scene();
    press(keep);
    await new Promise((resolve) => setTimeout(resolve, 350));
    press(alias);
    expect(reached).toHaveBeenCalledTimes(1);
  });
});
