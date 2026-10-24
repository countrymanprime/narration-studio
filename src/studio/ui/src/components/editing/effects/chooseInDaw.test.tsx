// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FX_CHOSEN } from '../../../fixtures/daw';
import type { ChooseState } from '../range/fx/useChooseInDaw';
import { AddEffect, SELECT_FIRST, type AddEffectChoose } from './AddEffect';
import { CHOOSE_QUIET_MS, ChooseInDaw } from './ChooseInDaw';

// Add an effect's Choose in REAPER… (#2251) and the panel it shows while REAPER's FX window is open.

const choosing = (over: Partial<Extract<ChooseState, { phase: 'choosing' }>> = {}): Extract<ChooseState, { phase: 'choosing' }> => ({
  phase: 'choosing',
  text: 'Alice was beginning',
  choice: null,
  heardAt: null,
  problem: '',
  busy: false,
  ...over,
});

const chooseWith = (over: Partial<AddEffectChoose> = {}): AddEffectChoose => ({
  dawName: 'REAPER',
  reason: '',
  state: { phase: 'idle' },
  onChoose: vi.fn(),
  onKeep: vi.fn(),
  onCancel: vi.fn(),
  onCheck: vi.fn(),
  ...over,
});

const addEffect = (choose: AddEffectChoose | undefined, hasSelection = true) => (
  <AddEffect hasSelection={hasSelection} reason="" impact={null} cap={0.3} list={null} onAdd={() => {}} choose={choose} />
);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Choose in REAPER…', () => {
  it('sits beside Add effect, needs a selection, and opens REAPER’s window when pressed', () => {
    const choose = chooseWith();
    const view = render(addEffect(choose, false));
    const button = () => screen.getByRole('button', { name: 'Choose in REAPER…' }) as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    expect(screen.getByText(SELECT_FIRST)).toBeTruthy();
    view.rerender(addEffect(choose));
    expect(button().disabled).toBe(false);
    fireEvent.click(button());
    expect(choose.onChoose).toHaveBeenCalledTimes(1);
  });

  it('is absent for a DAW without an FX window of its own, says why it is off, and reads Opening while it opens', () => {
    const view = render(addEffect(undefined));
    expect(screen.queryByRole('button', { name: /Choose in/ })).toBeNull();
    view.rerender(addEffect(chooseWith({ reason: 'This selection spans two takes. An effect needs words from one take.' })));
    expect((screen.getByRole('button', { name: 'Choose in REAPER…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('This selection spans two takes. An effect needs words from one take.')).toBeTruthy();
    view.rerender(addEffect(chooseWith({ state: { phase: 'opening' } })));
    expect((screen.getByRole('button', { name: 'Opening REAPER…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('while choosing, the panel shows and its buttons reach the page', () => {
    const choose = chooseWith({ state: choosing({ choice: FX_CHOSEN, heardAt: Date.now() }) });
    render(addEffect(choose));
    expect(screen.getByRole('group', { name: 'Choosing in REAPER' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Choose in REAPER…' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect([choose.onKeep, choose.onCancel, choose.onCheck].map((f) => (f as ReturnType<typeof vi.fn>).mock.calls.length)).toEqual([1, 1, 1]);
  });
});

describe('the choosing panel', () => {
  const panel = (state: Extract<ChooseState, { phase: 'choosing' }>) => (
    <ChooseInDaw state={state} dawName="REAPER" onKeep={() => {}} onCancel={() => {}} onCheck={() => {}} />
  );
  const status = () => screen.getByRole('status').textContent;

  it('asks first, then says nothing is chosen, with Keep it off', () => {
    const view = render(panel(choosing()));
    expect(status()).toBe('Asking REAPER what is chosen…');
    view.rerender(panel(choosing({ heardAt: Date.now(), choice: { ...FX_CHOSEN, fx: [], label: '', chainOpen: true } })));
    expect(status()).toBe('Nothing chosen in REAPER yet.');
    expect((screen.getByRole('button', { name: 'Keep it' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('names what is chosen, lists several with a bypassed one marked, and says the window is still open', () => {
    const two = {
      ...FX_CHOSEN,
      fx: [
        { name: 'VST: ReaComp (Cockos)', enabled: true },
        { name: 'VST: ReaEQ (Cockos)', enabled: false },
      ],
      label: 'ReaComp (Cockos), ReaEQ (Cockos)',
      chainOpen: true,
    };
    render(panel(choosing({ heardAt: Date.now(), choice: two })));
    expect(status()).toBe('REAPER has ReaComp (Cockos), ReaEQ (Cockos), its window still open.');
    expect(screen.getByRole('list', { name: 'Chosen in REAPER' }).textContent).toContain('VST: ReaEQ (Cockos) (bypassed)');
  });

  it('says it cannot tell once REAPER has gone quiet, rather than showing an old answer', () => {
    vi.useFakeTimers();
    const heardAt = Date.now();
    render(panel(choosing({ heardAt, choice: FX_CHOSEN })));
    act(() => vi.advanceTimersByTime(CHOOSE_QUIET_MS + 1000));
    expect(status()).toMatch(/^Can't tell what is chosen: REAPER last answered \d+ s ago\.$/);
  });

  it('shows a problem as an alert, keeps long and right-to-left words inside, and turns its buttons off while busy', () => {
    render(panel(choosing({ problem: 'REAPER did not answer.', busy: true, text: 'שלום 👋 '.repeat(40) })));
    expect(screen.getByRole('alert').textContent).toBe('REAPER did not answer.');
    for (const name of ['Keep it', 'Cancel', 'Check again']) expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  });
});
