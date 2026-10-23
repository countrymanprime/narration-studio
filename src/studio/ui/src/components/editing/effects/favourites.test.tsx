// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { FxList } from '../../../ports/daw';
import type { NarrationApi } from '../../../types';
import { AddEffect } from './AddEffect';
import { favouritesFirst, parseFavourites, toggledFavourites } from './favourites';
import { useFxFavourites } from './useFxFavourites';

afterEach(cleanup);

const LIST: FxList = { source: 'Your FX chains', choices: ['Air.RfxChain', 'Podcast Voice.RfxChain', 'Warm.RfxChain'].map((name) => ({ id: name, name })) };

describe('favourite effects', () => {
  it('parses the stored comma list, trimmed and without blanks', () => {
    expect(parseFavourites('')).toEqual([]);
    expect(parseFavourites(' Warm.RfxChain , ,Air.RfxChain\n')).toEqual(['Warm.RfxChain', 'Air.RfxChain']);
  });

  it('puts the favourites first in the list own order and leaves the rest where they were', () => {
    const ordered = favouritesFirst(LIST, ['warm.rfxchain', 'Air.RfxChain']);
    expect(ordered.choices.map((c) => c.name)).toEqual(['Air.RfxChain', 'Warm.RfxChain', 'Podcast Voice.RfxChain']);
    expect(ordered.source).toBe(LIST.source);
  });

  it('keeps the list as it is when nothing is a favourite, and ignores a favourite the DAW no longer lists', () => {
    expect(favouritesFirst(LIST, [])).toBe(LIST);
    expect(favouritesFirst(LIST, ['Gone.RfxChain']).choices.map((c) => c.name)).toEqual(LIST.choices.map((c) => c.name));
  });

  it('toggles a name on and off, matching without regard to case', () => {
    expect(toggledFavourites(['Air.RfxChain'], 'Warm.RfxChain')).toEqual(['Air.RfxChain', 'Warm.RfxChain']);
    expect(toggledFavourites(['Air.RfxChain', 'Warm.RfxChain'], 'air.rfxchain')).toEqual(['Warm.RfxChain']);
  });
});

function withApi(over: Partial<NarrationApi>) {
  const api = createMockApi(over as Partial<NarrationApi>);
  return ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
}
const stored = (value: string) =>
  ({
    settingsForScope: async () => ({
      DAW: [
        {
          key: 'fx_favourites',
          label: 'Favourite effects',
          kind: 'tags',
          choices: [],
          value,
          isSet: value !== '',
          effectiveValue: value,
          effectiveSource: 'user',
        },
      ],
    }),
  }) as Partial<NarrationApi>;

describe('useFxFavourites', () => {
  it('reads the computer-wide list and saves a toggle at the global layer, then reads it back', async () => {
    let value = 'Air.RfxChain';
    const save = vi.fn(async (_tool: string, _scope: string, values: Record<string, string>) => {
      value = values.fx_favourites ?? value;
    });
    const wrapper = withApi({
      saveSettings: save as unknown as NarrationApi['saveSettings'],
      settingsForScope: async () => ({
        DAW: [
          { key: 'fx_favourites', label: 'Favourite effects', kind: 'tags', choices: [], value, isSet: true, effectiveValue: value, effectiveSource: 'user' },
        ],
      }),
    } as Partial<NarrationApi>);
    const { result } = renderHook(() => useFxFavourites(), { wrapper });
    await waitFor(() => expect(result.current.names).toEqual(['Air.RfxChain']));
    act(() => result.current.toggle('Warm.RfxChain'));
    await waitFor(() => expect(save).toHaveBeenCalledWith('DAW', 'global', { fx_favourites: 'Air.RfxChain,Warm.RfxChain' }));
    await waitFor(() => expect(result.current.names).toEqual(['Air.RfxChain', 'Warm.RfxChain']));
  });

  it('says why when the setting cannot be read or saved, and keeps the last list', async () => {
    const wrapper = withApi({
      ...stored('Air.RfxChain'),
      saveSettings: async () => {
        throw new Error('The settings file is read-only.');
      },
    } as Partial<NarrationApi>);
    const { result } = renderHook(() => useFxFavourites(), { wrapper });
    await waitFor(() => expect(result.current.names).toEqual(['Air.RfxChain']));
    act(() => result.current.toggle('Warm.RfxChain'));
    await waitFor(() => expect(result.current.error).toContain('read-only'));
    expect(result.current.names).toEqual(['Air.RfxChain']);
  });

  it('refuses a name with a comma, which the stored list could not keep whole', async () => {
    const save = vi.fn(async () => undefined);
    const wrapper = withApi({ ...stored(''), saveSettings: save as unknown as NarrationApi['saveSettings'] } as Partial<NarrationApi>);
    const { result } = renderHook(() => useFxFavourites(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.toggle('Vocals, bright.RfxChain'));
    expect(result.current.error).toContain('comma');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('the Effects tab favourites', () => {
  it('stars each listed chain, shows which are favourites, and toggles one by name', () => {
    const toggle = vi.fn();
    render(
      <AddEffect hasSelection reason="" impact={null} cap={10} list={LIST} onAdd={vi.fn()} favourites={{ names: ['Warm.RfxChain'], toggle, error: '' }} />,
    );
    const group = screen.getByRole('group', { name: LIST.source });
    expect(within(group).getByRole('button', { name: 'Favourite Warm.RfxChain' }).getAttribute('aria-pressed')).toBe('true');
    const air = within(group).getByRole('button', { name: 'Favourite Air.RfxChain' });
    expect(air.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(air);
    expect(toggle).toHaveBeenCalledWith('Air.RfxChain');
  });

  it('writes the settings problem under the list', () => {
    render(
      <AddEffect
        hasSelection
        reason=""
        impact={null}
        cap={10}
        list={LIST}
        onAdd={vi.fn()}
        favourites={{ names: [], toggle: vi.fn(), error: 'The settings file is read-only.' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('read-only');
  });

  it('has no stars when the page gives no favourites', () => {
    render(<AddEffect hasSelection reason="" impact={null} cap={10} list={LIST} onAdd={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Favourite / })).toBeNull();
  });
});
