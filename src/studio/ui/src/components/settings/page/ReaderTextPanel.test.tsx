// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOOTH_SIZE_STORAGE_KEY } from '../../booth/page/useTextChoices';
import { TEXT_PREFS_STORAGE_KEY, loadTextPrefs } from '../../script/page/tools/text/readerText';
import { useTextPrefs } from '../../script/page/tools/text/useTextPrefs';
import { TooltipProvider } from '../../primitives/Tooltip';
import { ReaderTextPanel } from './ReaderTextPanel';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const mount = () =>
  render(
    <TooltipProvider>
      <ReaderTextPanel />
    </TooltipProvider>,
  );
const preview = () => screen.getByTestId('reader-text-preview');
const slider = (name: string) => screen.getByRole('slider', { name });

describe('Settings Reader text panel (SN-M94)', () => {
  it('saves the size, line spacing, column width and font and redraws the preview', () => {
    mount();
    expect(preview().textContent).toContain('Off with her head!');
    expect(preview().style.fontSize).toBe('20px');
    // The mock's four reading settings (`ui/TextSettings.tsx`): the size and width sliders step through their lists.
    fireEvent.change(slider('Size'), { target: { value: '5' } });
    fireEvent.change(slider('Line spacing'), { target: { value: '2.2' } });
    fireEvent.change(slider('Column width'), { target: { value: '3' } });
    expect(preview().style.fontSize).toBe('24px');
    expect(preview().style.lineHeight).toBe('2.2');
    expect(loadTextPrefs()).toMatchObject({ size: 24, spacing: 2.2, width: 100 });
    expect(JSON.parse(window.localStorage.getItem(TEXT_PREFS_STORAGE_KEY)!).spacing).toBe(2.2);
    expect(screen.getByRole('combobox', { name: 'Font' })).toBeTruthy();
  });

  it("a choice made here is the Script reader's choice, and the Booth's own size is left alone", () => {
    mount();
    fireEvent.change(slider('Size'), { target: { value: '6' } });
    cleanup();
    // The Script reader reads the same saved choices when it opens.
    const { result } = renderHook(() => useTextPrefs());
    expect(result.current[0].size).toBe(28);
    expect(window.localStorage.getItem(BOOTH_SIZE_STORAGE_KEY)).toBeNull();
  });

  it("starts from the Script reader's saved choices", () => {
    const { result } = renderHook(() => useTextPrefs());
    act(() => result.current[1]({ size: 16, spacing: 1.4 }));
    mount();
    expect(preview().style.fontSize).toBe('16px');
    expect(preview().style.lineHeight).toBe('1.4');
  });
});
