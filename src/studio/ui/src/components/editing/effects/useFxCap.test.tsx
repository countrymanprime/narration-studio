// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { useFxCap, type FxCapState } from './useFxCap';

afterEach(cleanup);

function mount(api: ReturnType<typeof createMockApi>) {
  const hook: { current?: FxCapState } = {};
  function Probe() {
    hook.current = useFxCap();
    return null;
  }
  render(
    <ApiProvider api={api}>
      <Probe />
    </ApiProvider>,
  );
  return hook as { current: FxCapState };
}

describe('the effects coverage cap hook', () => {
  it('a slow save that fails after a newer one succeeded leaves no error showing (qa-breaker B5)', async () => {
    const api = createMockApi();
    const answers: Array<{ ok: () => void; fail: (reason: Error) => void }> = [];
    vi.spyOn(api, 'saveSettings').mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          answers.push({ ok: () => resolve(undefined as never), fail: reject });
        }),
    );
    const hook = mount(api);
    await act(async () => {});
    act(() => hook.current.setCap(20));
    act(() => hook.current.setCap(25));
    await act(async () => answers[1]!.ok());
    await act(async () => answers[0]!.fail(new Error('host busy')));
    expect(hook.current.cap).toBe(25);
    expect(hook.current.error).toBe('');
  });

  it('reads the cap again when the window is focused, so a read that failed has a way back (qa-breaker B6)', async () => {
    const api = createMockApi();
    let reads = 0;
    vi.spyOn(api, 'settingsForScope').mockImplementation(async (scope) => {
      reads += 1;
      if (reads === 1) throw new Error('could not read');
      return createMockApi().settingsForScope(scope);
    });
    const hook = mount(api);
    await act(async () => {});
    expect(hook.current.ready).toBe(false);
    expect(hook.current.error).toContain('could not read');
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(hook.current.ready).toBe(true);
    expect(hook.current.error).toBe('');
  });
});
