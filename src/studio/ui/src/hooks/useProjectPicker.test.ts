// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useProjectPicker } from './useProjectPicker';

describe('useProjectPicker', () => {
  it('stays open when bootstrap supplies the first project folder after the picker was opened', () => {
    const { result, rerender } = renderHook(({ folder }) => useProjectPicker(folder), { initialProps: { folder: undefined as string | undefined } });
    act(() => result.current[1](true));
    rerender({ folder: 'C:/Projects/Alice' });
    expect(result.current[0]).toBe(true);
  });

  it('closes when a project is chosen from a standalone launch (empty folder)', () => {
    const { result, rerender } = renderHook(({ folder }) => useProjectPicker(folder), { initialProps: { folder: '' as string | undefined } });
    act(() => result.current[1](true));
    rerender({ folder: 'C:/Projects/Alice' });
    expect(result.current[0]).toBe(false);
  });

  it('closes when the open project changes to another project', () => {
    const { result, rerender } = renderHook(({ folder }) => useProjectPicker(folder), { initialProps: { folder: 'C:/Projects/Alice' as string | undefined } });
    act(() => result.current[1](true));
    rerender({ folder: 'C:/Projects/Voltage' });
    expect(result.current[0]).toBe(false);
  });

  it('stays open across a refresh that keeps the same project', () => {
    const { result, rerender } = renderHook(({ folder }) => useProjectPicker(folder), { initialProps: { folder: 'C:/Projects/Alice' as string | undefined } });
    act(() => result.current[1](true));
    rerender({ folder: 'C:/Projects/Alice' });
    expect(result.current[0]).toBe(true);
  });
});
