// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpeakerLayer } from './SpeakerLayer';

// The speaker picker opened off the bottom of the window (#3823): it was placed under the chip with no look at the room there. jsdom lays nothing
// out, so the window and the picker are given sizes here; the overlay guard (tests/visual/overlays/script.ts) proves the same in a browser.
const WINDOW = { width: 1440, height: 900 };
const PICKER = { width: 320, height: 342 };

const sizes: Array<[object, string, number]> = [
  [document.documentElement, 'clientWidth', WINDOW.width],
  [document.documentElement, 'clientHeight', WINDOW.height],
  [HTMLElement.prototype, 'offsetWidth', PICKER.width],
  [HTMLElement.prototype, 'offsetHeight', PICKER.height],
];

beforeEach(() => {
  for (const [target, name, value] of sizes) Object.defineProperty(target, name, { configurable: true, get: () => value });
});

afterEach(() => {
  cleanup();
  for (const [target, name] of sizes) Reflect.deleteProperty(target, name);
});

/** Where the picker's box was put: the nearest element that carries an inline position. */
async function placed(chip: DOMRect): Promise<{ left: number; top: number; right: number; bottom: number }> {
  render(
    <SpeakerLayer anchor={chip} onClose={() => {}}>
      <button type="button">Hatter</button>
    </SpeakerLayer>,
  );
  const picker = await screen.findByRole('dialog', { name: 'Who says this' });
  let at: { left: number; top: number } | null = null;
  await waitFor(() => {
    for (let el: HTMLElement | null = picker; el && !at; el = el.parentElement) {
      const moved = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform);
      if (moved) at = { left: Number(moved[1]), top: Number(moved[2]) };
      else if (el.style.top.endsWith('px') && el.style.left.endsWith('px')) at = { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
    }
    expect(at).not.toBeNull();
  });
  const { left, top } = at!;
  return { left, top, right: left + PICKER.width, bottom: top + PICKER.height };
}

describe('SpeakerLayer placement (#3823)', () => {
  it('opens under the chip when there is room below', async () => {
    const chip = new DOMRect(513, 134, 50, 23);
    const box = await placed(chip);
    expect(box.top).toBeGreaterThanOrEqual(chip.bottom);
    expect(box.bottom).toBeLessThanOrEqual(WINDOW.height);
  });

  it('opens above the chip when there is no room below, the owner’s chip near the bottom of the window', async () => {
    const chip = new DOMRect(513, 774, 50, 23);
    const box = await placed(chip);
    expect(box.bottom).toBeLessThanOrEqual(chip.top);
    expect(box.top).toBeGreaterThanOrEqual(0);
  });

  it('stays inside the window for a chip at the right edge or the left edge', async () => {
    const right = await placed(new DOMRect(WINDOW.width - 30, 400, 50, 23));
    expect(right.right).toBeLessThanOrEqual(WINDOW.width);
    cleanup();
    const left = await placed(new DOMRect(-20, 400, 50, 23));
    expect(left.left).toBeGreaterThanOrEqual(0);
  });
});

describe('SpeakerLayer focus', () => {
  it('gives focus back to the chip that opened it when it closes', async () => {
    const user = userEvent.setup();
    const chip = document.createElement('button');
    document.body.append(chip);
    chip.focus();
    const { unmount } = render(
      <SpeakerLayer anchor={new DOMRect(10, 10, 50, 23)} onClose={() => {}}>
        <button type="button">Hatter</button>
      </SpeakerLayer>,
    );
    const inside = await screen.findByRole('button', { name: 'Hatter' });
    await waitFor(() => expect(document.activeElement).toBe(inside));
    await user.keyboard('{Tab}');
    unmount();
    expect(document.activeElement).toBe(chip);
    chip.remove();
  });
});
