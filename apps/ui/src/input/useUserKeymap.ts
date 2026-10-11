import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { usePort } from '../ports/usePort';
import { EMPTY_KEYMAP_OVERRIDES, keymapOverridesSchema } from '../api/schemas/keymap';
import { parseWireJson } from '../api/wire/parseWire';
import { COMMAND_CATALOG, type CommandDescriptor } from './commands.catalog';
import { keymapFromBindings, type Keymap } from './keymap';

/** The effective keymap for a `Keymap.overrides` document's text: the defaults with its bindings on top. A malformed
 * document gives the defaults, and one binding that cannot be parsed keeps its default (`keymapFromBindings`). */
export function keymapFromOverridesText(text: string | undefined, catalog: readonly CommandDescriptor[] = COMMAND_CATALOG): Keymap {
  let bindings = EMPTY_KEYMAP_OVERRIDES.bindings;
  try {
    bindings = parseWireJson(keymapOverridesSchema, text ?? '', { boundary: 'settings', payload: 'Keymap.overrides' }).bindings;
  } catch {
    // Falls back to the defaults rather than failing the screen that shows keys.
  }
  return keymapFromBindings(bindings, catalog);
}

// The host has no settings-changed event, so whoever saves `Keymap.overrides` says so and every mounted reader re-reads.
const listeners = new Set<() => void>();
let revision = 0;

/** Call after saving `Keymap.overrides`: every `useUserKeymap()` without its own text re-reads the setting. */
export function refreshUserKeymap(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The narrator's keymap: the catalogue defaults with `Keymap.overrides` on top. The sheet, the Settings key list, the
 * footers and the live router all read it, so help shows the keys that work.
 *
 * A caller that already holds the setting's text (Settings loads it) passes it and nothing is fetched; otherwise it is read
 * through the API's `settingsForScope`, and the defaults stand until that returns or if it fails.
 */
export function useUserKeymap(documentText?: string, catalog: readonly CommandDescriptor[] = COMMAND_CATALOG): Keymap {
  const api = usePort('system');
  const readRevision = useSyncExternalStore(
    subscribe,
    () => revision,
    () => revision,
  );
  const [fetched, setFetched] = useState<string>();

  useEffect(() => {
    if (documentText !== undefined) return;
    let live = true;
    void (async () => {
      try {
        const settings = await api.settingsForScope('global');
        if (live) setFetched(settings.Keymap?.find((field) => field.key === 'overrides')?.effectiveValue);
      } catch {
        // Keeps the defaults.
      }
    })();
    return () => {
      live = false;
    };
  }, [api, documentText, readRevision]);

  const text = documentText ?? fetched;
  return useMemo(() => keymapFromOverridesText(text, catalog), [text, catalog]);
}
