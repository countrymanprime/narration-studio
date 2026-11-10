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
import { overlay } from '../../../overlay/overlayService';
import { PortOverrides } from '../../../ports/usePort';
import { NoAudioBanner } from './NoAudioBanner';
import { CommandRouter } from '../../../input/router';
import { canSaveFromApp, SAVE_GIVES_UP_MS, useSaveInDaw, useSaveShortcut } from './useSaveInDaw';

// #3262: the Save in REAPER and read button. A click saves, then reads; a refusal is an error toast; two clicks are one save.

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
  it('saves on the click, says what was saved in a toast and reads the chapter again', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const save = vi.fn(async () => result({}));
    const onReread = vi.fn();
    const { result: hook } = renderHook(() => useSaveInDaw(onReread), { wrapper: wrap(clientSaving(save)) });
    expect(save).not.toHaveBeenCalled();
    act(() => hook.current.onSave());
    expect(hook.current.saving).toBe(true);
    await waitFor(() => expect(onReread).toHaveBeenCalledTimes(1));
    expect(hook.current.saving).toBe(false);
    expect(toast).toHaveBeenCalledWith(DAW_ANSWERS.projectSaved);
    toast.mockRestore();
  });

  it('a refusal is an error toast with the sentence, reads nothing again and leaves the button ready for another click', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const save = vi.fn().mockResolvedValueOnce(refusal(DAW_ANSWERS.projectNeverSaved)).mockResolvedValueOnce(result({}));
    const onReread = vi.fn();
    const { result: hook } = renderHook(() => useSaveInDaw(onReread), { wrapper: wrap(clientSaving(save)) });
    act(() => hook.current.onSave());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(DAW_ANSWERS.projectNeverSaved, { tone: 'error' }));
    expect(onReread).not.toHaveBeenCalled();
    expect(hook.current.saving).toBe(false);
    act(() => hook.current.onSave());
    await waitFor(() => expect(onReread).toHaveBeenCalledTimes(1));
    toast.mockRestore();
  });

  it('a DAW that never answers its call is a refusal toast, not a button that spins or does nothing', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const { result: hook } = renderHook(() => useSaveInDaw(vi.fn()), { wrapper: wrap(clientSaving(() => Promise.reject(new Error('no bridge')))) });
    act(() => hook.current.onSave());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/did not answer the save/), { tone: 'error' }));
    expect(hook.current.saving).toBe(false);
    toast.mockRestore();
  });

  it('two clicks while the first is answered send one save', async () => {
    let finish: (r: DawResult) => void = () => {};
    const save = vi.fn(() => new Promise<DawResult>((resolve) => (finish = resolve)));
    const { result: hook } = renderHook(() => useSaveInDaw(vi.fn()), { wrapper: wrap(clientSaving(save)) });
    act(() => {
      hook.current.onSave();
      hook.current.onSave();
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => finish(result({})));
    expect(hook.current.saving).toBe(false);
  });
});

describe('useSaveInDaw, leaving and empty answers', () => {
  it('says a refusal that arrives after the narrator left, and one with no words still says nothing was saved', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    let finish: (r: DawResult) => void = () => {};
    const { result: hook, unmount } = renderHook(() => useSaveInDaw(vi.fn()), {
      wrapper: wrap(clientSaving(() => new Promise<DawResult>((r) => (finish = r)))),
    });
    act(() => hook.current.onSave());
    unmount();
    await act(async () => finish(refusal('')));
    expect(toast).toHaveBeenCalledWith('The project was not saved.', { tone: 'error' });
    toast.mockRestore();
  });

  it('a page opened again while a save is unanswered does not send a second save', async () => {
    let finish: (r: DawResult) => void = () => {};
    const save = vi.fn(() => new Promise<DawResult>((r) => (finish = r)));
    const first = renderHook(() => useSaveInDaw(vi.fn()), { wrapper: wrap(clientSaving(save)) });
    act(() => first.result.current.onSave());
    first.unmount();
    const second = renderHook(() => useSaveInDaw(vi.fn()), { wrapper: wrap(clientSaving(save)) });
    act(() => second.result.current.onSave());
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => finish(result({})));
  });
});

