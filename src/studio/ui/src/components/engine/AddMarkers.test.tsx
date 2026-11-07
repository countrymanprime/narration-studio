// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../fixtures/daw';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { createOverlayService } from '../../overlay/overlayService';
import { createMockDawClient } from '../../ports/daw';
import { PortOverrides } from '../../ports/usePort';
import { DawFileLinkedContext } from '../connection/dawFileLinked';
import { pickup } from '../pickups/list/pickupFixtures';
import { TooltipProvider } from '../primitives/Tooltip';
import { AddMarkersButton, type AddMarkersTarget } from './AddMarkers';

afterEach(cleanup);

function setup(target: AddMarkersTarget, setupId: DawSetupId = 'reaper', props: Partial<Parameters<typeof AddMarkersButton>[0]> = {}, linked?: boolean) {
  const service = createOverlayService();
  const daw = createMockDawClient(DAW_SETUPS[setupId], { chapterIds: [], candidateIds: [], findingIds: ['f1'] });
  const addMarker = vi.spyOn(daw, 'addMarker');
  const addPickupMarkers = vi.spyOn(daw, 'addPickupMarkers');
  render(
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw }}>
        <TooltipProvider>
          <OverlayProvider service={service}>
            <DawFileLinkedContext.Provider value={linked}>
              <AddMarkersButton target={target} {...props} />
            </DawFileLinkedContext.Provider>
          </OverlayProvider>
        </TooltipProvider>
      </PortOverrides>
    </ApiProvider>,
  );
  const toasts = () => service.getSnapshot().toasts.map((t) => `${t.tone}:${t.text}`);
  return { addMarker, addPickupMarkers, toasts };
}

const button = (name: string | RegExp) => screen.findByRole('button', { name });
const isOff = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled;
const PLACED = [pickup({ id: 'a', at: 10, time: 10 }), pickup({ id: 'b', at: 20, time: 20 })];
const UNPLACED = pickup({ id: 'c', at: null, time: 30 });

