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

function mount(api: ReturnType<typeof createMockApi>) {
  const hook: { current?: Hook } = {};
  function Probe() {
    hook.current = useVoiceTracks(quiet);
    return null;
  }
  render(
    <ApiProvider api={api}>
      <VoiceSetupProvider projectFolder="C:/Projects/Alice">
        <Probe />
      </VoiceSetupProvider>
    </ApiProvider>,
  );
  return hook as { current: Hook };
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
});