describe('useSaveInDaw, blank answers, huge answers, silence and remounting', () => {
  it.each(['   ', '\u202e', ' \u200f '])('a refusal of %j still says the project was not saved', async (blank) => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const { result: hook } = renderHook(() => useSaveInDaw(vi.fn()), { wrapper: wrap(clientSaving(async () => refusal(blank))) });
    act(() => hook.current.onSave());
    await waitFor(() => expect(toast).toHaveBeenCalledWith('The project was not saved.', { tone: 'error' }));
    toast.mockRestore();
  });

  it('cuts a huge answer so a toast cannot cover the header', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const { result: hook } = renderHook(() => useSaveInDaw(vi.fn()), { wrapper: wrap(clientSaving(async () => refusal('x'.repeat(10_000)))) });
    act(() => hook.current.onSave());
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect((toast.mock.calls[0][0] as string).length).toBeLessThanOrEqual(400);
    toast.mockRestore();
  });

  it('a save the DAW never answers ends in a refusal and the button can be pressed again', async () => {
    vi.useFakeTimers();
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const { result: hook } = renderHook(() => useSaveInDaw(vi.fn()), { wrapper: wrap(clientSaving(() => new Promise<DawResult>(() => {}))) });
    act(() => hook.current.onSave());
    expect(hook.current.saving).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_GIVES_UP_MS + 10);
    });
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/did not answer the save/), { tone: 'error' });
    expect(hook.current.saving).toBe(false);
    toast.mockRestore();
    vi.useRealTimers();
  });

  it('a page opened again while a save runs shows it as running and reads once it is done', async () => {
    let finish: (r: DawResult) => void = () => {};
    const save = vi.fn(() => new Promise<DawResult>((r) => (finish = r)));
    const first = renderHook(() => useSaveInDaw(vi.fn()), { wrapper: wrap(clientSaving(save)) });
    act(() => first.result.current.onSave());
    first.unmount();
    const reread = vi.fn();
    const second = renderHook(() => useSaveInDaw(reread), { wrapper: wrap(clientSaving(save)) });
    expect(second.result.current.saving).toBe(true);
    await act(async () => finish(result({})));
    expect(second.result.current.saving).toBe(false);
    expect(reread).toHaveBeenCalledTimes(1);
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
  const save = (over = {}) => ({ saving: false, onSave: vi.fn(), ...over });

  it('offers Save in REAPER and read beside Read again on an empty track, and the click is the only thing that saves', async () => {
    const s = save();
    render(<NoAudioBanner {...props} audio={{ kind: 'empty', unsaved: true }} save={s} />);
    expect(s.onSave).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Save in REAPER and read' }));
    expect(s.onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Read again' })).toBeTruthy();
  });

  it('drops the sentence that tells the narrator to save when the button does it, and keeps the record instruction on a track that is not an unsaved recording', () => {
    const { rerender } = render(<NoAudioBanner {...props} audio={{ kind: 'empty', unsaved: true }} save={save()} />);
    expect(screen.queryByText(/Save the project in REAPER, then read again/)).toBeNull();
    rerender(<NoAudioBanner {...props} audio={{ kind: 'empty', unsaved: true }} />);
    expect(screen.getByText(/Save the project in REAPER, then read again/)).toBeTruthy();
    rerender(<NoAudioBanner {...props} audio={{ kind: 'empty' }} save={save()} />);
    expect(screen.getByText(/Record or import the chapter onto that track in REAPER/)).toBeTruthy();
  });

  it('shows the pending state on the button itself: busy, same label, presses ignored', async () => {
    const s = save({ saving: true });
    render(<NoAudioBanner {...props} audio={{ kind: 'empty', unsaved: true }} save={s} />);
    const button = screen.getByRole('button', { name: 'Save in REAPER and read' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(button);
    expect(s.onSave).not.toHaveBeenCalled();
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

// #3334: Ctrl+S is the same save as the button, from any page.
describe('useSaveShortcut', () => {
  const keyboardWrap = (client: DawClient) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <ApiProvider api={createMockApi()}>
          <PortOverrides clients={{ daw: client }}>
            <CommandRouter>{children}</CommandRouter>
          </PortOverrides>
        </ApiProvider>
      );
    };
  const press = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    act(() => void document.body.dispatchEvent(event));
    return event;
  };

  it('Ctrl+S saves once, keeps the browser from saving the page and says the answer', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const save = vi.fn(async () => result({}));
    renderHook(() => useSaveShortcut(), { wrapper: keyboardWrap(clientSaving(save)) });
    const event = press({ key: 's', code: 'KeyS', ctrlKey: true });
    press({ key: 's', code: 'KeyS', ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(DAW_ANSWERS.projectSaved));
    expect(save).toHaveBeenCalledTimes(1);
    toast.mockRestore();
  });

  it('a refusal (recording, no DAW, one that cannot save) is the error toast with its reason', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const save = vi.fn(async () => refusal('REAPER is recording. Stop recording first.'));
    renderHook(() => useSaveShortcut(), { wrapper: keyboardWrap(clientSaving(save)) });
    press({ key: 's', code: 'KeyS', ctrlKey: true });
    await waitFor(() => expect(toast).toHaveBeenCalledWith('REAPER is recording. Stop recording first.', { tone: 'error' }));
    toast.mockRestore();
  });

  it('saves from a text field too (no field here answers Ctrl+S) and keeps the browser from saving the page', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const save = vi.fn(async () => result({}));
    renderHook(() => useSaveShortcut(), { wrapper: keyboardWrap(clientSaving(save)) });
    const field = document.createElement('textarea');
    document.body.append(field);
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 's', code: 'KeyS', ctrlKey: true });
    act(() => void field.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    field.remove();
    toast.mockRestore();
  });

  it('a port that throws at once is an error toast, and the next press saves again', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const save = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockResolvedValueOnce(result({}));
    renderHook(() => useSaveShortcut(), { wrapper: keyboardWrap(clientSaving(save)) });
    press({ key: 's', code: 'KeyS', ctrlKey: true });
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('did not answer'), { tone: 'error' }));
    press({ key: 's', code: 'KeyS', ctrlKey: true });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    toast.mockRestore();
  });

  it('an Editing page open during a Ctrl+S save shows it running and reads when it is done', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const onReread = vi.fn();
    const { result: hook } = renderHook(
      () => {
        useSaveShortcut();
        return useSaveInDaw(onReread);
      },
      { wrapper: keyboardWrap(clientSaving(async () => result({}))) },
    );
    press({ key: 's', code: 'KeyS', ctrlKey: true });
    expect(hook.current.saving).toBe(true);
    await waitFor(() => expect(onReread).toHaveBeenCalledTimes(1));
    toast.mockRestore();
  });
});
