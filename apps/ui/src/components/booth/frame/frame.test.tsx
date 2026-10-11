// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { defaultKeymap } from '../../../input/keymap';
import type { NarrationApi, TeleprompterEvent } from '../../../types';
import { BoothFooter } from './BoothFooter';
import { BoothTop } from './BoothTop';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Over = Partial<NarrationApi>;

function api(over: Over = {}) {
  let emit: (event: TeleprompterEvent) => void = () => {};
  const unsubscribe = vi.fn();
  const subscribeTeleprompterEvent = vi.fn((cb: (event: TeleprompterEvent) => void) => {
    emit = cb;
    return unsubscribe;
  });
  const teleprompterMeterStart = vi.fn(async () => {});
  const teleprompterMeterStop = vi.fn(async () => {});
  const recorderDevices = vi.fn(async () => ({ devices: [{ name: 'USB Mic' }, { name: 'Line In' }], error: null }));
  const value = createMockApi({ subscribeTeleprompterEvent, teleprompterMeterStart, teleprompterMeterStop, recorderDevices, ...over } as Over);
  return {
    value,
    subscribeTeleprompterEvent,
    unsubscribe,
    teleprompterMeterStart,
    teleprompterMeterStop,
    recorderDevices,
    emit: (e: TeleprompterEvent) => act(() => emit(e)),
  };
}

const mic = { engine: 'builtin' as const, dawName: 'REAPER', reachable: true, device: 'USB Mic', onDevice: vi.fn() };

function footer(a: ReturnType<typeof api>, over: Partial<Parameters<typeof BoothFooter>[0]> = {}) {
  return render(
    <ApiProvider api={a.value}>
      <BoothFooter record={<button>Record</button>} seconds={0} recording={false} mic={mic} roomTone="Room tone −58 dBFS" keymap={defaultKeymap()} {...over} />
    </ApiProvider>,
  );
}

function top(over: Partial<Parameters<typeof BoothTop>[0]> = {}) {
  return render(<BoothTop progress="¶ 1 of 2 · 0% · ~1:00 finished left" recording={false} panelOpen={false} onTogglePanel={() => {}} {...over} />);
}

describe('rec-shows-only-while-recording', () => {
  it('has no Ready chip, and REC only while recording', () => {
    const { rerender } = top();
    expect(screen.queryByText(/ready/i)).toBeNull();
    expect(screen.queryByText('REC')).toBeNull();
    rerender(<BoothTop progress="" recording panelOpen={false} onTogglePanel={() => {}} />);
    const pill = screen.getByText('REC');
    expect(pill.style.background).toBe('var(--rec-fill)');
    expect(pill.style.color).toBe('var(--rec-text)');
  });
  it('says paused while a take is paused', () => {
    top({ recording: true, paused: true });
    expect(screen.getByText('REC paused')).toBeTruthy();
  });
});

describe('no-exit-button-on-top', () => {
  it('has no exit button on the top bar; Esc Exit is a reminder in the footer', () => {
    top();
    expect(screen.queryByRole('button', { name: /exit|close|leave/i })).toBeNull();
    cleanup();
    footer(api());
    const keys = screen.getByRole('note', { name: 'Keyboard shortcuts' });
    expect(keys.textContent).toContain('Exit');
    expect(keys.querySelector('button')).toBeNull();
  });
});

describe('the-resume-and-setup-slots', () => {
  it('renders the nodes it is given and nothing when they are absent', () => {
    const { container, rerender } = top();
    expect(container.querySelector('[data-slot]')).toBeNull();
    rerender(
      <BoothTop
        progress=""
        recording={false}
        panelOpen={false}
        onTogglePanel={() => {}}
        resume={<button>Resume at ¶ 4</button>}
        setup={<button>REAPER</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Resume at ¶ 4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'REAPER' })).toBeTruthy();
  });
  it('shows the progress line', () => {
    top();
    expect(screen.getByText('¶ 1 of 2 · 0% · ~1:00 finished left')).toBeTruthy();
  });
});

