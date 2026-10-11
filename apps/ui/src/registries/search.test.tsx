// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSearchRegistry, searchAll, useSearchSource, type SearchHit, type SearchSource } from './search';

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
    expect(registry.searchAll('still').map((h) => h.title)).toEqual(['still here']);
  });
});

describe('useSearchSource', () => {
  const source: SearchSource = () => [hit('from a page')];
  function Page() {
    useSearchSource(source);
    return null;
  }

  it('registers the source while the component is mounted and removes it on unmount', () => {
    const { unmount } = render(<Page />);
    expect(searchAll('page').map((h) => h.title)).toEqual(['from a page']);
    unmount();
    expect(searchAll('page')).toEqual([]);
  });
});
