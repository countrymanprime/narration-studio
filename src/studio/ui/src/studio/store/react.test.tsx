// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StandardSchemaV1 } from '../../api/wire/standardSchema';
import { createSelector } from '../selectors/createSelector';
import { createStudioStore, type StudioState } from './createStudioStore';
import { bindStudio } from './react';

const anything = <T,>(): StandardSchemaV1<unknown, T> => ({ '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value: value as T }) } });
const registry = {
  jobs: { schema: anything<{ count: number }>(), load: () => Promise.resolve({ count: 1 }) },
  name: { schema: anything<string>(), load: () => Promise.resolve('Ada') },
};
const { StudioProvider, useStudio } = bindStudio<typeof registry>();
const newStore = () => createStudioStore({ registry, subscribe: () => () => undefined, subscribeFocus: () => () => undefined });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('stable-slice', () => {
  it('does not re-render a subscriber of one slot when an unrelated slot changes', async () => {
    const store = newStore();
    let renders = 0;
    function Jobs() {
      const jobs = useStudio((s) => s.slots.jobs);
      renders += 1;
      return <p>{jobs?.count ?? 'empty'}</p>;
    }
    const view = render(
      <StudioProvider store={store}>
        <Jobs />
      </StudioProvider>,
    );
    expect(view.getByText('empty')).toBeTruthy();
    const afterMount = renders;
    await act(() => store.load('name'));
    expect(renders).toBe(afterMount);
    await act(() => store.load('jobs'));
    expect(view.getByText('1')).toBeTruthy();
    expect(renders).toBe(afterMount + 1);
  });

  it('a memoised composition keeps its reference until an input changes', async () => {
    const store = newStore();
    const label = createSelector([(s: StudioState<typeof registry>) => s.slots.jobs, (s: StudioState<typeof registry>) => s.slots.name], (jobs, name) => ({
      text: `${name}:${jobs?.count}`,
    }));
    let renders = 0;
    function Label() {
      renders += 1;
      return <p>{useStudio(label).text}</p>;
    }
    const view = render(
      <StudioProvider store={store}>
        <Label />
      </StudioProvider>,
    );
    const afterMount = renders;
    await act(() => store.load('name'));
    expect(view.getByText('Ada:undefined')).toBeTruthy();
    expect(renders).toBe(afterMount + 1);
    // A reload that returns the same text leaves every input as it was, so the derived object and the render stay put.
    const before = renders;
    await act(() => store.load('name'));
    expect(renders).toBe(before);
  });

  it('warns in development when a selector builds a new object on every call', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    function Unstable() {
      useStudio((s) => ({ jobs: s.slots.jobs }));
      return null;
    }
    render(
      <StudioProvider store={newStore()}>
        <Unstable />
      </StudioProvider>,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('returned a new value'));
  });

  it('does not warn for a selector that returns a slice', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    function Stable() {
      useStudio((s) => s.slots.jobs);
      return null;
    }
    render(
      <StudioProvider store={newStore()}>
        <Stable />
      </StudioProvider>,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws a clear error outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Orphan() {
      useStudio((s) => s.slots);
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/StudioProvider/);
  });
});
