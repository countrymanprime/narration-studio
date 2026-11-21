// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { boothUnits } from '../reading/boothUnits';
import { useMoveTarget } from './useMoveTarget';

const units = boothUnits([{ id: 'p1', text: 'One two three. Four five six seven.' }]);

describe('useMoveTarget', () => {
  it('is the end of the chapter audio once the chapter has words, whatever place the Booth opened at', () => {
    const { result } = renderHook(() => useMoveTarget({ units }));
    expect(result.current).toEqual({ where: 'end' });
  });

  it('has no target until the chapter has words', () => {
    const { result } = renderHook(() => useMoveTarget({ units: [] }));
    expect(result.current).toBeNull();
  });
});
