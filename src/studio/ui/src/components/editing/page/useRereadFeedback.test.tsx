// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { overlay } from '../../../overlay/overlayService';
import type { ChapterRead } from './chapterSource';
import { useRereadFeedback } from './useRereadFeedback';

// Owner rule: a button never does nothing or looks like it does nothing. Read again is pending until the read comes back, and says so when it found nothing.

const read = (kind: 'ready' | 'empty'): ChapterRead => ({ audio: { kind } }) as ChapterRead;

describe('useRereadFeedback', () => {
  it('is pending from the press until the page reads again, then says there is still no audio', () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const onReread = vi.fn();
    const { result, rerender } = renderHook(({ r }) => useRereadFeedback(r, 'Chapter One', onReread), { initialProps: { r: read('empty') } });
    expect(result.current.rereading).toBe(false);
    act(() => result.current.reread());
    expect(onReread).toHaveBeenCalledTimes(1);
    expect(result.current.rereading).toBe(true);
    rerender({ r: read('empty') });
    expect(result.current.rereading).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Chapter One again from the saved project: there is still no audio'));
    toast.mockRestore();
  });

  it('says nothing when the read found audio: the note goes and the script fills', () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const { result, rerender } = renderHook(({ r }) => useRereadFeedback(r, 'Chapter One', vi.fn()), { initialProps: { r: read('empty') } });
    act(() => result.current.reread());
    rerender({ r: read('ready') });
    expect(result.current.rereading).toBe(false);
    expect(toast).not.toHaveBeenCalled();
    toast.mockRestore();
  });

  it('says nothing for a read the narrator did not ask for (a save, a focus read)', () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const { rerender } = renderHook(({ r }) => useRereadFeedback(r, 'Chapter One', vi.fn()), { initialProps: { r: read('empty') } });
    rerender({ r: read('empty') });
    expect(toast).not.toHaveBeenCalled();
    toast.mockRestore();
  });
});
