// @vitest-environment jsdom
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { DawResult } from '../../../api/contracts/daw';
import { DAW_ANSWERS, DAW_SETUPS } from '../../../fixtures/daw';
import { createMockDawClient, type DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { NoAudioBanner } from './NoAudioBanner';
import { canSaveFromApp, useSaveInDaw } from './useSaveInDaw';

// #3262: the Save in REAPER and read button. A click saves, then reads; a refusal is shown where the click happened; two clicks are one save.

const result = (over: Partial<DawResult>): DawResult => ({ ok: true, changed: false, message: DAW_ANSWERS.projectSaved, undoSteps: 0, ...over });
const refusal = (sentence: string): DawResult => result({ ok: false, message: sentence, refused: sentence });

function clientSaving(save: () => Promise<DawResult>): DawClient {
  return { ...createMockDawClient(DAW_SETUPS.reaper), saveProject: save };
}
const wrap = (client: DawClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={createMockApi()}>
        <PortOverrides clients={{ daw: client }}>{children}</PortOverrides>
      </ApiProvider>
    );
  };

describe('useSaveInDaw', () => {
  it('saves on the click and reads the chapter again, and says what was saved', async () => {
    const save = vi.fn(async () => result({}));
    const onReread = vi.fn();
    const { result: hook } = renderHook(() => useSaveInDaw('c1', onReread), { wrapper: wrap(clientSaving(save)) });
    expect(save).not.toHaveBeenCalled();
    act(() => hook.current.onSave());
    expect(hook.current.saving).toBe(true);
    await waitFor(() => expect(hook.current.saved).toBe(DAW_ANSWERS.projectSaved));
    expect(hook.current.saving).toBe(false);
    expect(hook.current.refusal).toBeNull();
    expect(onReread).toHaveBeenCalledTimes(1);
  });

  it('a refusal reads nothing again and stays for the notice to show; the next click clears it', async () => {
    const save = vi.fn().mockResolvedValueOnce(refusal(DAW_ANSWERS.projectNeverSaved)).mockResolvedValueOnce(result({}));
    const onReread = vi.fn();
    const { result: hook } = renderHook(() => useSaveInDaw('c1', onReread), { wrapper: wrap(clientSaving(save)) });
    act(() => hook.current.onSave());
    await waitFor(() => expect(hook.current.refusal).toBe(DAW_ANSWERS.projectNeverSaved));
    expect(onReread).not.toHaveBeenCalled();
    expect(hook.current.saving).toBe(false);
    act(() => hook.current.onSave());
    expect(hook.current.refusal).toBeNull();
    await waitFor(() => expect(onReread).toHaveBeenCalledTimes(1));
  });

  it('a DAW that never answers its call is a refusal, not a button that spins or does nothing', async () => {
    const { result: hook } = renderHook(() => useSaveInDaw('c1', vi.fn()), { wrapper: wrap(clientSaving(() => Promise.reject(new Error('no bridge')))) });
    act(() => hook.current.onSave());
    await waitFor(() => expect(hook.current.refusal).toMatch(/did not answer the save/));
    expect(hook.current.saving).toBe(false);
  });

  it('two clicks while the first is answered send one save', async () => {
    let finish: (r: DawResult) => void = () => {};
    const save = vi.fn(() => new Promise<DawResult>((resolve) => (finish = resolve)));
    const { result: hook } = renderHook(() => useSaveInDaw('c1', vi.fn()), { wrapper: wrap(clientSaving(save)) });
    act(() => {
      hook.current.onSave();
      hook.current.onSave();
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => finish(result({})));
    expect(hook.current.saving).toBe(false);
  });

  it('what a save said is dropped when the page moves to another chapter', async () => {
    const { result: hook, rerender } = renderHook(({ id }) => useSaveInDaw(id, vi.fn()), {
      initialProps: { id: 'c1' },
      wrapper: wrap(clientSaving(async () => refusal('no'))),
    });
    act(() => hook.current.onSave());
    await waitFor(() => expect(hook.current.refusal).toBe('no'));
    rerender({ id: 'c2' });
    expect(hook.current.refusal).toBeNull();
  });
});

describe('canSaveFromApp', () => {
  it('is offered where the DAW can save from the app, also when it is not answering, and not where it never will', () => {
    expect(canSaveFromApp(DAW_SETUPS.reaper)).toBe(true);
    expect(canSaveFromApp(DAW_SETUPS['reaper-off'])).toBe(true);
    expect(canSaveFromApp(DAW_SETUPS.audacity)).toBe(false);
    expect(canSaveFromApp(DAW_SETUPS.builtin)).toBe(false);
    expect(canSaveFromApp(null)).toBe(false);
  });
});

describe('NoAudioBanner with the save button', () => {
  const props = { chapterName: 'Chapter One', daw: 'REAPER', onReread: vi.fn() };
  const save = (over = {}) => ({ saving: false, refusal: null, saved: null, onSave: vi.fn(), ...over });

  it('offers Save in REAPER and read beside Read again on an empty track, and the click is the only thing that saves', async () => {
    const s = save();
    render(<NoAudioBanner {...props} audio={{ kind: 'empty', unsaved: true }} save={s} />);
    expect(s.onSave).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Save in REAPER and read' }));
    expect(s.onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Read again' })).toBeTruthy();
  });

  it('shows the pending state as a disabled button', () => {
    render(<NoAudioBanner {...props} audio={{ kind: 'empty', unsaved: true }} save={save({ saving: true })} />);
    const button = screen.getByRole('button', { name: 'Saving in REAPER…' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('puts the refusal in the notice, beside the button that was clicked', () => {
    render(<NoAudioBanner {...props} audio={{ kind: 'empty', unsaved: true }} save={save({ refusal: DAW_ANSWERS.projectNeverSaved })} />);
    expect(screen.getByTestId('save-refusal').textContent).toContain('never been saved');
    expect(screen.getByRole('button', { name: 'Save in REAPER and read' })).toBeTruthy();
  });

  it('says what was saved when the chapter still has no audio after it', () => {
    render(<NoAudioBanner {...props} audio={{ kind: 'empty' }} save={save({ saved: DAW_ANSWERS.projectSaved })} />);
    expect(screen.getByTestId('save-done').textContent).toContain('3 tracks and 12 items');
  });

  it('has no button without a save to offer, for a link problem, or when the chapter has audio', () => {
    const { rerender } = render(<NoAudioBanner {...props} audio={{ kind: 'empty', unsaved: true }} />);
    expect(screen.queryByRole('button', { name: /Save in/ })).toBeNull();
    rerender(<NoAudioBanner {...props} audio={{ kind: 'missing' }} save={save()} />);
    expect(screen.queryByRole('button', { name: /Save in/ })).toBeNull();
    rerender(<NoAudioBanner {...props} audio={{ kind: 'ready' }} save={save()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
