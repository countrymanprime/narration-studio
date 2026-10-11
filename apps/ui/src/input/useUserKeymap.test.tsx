// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { createMockApi } from '../api/mockApi';
import type { NarrationApi, ScopedSettingField } from '../types';
import { COMMAND_CATALOG } from './commands.catalog';
import { serializeGesture } from './gestures';
import { defaultKeymap } from './keymap';
import { keymapFromOverridesText, refreshUserKeymap, useUserKeymap } from './useUserKeymap';

afterEach(cleanup);

const serialised = (gestures: readonly { source: string }[] | undefined) => (gestures ?? []).map((g) => serializeGesture(g as never));

function apiWith(read: () => string): NarrationApi {
  const base = createMockApi();
  return {
    ...base,
    settingsForScope: async (scope) => {
      const all = await base.settingsForScope(scope);
      const field = all.Keymap?.find((entry) => entry.key === 'overrides') as ScopedSettingField;
      return { ...all, Keymap: [{ ...field, effectiveValue: read() }] };
    },
  };
}

function Show({ id, text }: { id: string; text?: string }) {
  const keymap = useUserKeymap(text);
  return <output data-testid="keys">{serialised(keymap[id]).join(',')}</output>;
}

describe('keymapFromOverridesText', () => {
  const defaults = defaultKeymap(COMMAND_CATALOG);

  it('is the defaults for no document, an empty one or a malformed one', () => {
    for (const text of [undefined, '', '{"version":1,"bindings":{}}', 'not json']) {
      expect(serialised(keymapFromOverridesText(text)['nav.back'])).toEqual(serialised(defaults['nav.back']));
    }
  });

  it('layers a binding over the default, and keeps the default for the one binding it cannot parse', () => {
    const text = JSON.stringify({ version: 1, bindings: { 'nav.back': ['Ctrl+KeyH'], 'nav.forward': ['Bogus+KeyZ'] } });
    const keymap = keymapFromOverridesText(text);
    expect(serialised(keymap['nav.back'])).toEqual(['Ctrl+KeyH']);
    expect(serialised(keymap['nav.forward'])).toEqual(serialised(defaults['nav.forward']));
  });
});

describe('useUserKeymap', () => {
  it('one-keymap-hook-feeds-all-three: reads Keymap.overrides through the API and re-reads after refreshUserKeymap', async () => {
    let text = '{"version":1,"bindings":{}}';
    render(
      <ApiProvider api={apiWith(() => text)}>
        <Show id="nav.back" />
      </ApiProvider>,
    );
    expect(screen.getByTestId('keys').textContent).toContain('BrowserBack');

    text = '{"version":1,"bindings":{"nav.back":["Ctrl+KeyH"]}}';
    act(() => refreshUserKeymap());
    await waitFor(() => expect(screen.getByTestId('keys').textContent).toBe('Ctrl+KeyH'));
  });

  it('uses the text it is handed without reading the setting', () => {
    const api = apiWith(() => {
      throw new Error('must not read');
    });
    render(
      <ApiProvider api={api}>
        <Show id="nav.back" text={'{"version":1,"bindings":{"nav.back":["Alt+KeyB"]}}'} />
      </ApiProvider>,
    );
    expect(screen.getByTestId('keys').textContent).toBe('Alt+KeyB');
  });

  it('keeps the defaults when the setting cannot be read', async () => {
    const api = { ...createMockApi(), settingsForScope: () => Promise.reject(new Error('host down')) } as NarrationApi;
    render(
      <ApiProvider api={api}>
        <Show id="nav.back" />
      </ApiProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('keys').textContent).toContain('BrowserBack');
  });
});