describe('the-side-panel-toggle-and-drawer-width', () => {
  function width(px: number) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: px <= Number(/(\d+)px/.exec(query)?.[1]),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
  }
  it('sets aria-expanded from the panel state and reports a click', async () => {
    const onTogglePanel = vi.fn();
    const { rerender } = top({ onTogglePanel });
    const toggle = screen.getByRole('button', { name: /side panel/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);
    expect(onTogglePanel).toHaveBeenCalledOnce();
    rerender(<BoothTop progress="" recording={false} panelOpen onTogglePanel={onTogglePanel} />);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
  it('is a drawer at 1280 and below and a column above', () => {
    width(1280);
    top();
    expect(screen.getByRole('button', { name: /side panel/i }).getAttribute('data-panel')).toBe('drawer');
    cleanup();
    width(1281);
    top();
    expect(screen.getByRole('button', { name: /side panel/i }).getAttribute('data-panel')).toBe('column');
  });
});

describe('levels-is-an-icon-button-with-a-tooltip', () => {
  it('opens a menu with the microphone choice and the level meter, and leaves the room tone in the footer', async () => {
    footer(api());
    expect(screen.getByText('Room tone −58 dBFS')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Levels' });
    expect(button.textContent).toBe('');
    await userEvent.click(button);
    const menu = await screen.findByRole('dialog', { name: 'Levels' });
    expect(menu.textContent).not.toContain('Room tone');
    expect(menu.querySelector('[role="meter"]')).not.toBeNull();
    expect(await screen.findByRole('combobox', { name: 'Microphone' })).toBeTruthy();
  });
});

describe('the-microphone-choice-follows-the-recorder', () => {
  it('says where the microphone is chosen when a DAW picks its own input', async () => {
    const a = api();
    footer(a, { mic: { ...mic, engine: 'daw' } });
    await userEvent.click(screen.getByRole('button', { name: 'Levels' }));
    expect(await screen.findByText('Chosen in REAPER')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(a.recorderDevices).not.toHaveBeenCalled();
  });
  it('offers the host devices with the built-in recorder and reports the choice', async () => {
    const a = api();
    const onDevice = vi.fn();
    footer(a, { mic: { ...mic, onDevice } });
    await userEvent.click(screen.getByRole('button', { name: 'Levels' }));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Microphone' }), 'Line In');
    expect(onDevice).toHaveBeenCalledWith('Line In');
  });
  it('turns the levels off with the capability sentence when the DAW is not running', async () => {
    const a = api();
    footer(a, { mic: { ...mic, engine: 'daw', reachable: false, offReason: 'REAPER is not running' } });
    await userEvent.click(screen.getByRole('button', { name: 'Levels' }));
    expect(await screen.findByText('REAPER is not running')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Levels' }).querySelector('[role="meter"]')?.getAttribute('aria-valuetext')).toBe('silent');
  });
});

describe('levels-are-read-without-a-second-capture', () => {
  it('subscribes once, holds the microphone only while the menu is open, and stops on unmount', async () => {
    const a = api();
    const { unmount } = footer(a);
    expect(a.subscribeTeleprompterEvent).toHaveBeenCalledTimes(1);
    expect(a.teleprompterMeterStart).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Levels' }));
    await waitFor(() => expect(a.teleprompterMeterStart).toHaveBeenCalledWith('USB Mic'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(a.teleprompterMeterStop).toHaveBeenCalled());
    expect(a.subscribeTeleprompterEvent).toHaveBeenCalledTimes(1);
    unmount();
    expect(a.unsubscribe).toHaveBeenCalled();
  });
  it('starts no second capture while a take runs, and reads the take’s own levels', async () => {
    const a = api();
    footer(a, { recording: true });
    await userEvent.click(screen.getByRole('button', { name: 'Levels' }));
    a.emit({ type: 'level', peak: -12, rms: -20 } as TeleprompterEvent);
    expect(a.teleprompterMeterStart).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getAllByRole('meter')[0].getAttribute('aria-valuenow')).toBe('-20'));
  });
});

describe('the-footer-hints-come-from-the-catalogue', () => {
  it('draws the catalogue hints with the right-click extra, and the timer', () => {
    footer(api(), { seconds: 402 });
    const keys = screen.getByRole('note', { name: 'Keyboard shortcuts' });
    for (const label of ['Record / stop', 'Punch and roll from here', 'Start from here', 'Phrase', 'Word', 'Full screen', 'Exit'])
      expect(keys.textContent).toContain(label);
    expect(keys.textContent).not.toContain('Next pickup');
    expect(document.getElementById('btimer')?.textContent).toBe('06:42');
  });
  it('adds Next pickup in a pickup session', () => {
    footer(api(), { pickupSession: true });
    expect(screen.getByRole('note', { name: 'Keyboard shortcuts' }).textContent).toContain('Next pickup');
  });
});
