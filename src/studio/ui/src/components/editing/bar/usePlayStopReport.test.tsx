// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { usePlayStopReport } from './usePlayStopReport';

afterEach(cleanup);

function setup() {
  const diagnostic = vi.fn().mockResolvedValue(undefined);
  const api = { ...createMockApi(), reportClientDiagnostic: diagnostic };
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  return { diagnostic, ...renderHook(() => usePlayStopReport(), { wrapper }) };
}

describe('the report of how a play of words ended', () => {
  it('reports the tracked play once, with the path that took it and where it stopped', () => {
    const { diagnostic, result } = setup();
    result.current.begin({ text: 'Ishmael', end: 10.6 }, 10.7);
    result.current.setPath('daw');
    result.current.reportStop(10.72);
    result.current.reportStop(10.9);
    expect(diagnostic).toHaveBeenCalledTimes(1);
    expect(diagnostic).toHaveBeenCalledWith('play_stop', expect.stringContaining('word="Ishmael"'));
    expect(diagnostic.mock.calls[0][1]).toContain('actual_stop=10.720');
    expect(diagnostic.mock.calls[0][1]).toContain('path=daw');
  });

  it('says the path is unknown until a provider takes the play', () => {
    const { diagnostic, result } = setup();
    result.current.begin({ text: 'gone', end: 1 }, 1.1);
    result.current.reportStop(null);
    expect(diagnostic.mock.calls[0][1]).toContain('path=unknown');
    expect(diagnostic.mock.calls[0][1]).toContain('actual_stop=unknown');
  });

  it('reports nothing for a play that ends nowhere in particular, or after a clear', () => {
    const { diagnostic, result } = setup();
    result.current.reportStop(1);
    result.current.setPath('app');
    result.current.begin({ text: 'x', end: 1 }, 1);
    result.current.clear();
    result.current.reportStop(1);
    expect(diagnostic).not.toHaveBeenCalled();
  });

  it('keeps one stable object while the port is the same', () => {
    const { result, rerender } = setup();
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
