import { useCallback, useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import { joinFavourites, parseFavourites, toggledFavourites } from './favourites';

const TOOL = 'DAW';
const KEY = 'fx_favourites';

export type FxFavourites = {
  /** The favourite names, in the order they were starred. */
  names: string[];
  /** Why the list could not be read or saved, or ''. */
  error: string;
  /** Stars `name`, or takes the star off. */
  toggle: (name: string) => void;
};

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The narrator's favourite effects (`DAW.fx_favourites`) through the settings port. Plug-ins and chains are named by what is installed on this
 * computer, so the list is read and saved at the global layer. A change is saved, then read back; a failed read or save keeps the last list.
 */
export function useFxFavourites(): FxFavourites & { ready: boolean } {
  const system = usePort('system');
  const [names, setNames] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    system.settingsForScope('global').then(
      (fields) => {
        if (!live) return;
        const field = (fields[TOOL] ?? []).find((f) => f.key === KEY);
        setNames(parseFavourites(field?.effectiveValue ?? ''));
        setReady(true);
        setError('');
      },
      (e) => {
        if (!live) return;
        setError(why(e));
        setReady(true);
      },
    );
    return () => {
      live = false;
    };
  }, [system, version]);

  const toggle = useCallback(
    (name: string) => {
      if (name.includes(',')) return setError(`“${name}” has a comma in its name, which the favourites list cannot keep.`);
      system.saveSettings(TOOL, 'global', { [KEY]: joinFavourites(toggledFavourites(names, name)) }).then(
        () => setVersion((v) => v + 1),
        (e) => setError(why(e)),
      );
    },
    [system, names],
  );

  return { names, error, toggle, ready };
}
