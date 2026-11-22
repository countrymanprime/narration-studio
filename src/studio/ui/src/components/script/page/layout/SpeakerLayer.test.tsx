// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GuideEntity } from '../../../../api/contracts/storyBible';
import { Button } from '../../../primitives/Button';
import { Popover } from '../../../primitives/Popover';
import { SpeakerPicker } from '../tools/speaker/SpeakerPicker';
import { speakerChoices } from '../tools/speaker/speakerChoices';
import { SpeakerLayer } from './SpeakerLayer';

const hatter = { id: 'hatter', canonical_name: 'Hatter', aliases: [], category: 'Character' } as unknown as GuideEntity;
const choices = speakerChoices([hatter], [{ name: 'Character', colour: 'green', speaks: true }]);

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

// The page's own wiring (ScriptPage.tsx): one layer for every chip, taken away the moment the picker closes itself or the popover asks to close.
function Reader({ onChoose }: { onChoose: (entryId: string) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <Popover trigger={<Button>Text settings</Button>} label="Text settings">
        <button type="button">Larger</button>
      </Popover>
      <p>Alice was beginning to get very tired.</p>
      <button type="button" onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}>
        Hatter chip
      </button>
      {anchor && (
        <SpeakerLayer anchor={anchor} onClose={() => setAnchor(null)}>
          <SpeakerPicker
            phrase={{ speaker: hatter, state: 'suggested' }}
            inChapter={choices}
            everyone={choices}
            onChoose={(entryId) => {
              onChoose(entryId);
              setAnchor(null);
            }}
            onClose={() => setAnchor(null)}
          />
        </SpeakerLayer>
      )}
    </>
  );
}

// Focus went to "Open navigation" in a narrow window (#3823): with no trigger of its own, the popover handed focus to the last control another
// popup had remembered (there, the button of the navigation drawer the narrator came through). Here the text settings popover is that other popup.
describe('SpeakerLayer focus', () => {
  const openPicker = async (onChoose: (entryId: string) => void = () => {}) => {
    const user = userEvent.setup();
    render(<Reader onChoose={onChoose} />);
    await user.click(screen.getByRole('button', { name: 'Text settings' }));
    await screen.findByRole('dialog', { name: 'Text settings' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Text settings' })).toBeNull());
    const chip = screen.getByRole('button', { name: 'Hatter chip' });
    await user.click(chip);
    const search = await screen.findByRole('combobox', { name: 'Search speakers' });
    await waitFor(() => expect(document.activeElement).toBe(search));
    return { user, chip };
  };
  const closedWithFocusOn = async (element: HTMLElement) => {
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Who says this' })).toBeNull());
    // The popover hands focus back a tick after it goes; a hand-back to the wrong control would land in that tick too.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(element);
  };

  it('gives focus back to the chip when Escape closes the picker', async () => {
    const { user, chip } = await openPicker();
    await user.keyboard('{Escape}');
    await closedWithFocusOn(chip);
  });

  it('gives focus back to the chip when a speaker is chosen', async () => {
    const chosen: string[] = [];
    const { user, chip } = await openPicker((entryId) => chosen.push(entryId));
    await user.keyboard('{Enter}');
    await closedWithFocusOn(chip);
    expect(chosen).toEqual(['hatter']);
  });

  it('closes on a press elsewhere and leaves focus where the press put it', async () => {
    const { user } = await openPicker();
    await user.click(screen.getByText('Alice was beginning to get very tired.'));
    await closedWithFocusOn(document.body);
  });
});
