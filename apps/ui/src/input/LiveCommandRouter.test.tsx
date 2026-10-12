// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { createDawMock } from '../api/dawMock';
import type { DawTransport } from '../api/contracts/daw';
import type { NarrationApi } from '../types';
import { COMMAND_CATALOG, type CommandDescriptor } from './commands.catalog';
import { gesture } from './gestures';
import type { GestureEvent, InputSource } from './InputSource';
import { defaultKeymap, type Keymap } from './keymap';
import { LiveCommandRouter } from './LiveCommandRouter';
import { CommandScope } from './router';
import { useCommand } from './useCommand';

function fakeSource(): InputSource & { emit: (event: Partial<GestureEvent> & Pick<GestureEvent, 'gesture'>) => void } {
  let listener: ((event: GestureEvent) => void) | undefined;
  return {
    subscribe(onGesture) {
      listener = onGesture;
      return () => {
        listener = undefined;
      };
    },
    emit(event) {
      listener?.({ target: null, preventDefault: () => {}, ...event });
    },
  };
}

const NOISY_COMMAND: CommandDescriptor = { id: 'test.noisy', label: 'Noisy test', scope: 'global', noisy: true, defaults: [] };

function Registrar({ id, onFire }: { id: string; onFire: () => void }) {
  useCommand(id, onFire);
  return null;
}

describe('LiveCommandRouter', () => {
  it('fires a noisy command while stopped, and suppresses it once daw_transport_changed reports recording', () => {
    let onUpdate: ((state: DawTransport) => void) | undefined;
    const base = createDawMock({ daw: 'REAPER', transport: { playing: false, recording: false } });
    const api: Pick<NarrationApi, 'subscribeDawTransport'> = {
      subscribeDawTransport: (fn) => {
        onUpdate = fn;
        return base.subscribeDawTransport(fn);
      },
    };
    const source = fakeSource();
    const onFire = vi.fn();
    const keymap: Keymap = { [NOISY_COMMAND.id]: [gesture('keyboard', 'KeyP')] };

    render(
      <ApiProvider api={api as NarrationApi}>
        <LiveCommandRouter source={source} catalog={[NOISY_COMMAND]} keymap={keymap}>
          <Registrar id={NOISY_COMMAND.id} onFire={onFire} />
        </LiveCommandRouter>
      </ApiProvider>,
    );

    act(() => source.emit({ gesture: gesture('keyboard', 'KeyP') }));
    expect(onFire).toHaveBeenCalledTimes(1);

    act(() => onUpdate?.({ playing: true, recording: true }));
    act(() => source.emit({ gesture: gesture('keyboard', 'KeyP') }));
    expect(onFire).toHaveBeenCalledTimes(1);

    act(() => onUpdate?.({ playing: false, recording: false }));
    act(() => source.emit({ gesture: gesture('keyboard', 'KeyP') }));
    expect(onFire).toHaveBeenCalledTimes(2);
  });

  it('throws when useCommand is called with no <ApiProvider> ancestor, same as any other DAW-port consumer', () => {
    const source = fakeSource();
    expect(() =>
      render(
        <LiveCommandRouter source={source} catalog={[NOISY_COMMAND]}>
          <Registrar id={NOISY_COMMAND.id} onFire={vi.fn()} />
        </LiveCommandRouter>,
      ),
    ).toThrow('useApi() called outside an <ApiProvider>.');
  });

  it('router-gets-the-narrators-keymap: a command bound by an override fires on its new gesture and not on the old one', async () => {
    const base = createDawMock({ daw: 'REAPER', transport: { playing: false, recording: false } });
    const field = { key: 'overrides', label: '', kind: 'text', choices: [], value: '', isSet: true, effectiveSource: 'global' };
    const api = {
      subscribeDawTransport: base.subscribeDawTransport,
      settingsForScope: async () => ({ Keymap: [{ ...field, effectiveValue: '{"version":1,"bindings":{"test.noisy":["KeyQ"]}}' }] }),
    };
    const source = fakeSource();
    const onFire = vi.fn();
    const catalog: CommandDescriptor[] = [{ ...NOISY_COMMAND, defaults: [{ source: 'keyboard', code: 'KeyP', modifiers: [] }] }];

    render(
      <ApiProvider api={api as unknown as NarrationApi}>
        <LiveCommandRouter source={source} catalog={catalog}>
          <Registrar id={NOISY_COMMAND.id} onFire={onFire} />
        </LiveCommandRouter>
      </ApiProvider>,
    );

    await waitFor(() => {
      act(() => source.emit({ gesture: gesture('keyboard', 'KeyQ') }));
      expect(onFire).toHaveBeenCalledTimes(1);
    });
    act(() => source.emit({ gesture: gesture('keyboard', 'KeyP') }));
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('typing-and-ctrl-are-ignored: a Booth key does not fire from a focused field or with Ctrl held', () => {
    const source = fakeSource();
    const onFire = vi.fn();
    const base = createDawMock({ daw: 'REAPER', transport: { playing: false, recording: false } });
    const api = { subscribeDawTransport: base.subscribeDawTransport, settingsForScope: async () => ({}) };
    const input = document.createElement('input');
    document.body.append(input);

    render(
      <ApiProvider api={api as unknown as NarrationApi}>
        <LiveCommandRouter source={source} keymap={defaultKeymap(COMMAND_CATALOG, false)}>
          <CommandScope kind="booth">
            <Registrar id="booth.phrase.next" onFire={onFire} />
          </CommandScope>
        </LiveCommandRouter>
      </ApiProvider>,
    );

    act(() => source.emit({ gesture: gesture('keyboard', 'ArrowDown'), target: input }));
    act(() => source.emit({ gesture: gesture('keyboard', 'ArrowDown', ['Ctrl']) }));
    expect(onFire).not.toHaveBeenCalled();

    act(() => source.emit({ gesture: gesture('keyboard', 'ArrowDown') }));
    expect(onFire).toHaveBeenCalledTimes(1);
    input.remove();
  });
});
