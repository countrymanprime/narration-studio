// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './Button';
import { Popover, POPOVER_POPUP_ATTRIBUTE, popupBottomReserve, useWindowHeight } from './Popover';
import { pageTakesFocusFromLeavingPopups } from './focusReturn';

afterEach(cleanup);

function renderPopover() {
  return render(
    <Popover trigger={<Button>Microphone</Button>} label="Microphone">
      <button type="button">Refresh</button>
    </Popover>,
  );
}

describe('Popover focus on close', () => {
  const pickInPopover = async (focusPageOnClose: () => boolean) => {
    const user = userEvent.setup();
    render(
      <>
        <main tabIndex={-1}>
          <button type="button">Header button</button>
        </main>
        <Popover trigger={<Button>Voice</Button>} label="Voice" focusPageOnClose={focusPageOnClose}>
          <button type="button">Pick</button>
        </Popover>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Voice' }));
    await user.click(await screen.findByRole('button', { name: 'Pick' }));
    await user.keyboard('{Escape}');
  };

  it('returns focus to the trigger by default', async () => {
    await pickInPopover(() => false);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Voice' })));
  });

  it('hands focus to <main> (not its first button) when focusPageOnClose answers true', async () => {
    await pickInPopover(() => true);
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('main')));
  });
});

