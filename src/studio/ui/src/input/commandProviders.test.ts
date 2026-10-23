// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_CATALOG } from './commands.catalog';
import { providedCommands, registerCommandProvider, useCommandProvider, type ProvidedCommand } from './commandProviders';
import { commandsFor } from './surfaces';

const cmd = (id: string, extra: Partial<ProvidedCommand> = {}): ProvidedCommand => ({ id, group: 'Chapters', label: id, run: () => {}, ...extra });

const cleanups: Array<() => void> = [];
const register = (fn: () => ProvidedCommand[]): void => {
  cleanups.push(registerCommandProvider(fn));
};
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

describe('registerCommandProvider', () => {
  it('concatenates every provider and unregisters', () => {
    const off = registerCommandProvider(() => [cmd('chapter.1')]);
    register(() => [cmd('chapter.2'), cmd('chapter.3')]);
    expect(providedCommands().map((c) => c.id)).toEqual(['chapter.1', 'chapter.2', 'chapter.3']);
    off();
    expect(providedCommands().map((c) => c.id)).toEqual(['chapter.2', 'chapter.3']);
  });

  it('provider results never reach the help or settings surfaces', () => {
    register(() => [cmd('chapter.1')]);
    for (const surface of ['help', 'settings'] as const) {
      expect(commandsFor(surface).map((c) => c.id)).not.toContain('chapter.1');
    }
  });

  it('rejects a provided command that carries defaults', () => {
    const bad = { ...cmd('chapter.9'), defaults: [] } as unknown as ProvidedCommand;
    register(() => [bad]);
    expect(() => providedCommands()).toThrow(/chapter\.9.*no key/);
  });

  it('is called lazily, on each providedCommands call and not at registration', () => {
    const provider = vi.fn(() => [cmd('chapter.1')]);
    register(provider);
    expect(provider).not.toHaveBeenCalled();
    providedCommands();
    providedCommands();
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('rejects an id that equals a static catalogue id, naming both', () => {
    const staticRow = COMMAND_CATALOG[0];
    register(() => [cmd(staticRow.id, { label: 'Imposter' })]);
    expect(() => providedCommands()).toThrow(new RegExp(`${staticRow.id}.*Imposter.*${staticRow.label}`));
  });
});

describe('useCommandProvider', () => {
  it('registers on mount, unregisters on unmount, and a new fn replaces rather than duplicates', () => {
    const { rerender, unmount } = renderHook(({ fn }) => useCommandProvider(fn), {
      initialProps: { fn: () => [cmd('a')] },
    });
    expect(providedCommands().map((c) => c.id)).toEqual(['a']);
    rerender({ fn: () => [cmd('b')] });
    expect(providedCommands().map((c) => c.id)).toEqual(['b']);
    unmount();
    expect(providedCommands()).toEqual([]);
  });
});
