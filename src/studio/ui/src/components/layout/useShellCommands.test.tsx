// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { providedCommands } from '../../input/commandProviders';
import { CATEGORIES } from '../settings/registry/categories';
import { ZOOM_STEPS } from '../../hooks/useZoom';
import { useShellCommands, type ShellCommandsInput } from './useShellCommands';

afterEach(cleanup);

const base = (): ShellCommandsInput => ({
  hasManuscript: true,
  openSettings: vi.fn(),
  importManuscript: vi.fn(),
  darkTheme: false,
  toggleTheme: vi.fn(),
  zoomPercent: 100,
  setZoom: vi.fn(),
  undoLabel: 'Mark chapter 3 as ready',
  undo: vi.fn(),
});
const find = (label: string) => providedCommands().find((command) => command.label === label);

describe('useShellCommands (the jump menu rows the mock has and the app lacked)', () => {
  it('lists a Settings row for each category, and runs it on that category', () => {
    const input = base();
    renderHook(() => useShellCommands(input));
    const rows = providedCommands().filter((command) => command.group === 'Settings');
    expect(rows.map((row) => row.label)).toEqual(CATEGORIES.map((category) => `Settings: ${category.label}`));
    rows[1].run();
    expect(input.openSettings).toHaveBeenCalledWith(CATEGORIES[1].id);
  });

  it('turns Import off with a reason once a manuscript exists, and Replace off before one does', () => {
    const input = { ...base(), hasManuscript: true };
    const { unmount } = renderHook(() => useShellCommands(input));
    expect(find('Import manuscript…')?.disabledReason).toMatch(/Replace manuscript/);
    expect(find('Replace manuscript…')?.disabledReason).toBeUndefined();
    find('Replace manuscript…')?.run();
    expect(input.openSettings).toHaveBeenCalledWith('project');
    unmount();
    const empty = { ...base(), hasManuscript: false };
    renderHook(() => useShellCommands(empty));
    expect(find('Import manuscript…')?.disabledReason).toBeUndefined();
    expect(find('Replace manuscript…')?.disabledReason).toMatch(/Import manuscript/);
    find('Import manuscript…')?.run();
    expect(empty.importManuscript).toHaveBeenCalledOnce();
  });

  it("offers each of the host's zoom steps, with the current one off", () => {
    const input = { ...base(), zoomPercent: 125 };
    renderHook(() => useShellCommands(input));
    const rows = providedCommands().filter((command) => command.id.startsWith('zoom.set.'));
    expect(rows.map((row) => row.label)).toEqual(ZOOM_STEPS.map((step) => `Set zoom to ${Math.round(step * 100)}%`));
    expect(rows.filter((row) => row.disabledReason).map((row) => row.label)).toEqual(['Set zoom to 125%']);
    rows[1].run();
    expect(input.setZoom).toHaveBeenCalledWith(ZOOM_STEPS[1]);
  });

  it('names the change Undo reverses, and is off with a reason when there is none', () => {
    const input = base();
    const { unmount } = renderHook(() => useShellCommands(input));
    const labelled = find('Undo: Mark chapter 3 as ready');
    expect(labelled?.disabledReason).toBeUndefined();
    labelled?.run();
    expect(input.undo).toHaveBeenCalledOnce();
    unmount();
    renderHook(() => useShellCommands({ ...base(), undoLabel: undefined }));
    expect(find('Undo')?.disabledReason).toBe('Nothing to undo');
  });

  it('toggles the theme', () => {
    const input = base();
    renderHook(() => useShellCommands(input));
    find('Toggle dark theme')?.run();
    expect(input.toggleTheme).toHaveBeenCalledOnce();
  });
});