// The exit of a popover is a transition (120 ms, --motion-fast), and Base UI gives focus back to the trigger only once it has ended. jsdom has none, so the exit is held
// here by an animation that finishes when the test says: the popup stays, leaving (`data-ending-style`), with focus still in it.
describe('Popover focus when a key hands it to the page while the popover is leaving', () => {
  const proto = Element.prototype as unknown as { getAnimations?: () => unknown[] };
  const original = proto.getAnimations;
  afterEach(() => {
    proto.getAnimations = original;
  });

  async function escapeWhileLeaving() {
    let endExit: () => void = () => {};
    const finished = new Promise<void>((resolve) => (endExit = resolve));
    proto.getAnimations = () => [{ finished }];
    const user = userEvent.setup();
    render(
      <main tabIndex={-1}>
        <Popover trigger={<Button>Options</Button>} label="Options">
          <button type="button">Pick</button>
        </Popover>
      </main>,
    );
    await user.click(screen.getByRole('button', { name: 'Options' }));
    await screen.findByRole('dialog', { name: 'Options' });
    await user.keyboard('{Escape}');
    expect(document.querySelector('[data-popover-popup][data-ending-style]')).not.toBeNull();
    return async () => {
      endExit();
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Options' })).toBeNull());
      // Base UI hands focus back in a microtask after the unmount.
      await new Promise((resolve) => setTimeout(resolve, 30));
    };
  }

  it('gives focus back to the trigger when the exit ends and no key took it', async () => {
    const endLeaving = await escapeWhileLeaving();
    await endLeaving();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Options' }));
  });

  it('a leaving popover a key took focus from hands focus to <main> when focus was inside it', async () => {
    const endLeaving = await escapeWhileLeaving();
    expect(document.querySelector('[data-popover-popup]')?.contains(document.activeElement)).toBe(true);
    pageTakesFocusFromLeavingPopups();
    await endLeaving();
    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  it('keeps a deliberate focus move after the key: the hand-back to <main> only fills an empty focus', async () => {
    const endLeaving = await escapeWhileLeaving();
    pageTakesFocusFromLeavingPopups();
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    await endLeaving();
    expect(document.activeElement).toBe(field);
  });

  it('forgets the mark when it is opened again while it is still leaving: that exit gives focus back', async () => {
    const endLeaving = await escapeWhileLeaving();
    pageTakesFocusFromLeavingPopups();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Options' }));
    await user.keyboard('{Escape}');
    await endLeaving();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Options' }));
  });

  it('gives it back as before to a popover that opens after the key, which the mark does not follow', async () => {
    const endLeaving = await escapeWhileLeaving();
    pageTakesFocusFromLeavingPopups();
    await endLeaving();
    const user = userEvent.setup();
    proto.getAnimations = original;
    await user.click(screen.getByRole('button', { name: 'Options' }));
    await screen.findByRole('dialog', { name: 'Options' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Options' })));
  });
});

describe('Popover at an anchor', () => {
  // One popover for many controls, as the Script reader keeps for its speaker chips. Its content takes focus as it mounts (`autoFocus`), which is
  // when Base UI reads "what had focus before": it then finds its own content, and falls back to the last control another popup remembered.
  function Chips() {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    return (
      <>
        <Popover trigger={<Button>Voice</Button>} label="Voice">
          <button type="button">Pick</button>
        </Popover>
        <button type="button" onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}>
          Chip
        </button>
        <Popover anchor={anchor ?? new DOMRect()} label="Who says this" open={anchor !== null} onOpenChange={(open) => !open && setAnchor(null)}>
          <input aria-label="Search" autoFocus />
        </Popover>
      </>
    );
  }

  it('gives focus back to the control that had it when it opened, not to the trigger of a popover used before', async () => {
    const user = userEvent.setup();
    render(<Chips />);
    await user.click(screen.getByRole('button', { name: 'Voice' }));
    await screen.findByRole('dialog', { name: 'Voice' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Voice' })).toBeNull());
    for (let round = 0; round < 2; round += 1) {
      const chip = screen.getByRole('button', { name: 'Chip' });
      await user.click(chip);
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search' })));
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Who says this' })).toBeNull());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(document.activeElement).toBe(chip);
    }
  });
});

describe('Popover', () => {
  it('opens on a click, with focus moved into it', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByRole('button', { name: 'Microphone' });
    await user.click(trigger);
    const popup = await screen.findByRole('dialog', { name: 'Microphone' });
    expect(popup).toBeTruthy();
    await waitFor(() => expect(popup.contains(document.activeElement)).toBe(true));
  });

  it('with focusPopup, opens with focus on the popup itself, so Enter presses nothing inside; Tab still reaches its controls', async () => {
    const user = userEvent.setup();
    let pressed = 0;
    render(
      <Popover trigger={<Button>Levels</Button>} label="Levels" focusPopup>
        <button type="button" onClick={() => (pressed += 1)}>
          Turn on in Settings
        </button>
      </Popover>,
    );
    await user.click(screen.getByRole('button', { name: 'Levels' }));
    const popup = await screen.findByRole('dialog', { name: 'Levels' });
    await waitFor(() => expect(document.activeElement).toBe(popup));
    await user.keyboard('{Enter}');
    expect(pressed).toBe(0);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Turn on in Settings' }));
  });

  it('marks its popup so a dialog can tell Escape is meant for it', async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole('button', { name: 'Microphone' }));
    const popup = await screen.findByRole('dialog', { name: 'Microphone' });
    expect(popup.hasAttribute(POPOVER_POPUP_ATTRIBUTE)).toBe(true);
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByRole('button', { name: 'Microphone' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Microphone' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Microphone' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes on a press outside', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Popover trigger={<Button>Microphone</Button>} label="Microphone">
          <button type="button">Refresh</button>
        </Popover>
        <button type="button">Elsewhere</button>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Microphone' }));
    await screen.findByRole('dialog', { name: 'Microphone' });
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Microphone' })).toBeNull());
  });

  it('renders the trigger through the given element, keeping its own type', () => {
    renderPopover();
    expect(screen.getByRole('button', { name: 'Microphone' }).tagName).toBe('BUTTON');
  });
});

describe('popupBottomReserve (issue 2809)', () => {
  it('keeps all of the bars in a window tall enough for both (the Booth at 500 and 900 px)', () => {
    expect(popupBottomReserve(210, 900)).toBe(210);
    expect(popupBottomReserve(210, 500)).toBe(210);
    expect(popupBottomReserve(210, 362)).toBe(210);
  });
  it('cuts the reserve so the popup keeps 120 px to read in when the bars would take nearly all of a short window (320x300)', () => {
    expect(popupBottomReserve(210, 300)).toBe(148);
    expect(300 - 2 * 16 - popupBottomReserve(210, 300)).toBe(120);
  });
  it('is zero with no bars, and never negative in a window smaller than the gutters and the room', () => {
    expect(popupBottomReserve(0, 300)).toBe(0);
    expect(popupBottomReserve(210, 100)).toBe(0);
    expect(popupBottomReserve(210, 0)).toBe(0);
  });
});

describe('useWindowHeight (issue 2809)', () => {
  it('follows the window as it is resized, and lets go of the listener when it unmounts', () => {
    const original = window.innerHeight;
    const set = (height: number) => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
      window.dispatchEvent(new Event('resize'));
    };
    const { result, unmount } = renderHook(() => useWindowHeight());
    expect(result.current).toBe(original);
    act(() => set(300));
    expect(result.current).toBe(300);
    act(() => set(844));
    expect(result.current).toBe(844);
    unmount();
    act(() => set(500));
    expect(result.current).toBe(844);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: original });
  });
});
