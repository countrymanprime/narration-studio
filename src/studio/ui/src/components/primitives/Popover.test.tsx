// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './Button';
import { Popover, POPOVER_POPUP_ATTRIBUTE, popupBottomReserve, useWindowHeight } from './Popover';

afterEach(cleanup);

function renderPopover() {
  return render(
    <Popover trigger={<Button>Microphone</Button>} label="Microphone">
      <button type="button">Refresh</button>
    </Popover>,
  );
}

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
