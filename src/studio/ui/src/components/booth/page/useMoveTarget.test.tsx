// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { BoothPunch } from '../../../api/contracts/voiceTracks';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { boothUnits } from '../reading/boothUnits';
import { useMoveTarget } from './useMoveTarget';

afterEach(cleanup);

const paragraphs = [{ id: 'p1', text: 'One two three. Four five six seven.' }];
const units = boothUnits(paragraphs);

function run(boothPunchTarget: NarrationApi['boothPunchTarget'], over: Partial<Parameters<typeof useMoveTarget>[0]> = {}) {
  const api = createMockApi({ boothPunchTarget });
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  return renderHook(() => useMoveTarget({ chapterId: 'c1', paragraphs, units, line: { paragraphId: 'p1', offset: 15 }, ...over }), { wrapper });
}

describe('useMoveTarget', () => {
  it('goes to where the line was recorded, from the host, not to a text-length guess', async () => {
    const ask = vi.fn(async (): Promise<BoothPunch> => ({ outcome: 'found', trackGuid: '{V}', start: 301.5, end: 305 }));
    const { result } = run(ask);
    await waitFor(() => expect(result.current).toEqual({ where: 'at', seconds: 301.5 }));
    expect(ask).toHaveBeenCalledExactlyOnceWith('c1', 'p1', 3, 6);
  });

  it('a line nobody recorded goes to the end of the chapter audio', async () => {
    const { result } = run(async () => ({ outcome: 'never_recorded' }));
    await waitFor(() => expect(result.current).toEqual({ where: 'end' }));
  });

  it.each([
    ['a refusal (no check, a stale one)', async (): Promise<BoothPunch> => ({ outcome: 'refused', reason: 'stale', message: 'Out of date.' })],
    ['a failed lookup', async (): Promise<BoothPunch> => Promise.reject(new Error('down'))],
  ])('falls back to the text-length estimate on %s', async (_name, ask) => {
    const { result } = run(ask);
    await waitFor(() => expect(result.current?.where).toBe('at'));
    expect(result.current).toEqual({ where: 'at', seconds: expect.any(Number) });
    expect((result.current as { seconds: number }).seconds).toBeGreaterThan(0);
  });

  it('opened at a chapter with no line, it is the end and nothing is asked', async () => {
    const ask = vi.fn(async (): Promise<BoothPunch> => ({ outcome: 'never_recorded' }));
    const { result } = run(ask, { line: undefined });
    await waitFor(() => expect(result.current).toEqual({ where: 'end' }));
    expect(ask).not.toHaveBeenCalled();
  });

  it('has no target until the chapter has words', () => {
    const { result } = run(async () => ({ outcome: 'never_recorded' }), { units: [] });
    expect(result.current).toBeNull();
  });
});
