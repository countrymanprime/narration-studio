// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './Button';
import { Popover, POPOVER_POPUP_ATTRIBUTE } from './Popover';

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
