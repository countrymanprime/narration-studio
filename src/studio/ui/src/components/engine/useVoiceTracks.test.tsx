// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { VoiceTracksState } from '../../api/contracts/voiceTracks';
import { useVoiceTracks } from './useVoiceTracks';
import { VoiceSetupProvider } from './voiceLayout';

afterEach(cleanup);

type Hook = ReturnType<typeof useVoiceTracks>;

/** A host whose saves answer when the test says, so two calls can be in flight and answer in either order. */
function slowHost() {
  const api = createMockApi();
  api.guideEntities = async () => [];
  api.voiceTracksGet = async () => state({});
  const pending: Array<{ args: unknown[]; answer: (state: VoiceTracksState) => void }> = [];
  const hold = (...args: unknown[]) => new Promise<VoiceTracksState>((answer) => pending.push({ args, answer }));
  api.voiceTracksSetCharacters = vi.fn((track: string, ids: string[]) => hold('characters', track, ids));
  api.voiceTracksSetLayout = vi.fn((layout) => hold('layout', layout));
  return { api, pending };
}

const quiet = () => {};

function mount(api: ReturnType<typeof createMockApi>, notify: (message: string, tone?: string) => void = quiet, projectFolder = 'C:/Projects/Alice') {
  const hook: { current?: Hook } = {};
  function Probe() {
    hook.current = useVoiceTracks(notify);
    return null;
  }
  const tree = (folder: string) => (
    <ApiProvider api={api}>
      <VoiceSetupProvider projectFolder={folder}>
        <Probe />
      </VoiceSetupProvider>
    </ApiProvider>
  );
  const { rerender } = render(tree(projectFolder));
  return Object.assign(hook as { current: Hook }, { switchProject: (folder: string) => rerender(tree(folder)) });
}

/** Two hooks on one provider, as the Settings row and the Engine panel are. */
function mountTwo(api: ReturnType<typeof createMockApi>) {
  const first: { current?: Hook } = {};
  const second: { current?: Hook } = {};
  function A() {
    first.current = useVoiceTracks(quiet);
    return null;
  }
  function B() {
    second.current = useVoiceTracks(quiet);
    return null;
  }
  render(
    <ApiProvider api={api}>
      <VoiceSetupProvider projectFolder="C:/Projects/Alice">
        <A />
        <B />
      </VoiceSetupProvider>
    </ApiProvider>,
  );
  return { first: first as { current: Hook }, second: second as { current: Hook } };
}

function state(patch: Partial<VoiceTracksState>): VoiceTracksState {
  return { layout: 'folders', narratorCharacter: '', tracks: [], ...patch };
}

