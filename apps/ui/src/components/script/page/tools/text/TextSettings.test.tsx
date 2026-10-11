// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../primitives/Tooltip';
import { DEFAULT_TEXT_PREFS, TEXT_PREFS_STORAGE_KEY, type TextPrefs } from './readerText';
import { TextSettings, TextSettingsPopover, textSettingsSummary } from './TextSettings';
import { useTextPrefs } from './useTextPrefs';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function Harness({ initial = DEFAULT_TEXT_PREFS, onChange }: { initial?: TextPrefs; onChange?: (change: Partial<TextPrefs>) => void }) {
  const [prefs, setPrefs] = useState(initial);
  return (
    <TextSettings
      prefs={prefs}
      onChange={(change) => {
        onChange?.(change);
        setPrefs((current) => ({ ...current, ...change }));
      }}
    />
  );
}

describe('text-settings-popover', () => {
  it('shows the four controls with the current values', () => {
    render(<Harness initial={{ font: 'Verdana', size: 24, spacing: 2, width: 80 }} />);
    expect((screen.getByRole('combobox', { name: 'Font' }) as HTMLSelectElement).value).toBe('Verdana');
    expect(screen.getByText('24 px')).toBeTruthy();
    expect(screen.getByText('2.0')).toBeTruthy();
    expect(screen.getByText('Wide')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Size' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Line spacing' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Column width' })).toBeTruthy();
  });

  it('reports a font change', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Font' }), 'Arial');
    expect(onChange).toHaveBeenCalledWith({ font: 'Arial' });
  });

  it('reports a size, a spacing and a width step from the keyboard, in the listed values', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Size' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ size: 22 });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Line spacing' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ spacing: 1.9 });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Column width' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ width: 80 });
  });

  it('puts the current choices in the trigger’s hint', () => {
    expect(textSettingsSummary({ font: 'Verdana', size: 24, spacing: 2, width: 80 })).toBe('Text settings: Verdana, 24 px, line spacing 2.0, wide column');
    render(
      <TooltipProvider>
        <TextSettingsPopover prefs={DEFAULT_TEXT_PREFS} onChange={() => {}} />
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: textSettingsSummary(DEFAULT_TEXT_PREFS) })).toBeTruthy();
  });

  it('opens the settings from the trigger', async () => {
    render(
      <TooltipProvider>
        <TextSettingsPopover prefs={DEFAULT_TEXT_PREFS} onChange={() => {}} />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Text settings/ }));
    expect(await screen.findByRole('combobox', { name: 'Font' })).toBeTruthy();
  });
});

describe('useTextPrefs', () => {
  it('saves each change and reads it back on the next mount', () => {
    const first = renderHook(() => useTextPrefs());
    act(() => first.result.current[1]({ size: 28 }));
    act(() => first.result.current[1]({ font: 'Arial' }));
    expect(first.result.current[0]).toEqual({ ...DEFAULT_TEXT_PREFS, size: 28, font: 'Arial' });
    expect(JSON.parse(window.localStorage.getItem(TEXT_PREFS_STORAGE_KEY) as string)).toEqual(first.result.current[0]);
    first.unmount();
    expect(renderHook(() => useTextPrefs()).result.current[0]).toEqual({ ...DEFAULT_TEXT_PREFS, size: 28, font: 'Arial' });
  });

  it('works without storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    const { result } = renderHook(() => useTextPrefs());
    expect(result.current[0]).toEqual(DEFAULT_TEXT_PREFS);
    act(() => result.current[1]({ size: 32 }));
    expect(result.current[0].size).toBe(32);
  });
});
