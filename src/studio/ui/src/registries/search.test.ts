// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSearchRegistry, searchAll, useAsyncSearchSource, useSearchSource, waitingFor, type SearchHit, type SearchSource } from './search';

afterEach(cleanup);

const hit = (title: string, group = 'Script'): SearchHit => ({ group, title, sub: 'line 4', run: () => {} });

describe('the search registry', () => {
  it('search-sources-group-and-isolate: a source with hits lists them with their group and sub line', () => {
    const registry = createSearchRegistry();
    registry.register(() => [hit('The storm broke')]);
    expect(registry.searchAll('storm')).toEqual([{ group: 'Script', title: 'The storm broke', sub: 'line 4', run: expect.any(Function) }]);
  });

  it('a term under two characters queries no source', () => {
    const registry = createSearchRegistry();
    const source = vi.fn(() => [hit('x')]);
    registry.register(source);
    expect(registry.searchAll('s')).toEqual([]);
    expect(registry.searchAll('  s ')).toEqual([]);
    expect(source).not.toHaveBeenCalled();
  });

  it('passes the trimmed term to every source, in registration order', () => {
    const registry = createSearchRegistry();
    const seen: string[] = [];
    registry.register((term) => (seen.push(`a:${term}`), [hit('first')]));
    registry.register((term) => (seen.push(`b:${term}`), [hit('second')]));
    expect(registry.searchAll('  Storm ').map((h) => h.title)).toEqual(['first', 'second']);
    expect(seen).toEqual(['a:Storm', 'b:Storm']);
  });

  it('unregistering removes the source, and only that registration', () => {
    const registry = createSearchRegistry();
    const source = () => [hit('one')];
    const removeFirst = registry.register(source);
    registry.register(source);
    removeFirst();
    expect(registry.searchAll('on')).toHaveLength(1);
  });

  it('a source that throws is skipped and the others still show', () => {
    const registry = createSearchRegistry();
    registry.register(() => {
      throw new Error('index not ready');
    });
    registry.register(() => [hit('still here')]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(registry.searchAll('still').map((h) => h.title)).toEqual(['still here']);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('useSearchSource', () => {
  const source: SearchSource = () => [hit('from a page')];
  function Page() {
    useSearchSource(source);
    return null;
  }
  const page = () => createElement(Page);

  it('registers the source while the component is mounted and removes it on unmount', () => {
    const { unmount } = render(page());
    expect(searchAll('page').map((h) => h.title)).toEqual(['from a page']);
    unmount();
    expect(searchAll('page')).toEqual([]);
  });
});

describe('sources that answer later', () => {
  const signal = () => new AbortController().signal;

  it('are left out of searchAll and searchNow, and named with their place and group by waitingFor', () => {
    const registry = createSearchRegistry();
    const later = vi.fn(() => Promise.resolve([hit('from the host')]));
    registry.registerAsync(later, 'In the script');
    registry.register(() => [hit('from memory')]);
    expect(registry.searchAll('storm').map((h) => h.title)).toEqual(['from memory']);
    expect(registry.searchNow('storm')).toEqual([{ order: 1, hits: [expect.objectContaining({ title: 'from memory' })] }]);
    expect(registry.waitingFor('storm')).toEqual([{ order: 0, group: 'In the script' }]);
    expect(registry.waitingFor('s')).toEqual([]);
    expect(later).not.toHaveBeenCalled();
  });

  it('searchLater asks each with the trimmed term and the signal, and a source that throws at once answers a rejection', async () => {
    const registry = createSearchRegistry();
    const later = vi.fn((_term: string, _signal: AbortSignal) => Promise.resolve([hit('found')]));
    registry.registerAsync(later, 'In the script');
    registry.registerAsync(() => {
      throw new Error('index not ready');
    }, 'Elsewhere');
    const aborted = signal();
    const [first, second] = registry.searchLater('  Storm ', aborted);
    expect(later).toHaveBeenCalledWith('Storm', aborted);
    expect(first?.group).toBe('In the script');
    await expect(first?.answer).resolves.toEqual([expect.objectContaining({ title: 'found' })]);
    await expect(second?.answer).rejects.toThrow('index not ready');
    expect(registry.searchLater('s', signal())).toEqual([]);
  });

  it('unregistering removes only that registration', () => {
    const registry = createSearchRegistry();
    const later = () => Promise.resolve([hit('x')]);
    const remove = registry.registerAsync(later, 'A');
    registry.registerAsync(later, 'B');
    remove();
    expect(registry.waitingFor('storm').map((entry) => entry.group)).toEqual(['B']);
  });

  it('useAsyncSearchSource registers while mounted', () => {
    const later = () => Promise.resolve([hit('x')]);
    function Page() {
      useAsyncSearchSource(later, 'In the script');
      return null;
    }
    const { unmount } = render(createElement(Page));
    expect(waitingFor('storm').map((entry) => entry.group)).toEqual(['In the script']);
    unmount();
    expect(waitingFor('storm')).toEqual([]);
  });
});