describe('saving the voice setup', () => {
  it('two ticks before the first save answers send both characters', async () => {
    const { api, pending } = slowHost();
    const hook = mount(api);
    await act(async () => {});
    act(() => hook.current.setTrackCharacters('Extras', ['a']));
    act(() => hook.current.setTrackCharacters('Extras', [...(hook.current.setup.tracks[0]?.characters ?? []), 'b']));
    expect(pending.map((call) => call.args)).toEqual([
      ['characters', 'Extras', ['a']],
      ['characters', 'Extras', ['a', 'b']],
    ]);
  });

  it('an answer that comes back after a newer save does not replace it', async () => {
    const { api, pending } = slowHost();
    const hook = mount(api);
    await act(async () => {});
    act(() => hook.current.setLayout('flat'));
    act(() => hook.current.setLayout('folders'));
    await act(async () => pending[1].answer(state({ layout: 'folders' })));
    await act(async () => pending[0].answer(state({ layout: 'flat' })));
    expect(hook.current.setup.layout).toBe('folders');
  });

  it('a refused save re-reads the setup, and a failed re-read says so too', async () => {
    const api = createMockApi();
    api.guideEntities = async () => [];
    let reads = 0;
    api.voiceTracksGet = async () => {
      reads += 1;
      if (reads > 1) throw new Error('the voice tracks file was written by a newer version of the app');
      return state({});
    };
    api.voiceTracksSetLayout = async () => {
      throw new Error('that voice setup is not valid: unknown layout');
    };
    const notify = vi.fn();
    const stable = (message: string, tone?: string) => notify(message, tone);
    const hook = mount(api, stable);
    await act(async () => {});
    await act(async () => hook.current.setLayout('flat'));
    await act(async () => {});
    const errors = notify.mock.calls.filter(([, tone]) => tone === 'error').map(([message]) => String(message));
    expect(errors).toHaveLength(2);
    expect(errors[1]).toContain('newer version');
  });

  it('a newer save from another hook on the same setup is not undone by an older answer', async () => {
    const { api, pending } = slowHost();
    const { first, second } = mountTwo(api);
    await act(async () => {});
    act(() => first.current.setLayout('folders'));
    act(() => second.current.setLayout('flat'));
    await act(async () => pending[1].answer(state({ layout: 'flat' })));
    await act(async () => pending[0].answer(state({ layout: 'folders' })));
    expect(first.current.setup.layout).toBe('flat');
  });

  it('a save answered after the project changed is dropped', async () => {
    const { api, pending } = slowHost();
    api.voiceTracksGet = async () => state({ layout: 'flat' });
    const hook = mount(api);
    await act(async () => {});
    act(() => hook.current.setLayout('folders'));
    act(() => hook.switchProject('C:/Projects/Other'));
    await act(async () => {});
    await act(async () => pending[0].answer(state({ layout: 'folders' })));
    expect(hook.current.setup.layout).toBe('flat');
  });

  it('a refused save whose re-read fails restores the layout before the save', async () => {
    const api = createMockApi();
    api.guideEntities = async () => [];
    let reads = 0;
    api.voiceTracksGet = async () => {
      reads += 1;
      if (reads > 1) throw new Error('could not read');
      return state({ layout: 'flat' });
    };
    api.voiceTracksSetLayout = async () => {
      throw new Error('that voice setup is not valid: unknown layout');
    };
    const hook = mount(api);
    await act(async () => {});
    await act(async () => hook.current.setLayout('folders'));
    await act(async () => {});
    expect(hook.current.setup.layout).toBe('flat');
  });

  it('does not read the Story Bible when the caller does not need its characters', async () => {
    const api = createMockApi();
    const entities = vi.spyOn(api, 'guideEntities');
    function Probe() {
      useVoiceTracks(quiet, { characters: false });
      return null;
    }
    render(
      <ApiProvider api={api}>
        <VoiceSetupProvider projectFolder="C:/Projects/Alice">
          <Probe />
        </VoiceSetupProvider>
      </ApiProvider>,
    );
    await act(async () => {});
    expect(entities).not.toHaveBeenCalled();
  });

  // Issue #2919: the character list is a read the panel needs, so a failed read is an error toast with Retry, which reads it again.
  it('a failed read of the characters offers Retry, which reads them again', async () => {
    const api = createMockApi();
    let reads = 0;
    api.guideEntities = async () => {
      reads += 1;
      if (reads === 1) throw new Error('the Story Bible is busy');
      return [];
    };
    api.voiceTracksGet = async () => state({});
    const notify = vi.fn();
    const stable = (message: string, tone?: string, action?: { onAction: () => void }) => notify(message, tone, action);
    mount(api, stable as never);
    await act(async () => {});
    const failed = notify.mock.calls.find(([, tone]) => tone === 'error');
    expect(failed?.[0]).toContain('busy');
    expect(failed?.[2]).toMatchObject({ label: 'Retry' });
    await act(async () => failed![2].onAction());
    expect(reads).toBe(2);
  });

  it('a failed read of the project voice setup offers Retry, which reads it again', async () => {
    const api = createMockApi();
    api.guideEntities = async () => [];
    let reads = 0;
    api.voiceTracksGet = async () => {
      reads += 1;
      if (reads === 1) throw new Error('the voice tracks file is unreadable');
      return state({});
    };
    const notify = vi.fn();
    const stable = (message: string, tone?: string, action?: { onAction: () => void }) => notify(message, tone, action);
    mount(api, stable as never);
    await act(async () => {});
    const failed = notify.mock.calls.find(([message]) => String(message).includes('unreadable'));
    expect(failed?.[2]).toMatchObject({ label: 'Retry' });
    await act(async () => failed![2].onAction());
    expect(reads).toBe(2);
  });
});