describe('AddMarkersButton (#2830): one label, one gate and one source for a finding and for pickups', () => {
  it('a finding: Add marker in {DAW}, one call, the host’s sentence', async () => {
    const t = setup({ kind: 'finding', id: 'f1' });
    await userEvent.click(await button('Add marker in REAPER'));
    expect(t.addMarker).toHaveBeenCalledWith('f1');
    await waitFor(() => expect(t.toasts().some((x) => /^info:/.test(x))).toBe(true));
  });

  it('follows the engine: Audacity says Add marker in Audacity', async () => {
    setup({ kind: 'finding', id: 'f1' }, 'audacity');
    expect(await button('Add marker in Audacity')).toBeTruthy();
  });

  it('pickups: Add N as markers names how many have a place, and sends only those', async () => {
    const t = setup({ kind: 'pickups', pickups: [...PLACED, UNPLACED] });
    await userEvent.click(await button('Add 2 as markers in REAPER'));
    expect(t.addPickupMarkers).toHaveBeenCalledTimes(1);
    expect(t.addPickupMarkers.mock.calls[0][0].map((item) => item.ref)).toEqual(['a', 'b']);
    await waitFor(() =>
      expect(
        t.toasts().some((x) => x.includes('Pickup markers for 2 of 3 lines are in REAPER. 1 line has no place in the recording yet and was left out.')),
      ).toBe(true),
    );
  });

  it('pickups: all placed says so once, and a repeat says they were already there', async () => {
    const t = setup({ kind: 'pickups', pickups: PLACED });
    await userEvent.click(await button('Add 2 as markers in REAPER'));
    await waitFor(() => expect(t.toasts()).toContain('info:Pickup markers for 2 lines are in REAPER.'));
  });

  it('pickups: none placed is off, with the reason, and asks the DAW nothing', async () => {
    const t = setup({ kind: 'pickups', pickups: [UNPLACED] });
    const b = await button('Add 0 as markers in REAPER');
    expect(isOff(b)).toBe(true);
    await userEvent.click(b);
    expect(t.addPickupMarkers).not.toHaveBeenCalled();
    await userEvent.hover(b);
    expect(await screen.findByText('None of these lines has a place in the recording yet.')).toBeTruthy();
  });

  it('a DAW that cannot add markers is off with its own sentence, the same on both targets', async () => {
    const message = DAW_SETUPS['reaper-off'].capabilities.markers?.message;
    expect(message).toBeTruthy();
    setup({ kind: 'finding', id: 'f1' }, 'reaper-off');
    const b = await button(/^Add marker in /);
    expect(isOff(b)).toBe(true);
    await userEvent.hover(b);
    expect(await screen.findByText(message!)).toBeTruthy();
  });

  it('a caller’s own gate (the project file is not linked) wins over the capability', async () => {
    const t = setup({ kind: 'pickups', pickups: PLACED }, 'reaper', {
      gate: { available: false, message: 'Link a REAPER project (.rpp) file to add markers.' },
    });
    const b = await button('Add 2 as markers in REAPER');
    expect(isOff(b)).toBe(true);
    await userEvent.click(b);
    expect(t.addPickupMarkers).not.toHaveBeenCalled();
    await userEvent.hover(b);
    expect(await screen.findByText('Link a REAPER project (.rpp) file to add markers.')).toBeTruthy();
  });

  it('a refusal is an error toast in the host’s words', async () => {
    const t = setup({ kind: 'finding', id: 'f1' });
    t.addMarker.mockResolvedValue({
      ok: false,
      changed: false,
      message: 'REAPER has another project open.',
      undoSteps: 0,
      refused: 'REAPER has another project open.',
    });
    await userEvent.click(await button('Add marker in REAPER'));
    await waitFor(() => expect(t.toasts()).toContain('error:REAPER has another project open.'));
  });

  it('a marker that is already there says where, and adds nothing twice', async () => {
    const t = setup({ kind: 'finding', id: 'f1', at: 221 });
    t.addMarker.mockResolvedValue({ ok: true, changed: false, message: '', undoSteps: 0 });
    await userEvent.click(await button('Add marker in REAPER'));
    await waitFor(() => expect(t.toasts()).toContain('info:A marker is already at 3:41.'));
  });

  it('a host that throws says the DAW was not asked', async () => {
    const t = setup({ kind: 'finding', id: 'f1' });
    t.addMarker.mockRejectedValue(new Error('boom'));
    await userEvent.click(await button('Add marker in REAPER'));
    await waitFor(() => expect(t.toasts().some((x) => /^error:The DAW was not asked: /.test(x))).toBe(true));
  });

  it('a second press while the first is out makes no second call', async () => {
    const t = setup({ kind: 'finding', id: 'f1' });
    let answer: (value: never) => void = () => {};
    t.addMarker.mockReturnValue(new Promise((resolve) => (answer = resolve as never)));
    const b = await button('Add marker in REAPER');
    await userEvent.click(b);
    await userEvent.click(b);
    expect(t.addMarker).toHaveBeenCalledTimes(1);
    await act(async () => answer({ ok: true, changed: true, message: 'Marker added.', undoSteps: 1 } as never));
  });

  it('onResult takes the sentence in place of a toast (Proof’s status line)', async () => {
    const onResult = vi.fn();
    const t = setup({ kind: 'finding', id: 'f1' }, 'reaper', { onResult });
    await userEvent.click(await button('Add marker in REAPER'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ failed: false })));
    expect(t.toasts()).toEqual([]);
  });

  it('a caller can switch it off with its own reason', async () => {
    setup({ kind: 'finding', id: 'f1' }, 'reaper', { disabled: true, reason: 'This note has no time in its audio to put a marker at.' });
    expect(isOff(await button('Add marker in REAPER'))).toBe(true);
  });

  // #2830, #1939: "the project file is not linked" is the component's own answer, so a note on Proof, a flag on Editing and Pickups say the same.
  it('REAPER with no project file linked is off, saying so, on a finding and on pickups alike', async () => {
    for (const target of [{ kind: 'finding', id: 'f1' } as const, { kind: 'pickups', pickups: PLACED } as const]) {
      cleanup();
      const t = setup(target, 'reaper', {}, false);
      const b = await button(/^Add (marker|\d+ as markers) in REAPER$/);
      await waitFor(() => expect(isOff(b)).toBe(true));
      await userEvent.click(b);
      expect(t.addMarker).not.toHaveBeenCalled();
      expect(t.addPickupMarkers).not.toHaveBeenCalled();
      await userEvent.hover(b);
      expect(await screen.findByText('Link a REAPER project (.rpp) file to add markers.')).toBeTruthy();
    }
  });

  it('a linked project, or one not known to be unlinked, leaves the button on', async () => {
    setup({ kind: 'finding', id: 'f1' }, 'reaper', {}, true);
    const b = await button('Add marker in REAPER');
    await waitFor(() => expect(isOff(b)).toBe(false));
  });

  // qa-breaker (#2830): the same rules as Show in (#2826): a press belongs to its target, a silent DAW times out, a late answer after leaving is dropped.
  it('B1: a press in flight does not leak onto the next target the same button is aimed at', async () => {
    const service = createOverlayService();
    const daw = createMockDawClient(DAW_SETUPS.reaper, { chapterIds: [], candidateIds: [], findingIds: ['f1', 'f2'] });
    const addMarker = vi.spyOn(daw, 'addMarker');
    let answer: (v: never) => void = () => {};
    addMarker.mockReturnValueOnce(new Promise((resolve) => (answer = resolve as never)));
    const onResult = vi.fn();
    const ui = (id: string) => (
      <ApiProvider api={createMockApi()}>
        <PortOverrides clients={{ daw }}>
          <TooltipProvider>
            <OverlayProvider service={service}>
              <AddMarkersButton target={{ kind: 'finding', id }} onResult={onResult} />
            </OverlayProvider>
          </TooltipProvider>
        </PortOverrides>
      </ApiProvider>
    );
    const { rerender } = render(ui('f1'));
    await userEvent.click(await button('Add marker in REAPER'));
    rerender(ui('f2'));
    const b = await button('Add marker in REAPER');
    expect(b.getAttribute('aria-busy')).not.toBe('true');
    await userEvent.click(b);
    await waitFor(() => expect(addMarker).toHaveBeenCalledWith('f2'));
    onResult.mockClear();
    await act(async () => answer({ ok: true, changed: true, message: 'Marker added for f1.', undoSteps: 1 } as never));
    expect(onResult).not.toHaveBeenCalled();
  });

  it('B4: a DAW that never answers gives up with a sentence, and the button is free again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const t = setup({ kind: 'finding', id: 'f1' });
      t.addMarker.mockReturnValue(new Promise(() => {}));
      await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(await button('Add marker in REAPER'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20000);
      });
      expect(t.toasts().some((x) => /^error:.*did not answer/.test(x))).toBe(true);
      expect((await button('Add marker in REAPER')).getAttribute('aria-busy')).not.toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('B6: an answer that comes after the button is gone says nothing and runs no onDone', async () => {
    const onDone = vi.fn();
    const t = setup({ kind: 'finding', id: 'f1' }, 'reaper', { onDone });
    let answer: (v: never) => void = () => {};
    t.addMarker.mockReturnValue(new Promise((resolve) => (answer = resolve as never)));
    await userEvent.click(await button('Add marker in REAPER'));
    cleanup();
    await act(async () => answer({ ok: true, changed: true, message: 'Marker added.', undoSteps: 1 } as never));
    expect(onDone).not.toHaveBeenCalled();
  });
});
