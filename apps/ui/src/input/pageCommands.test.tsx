// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { currentPageContext, registerPageCommands, usePageCommands, type PageItem } from './pageCommands';

afterEach(cleanup);

const item = (id: string, over: Partial<PageItem> = {}): PageItem => ({ id, label: id, run: () => {}, ...over });

describe('page commands', () => {
  it('there-is-no-page-context-until-a-page-registers-one', () => {
    expect(currentPageContext()).toBeNull();
  });

  it('a-page-registers-its-name-and-items-and-they-go-with-it', () => {
    const off = registerPageCommands({ id: 'script', label: 'Script' }, () => [item('a'), item('b', { group: 'Chapters' })]);
    expect(currentPageContext()).toMatchObject({ id: 'script', label: 'Script' });
    expect(currentPageContext()!.items.map((row) => row.id)).toEqual(['a', 'b']);
    off();
    expect(currentPageContext()).toBeNull();
  });

  it('items-are-read-when-asked-so-they-follow-the-page-state', () => {
    let state = ['a'];
    const off = registerPageCommands({ id: 'p', label: 'P' }, () => state.map((id) => item(id)));
    state = ['a', 'b'];
    expect(currentPageContext()!.items.map((row) => row.id)).toEqual(['a', 'b']);
    off();
  });

  it('two-registrations-of-one-page-merge-and-each-removes-only-its-own', () => {
    const offA = registerPageCommands({ id: 'editing', label: 'Editing' }, () => [item('a')]);
    const offB = registerPageCommands({ id: 'editing', label: 'Editing' }, () => [item('b')]);
    expect(currentPageContext()!.items.map((row) => row.id)).toEqual(['a', 'b']);
    offA();
    expect(currentPageContext()!.items.map((row) => row.id)).toEqual(['b']);
    offB();
  });

  it('a-duplicate-id-within-a-page-is-refused-so-two-rows-never-share-a-key', () => {
    const off = registerPageCommands({ id: 'p', label: 'P' }, () => [item('a'), item('a')]);
    expect(() => currentPageContext()).toThrow(/duplicate/i);
    off();
  });

  it('a-page-says-which-global-groups-it-replaces', () => {
    const off = registerPageCommands({ id: 'p', label: 'P', supersedes: ['Chapters'] }, () => []);
    expect(currentPageContext()!.supersedes).toEqual(['Chapters']);
    off();
  });

  it('lazy-items-are-a-separate-loader-that-is-not-called-at-registration', async () => {
    let calls = 0;
    const off = registerPageCommands(
      { id: 'p', label: 'P' },
      () => [item('now')],
      async () => {
        calls += 1;
        return [item('later')];
      },
    );
    expect(calls).toBe(0);
    const context = currentPageContext()!;
    expect(context.items.map((row) => row.id)).toEqual(['now']);
    expect((await context.load!()).map((row) => row.id)).toEqual(['later']);
    off();
  });

  it('the-hook-registers-while-mounted-and-reads-the-latest-items-without-registering-again', () => {
    const { rerender, unmount } = renderHook(
      ({ ids }) =>
        usePageCommands(
          { id: 'p', label: 'P' },
          ids.map((id) => item(id)),
        ),
      { initialProps: { ids: ['a'] } },
    );
    rerender({ ids: ['a', 'b'] });
    expect(currentPageContext()!.items.map((row) => row.id)).toEqual(['a', 'b']);
    unmount();
    expect(currentPageContext()).toBeNull();
  });
});
