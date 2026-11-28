// @vitest-environment jsdom
// Ctrl+Alt+Space (booth.mode.switch) claims the page's focus (`claimFocusForPage`, which marks popups still leaving) only when it acts: every refusal
// leaves the popup's own hand-back alone, so a mutant that claims before a refusal is caught by exactly the refusal it moved past (#4125).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi, TeleprompterState } from '../../../types';
import { pageTookFocusFrom } from '../../primitives/focusReturn';
import { forgetAppTake, skipStartGuard } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-test-leaving], [data-test-layer]').forEach((node) => node.remove());
  vi.clearAllMocks();
  window.localStorage.clear();
});

function renderPage(api: Partial<NarrationApi> = {}) {
  const daw = dawFor('reaper');
  const recordStart = vi.spyOn(daw, 'recordStart');
  render(
    <BoothHost
      api={pageApi({ passageMapRecordRun: async () => {}, teleprompterStop: async () => {}, ...api } as Partial<NarrationApi>)}
      daw={daw}
      journal={newJournal()}
      overlay={createOverlayService()}
    >
      <BoothNextPage hasManuscript navigate={vi.fn()} />
    </BoothHost>,
  );
  return { recordStart };
}

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
const ready = async () => {
  await screen.findByText('Nobody', { exact: false });
  await waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
};
const main = () => document.getElementById('brec') as HTMLButtonElement;
const press = async () => {
  skipStartGuard();
  await act(async () => void fireEvent.click(main()));
  await settle();
};
const chooseCold = async () => {
  await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Record options' })));
  const group = await screen.findByRole('radiogroup', { name: 'Main button' });
  await act(async () => void fireEvent.click(within(group).getByRole('radio', { name: 'Cold read' })));
  await act(async () => void fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' }));
  await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Main button' })).toBeNull());
};

/** A popup that is still leaving, as a key finds one: the mark is read off this element. */
function leavingPopup(): HTMLElement {
  const popup = document.createElement('div');
  popup.setAttribute('role', 'menu');
  popup.setAttribute('data-ending-style', '');
  popup.setAttribute('data-test-leaving', '');
  document.body.append(popup);
  return popup;
}
const chord = async (popup: HTMLElement) => {
  skipStartGuard();
  await act(async () => void fireEvent.keyDown(document.body, { key: ' ', code: 'Space', ctrlKey: true, altKey: true }));
  await settle();
  return pageTookFocusFrom(popup);
};
/** A host whose cold read starts and reports `running`, as the real one does. */
function runningHost() {
  let state = {
    phase: 'idle',
    message: '',
    engine: null,
    chapter: null,
    paused: false,
    coldRead: false,
    script: null,
    position: null,
  } as unknown as TeleprompterState;
  const listeners = new Set<(next: TeleprompterState) => void>();
  const teleprompterStart = vi.fn(async (options: { coldRead?: boolean }) => {
    state = { ...state, phase: 'running', chapter: 'c1', engine: 'whisper', coldRead: Boolean(options.coldRead) } as TeleprompterState;
    listeners.forEach((listener) => listener(state));
    return { status: 'started' as const };
  });
  const api = {
    teleprompterStart,
    teleprompterState: async () => state,
    subscribeTeleprompterState: (listener: (next: TeleprompterState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeTeleprompterEvent: () => () => {},
  } as unknown as Partial<NarrationApi>;
  return { api, teleprompterStart };
}
const never = () => new Promise<never>(() => {});

describe('Ctrl+Alt+Space marks a leaving popup only when it switches the mode', () => {
  it('acts and marks from Record: a cold read starts', async () => {
    const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
    renderPage({ teleprompterStart } as unknown as Partial<NarrationApi>);
    await ready();
    const popup = leavingPopup();
    expect(await chord(popup)).toBe(true);
    expect(teleprompterStart).toHaveBeenCalledTimes(1);
  });

  it('refuses with a take out (takeOut) and leaves the popup unmarked', async () => {
    const { recordStart } = renderPage();
    await ready();
    await press();
    await waitFor(() => expect(recordStart).toHaveBeenCalled());
    await waitFor(() => expect(main().textContent).toMatch(/Stop/));
    expect(await chord(leavingPopup())).toBe(false);
  });

  it('refuses while a cold read runs (coldRead) and leaves the popup unmarked', async () => {
    const { api, teleprompterStart } = runningHost();
    renderPage(api);
    await ready();
    await chooseCold();
    await press();
    await screen.findByText('Mic on · cold read');
    expect(await chord(leavingPopup())).toBe(false);
    expect(teleprompterStart).toHaveBeenCalledTimes(1);
  });

  it('refuses while a cold read is starting (coldReadStarting) and leaves the popup unmarked', async () => {
    const teleprompterStart = vi.fn(never);
    renderPage({ teleprompterStart } as unknown as Partial<NarrationApi>);
    await ready();
    await chooseCold();
    await press();
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledTimes(1));
    expect(await chord(leavingPopup())).toBe(false);
    expect(teleprompterStart).toHaveBeenCalledTimes(1);
  });

  it('refuses while a take is starting (starting) and leaves the popup unmarked', async () => {
    // The speech model check comes before the DAW is asked, so the start is under way (`starting`) while no take is out yet (`takeOut` false).
    let hold = false;
    const { recordStart } = renderPage({ assetsList: async () => (hold ? never() : { assets: [] }) } as unknown as Partial<NarrationApi>);
    await ready();
    hold = true;
    await press();
    expect(recordStart).not.toHaveBeenCalled();
    expect(await chord(leavingPopup())).toBe(false);
    expect(recordStart).not.toHaveBeenCalled();
  });

  it('refuses while a popup owns the keys (keyLayerOpen) and leaves the leaving popup unmarked', async () => {
    const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
    renderPage({ teleprompterStart } as unknown as Partial<NarrationApi>);
    await ready();
    const layer = document.createElement('div');
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('data-test-layer', '');
    document.body.append(layer);
    expect(await chord(leavingPopup())).toBe(false);
    expect(teleprompterStart).not.toHaveBeenCalled();
  });
});
