import { useCallback, useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';

const TOOL = 'Teleprompter';
const KEY = 'punch_preroll_seconds';

/** The pre-roll and the host's limits for it. The limits are the host's (`fieldSchemas`), never the menu's. */
type PunchPreroll = { value: number; min?: number; max?: number; step?: number };

type PunchPrerollState = {
  /** Null until the setting is read, and while it cannot be. */
  preroll: PunchPreroll | null;
  /** Why it could not be read or saved, or ''. */
  error: string;
  set: (seconds: number) => void;
};

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * `Teleprompter.punch_preroll_seconds` through the settings port. It is a computer-wide setting, so it is read and saved at the global layer;
 * "Punch from here" puts the DAW's edit cursor this many seconds before the word. A change is saved, then read back.
 */
export function usePunchPreroll(): PunchPrerollState {
  const system = usePort('system');
  const [preroll, setPreroll] = useState<PunchPreroll | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    system.settingsForScope('global').then(
      (fields) => {
        if (!live) return;
        const field = (fields[TOOL] ?? []).find((f) => f.key === KEY);
        const value = Number(field?.effectiveValue);
        if (!field || field.effectiveValue === '' || !Number.isFinite(value)) {
          setPreroll(null);
          setError('The punch pre-roll setting could not be read.');
          return;
        }
        setPreroll({ value, min: field.number?.min ?? undefined, max: field.number?.max ?? undefined, step: field.number?.step ?? undefined });
        setError('');
      },
      (e) => live && setError(why(e)),
    );
    return () => {
      live = false;
    };
  }, [system, version]);

  const set = useCallback(
    (seconds: number) => {
      system.saveSettings(TOOL, 'global', { [KEY]: String(seconds) }).then(
        () => setVersion((v) => v + 1),
        (e) => setError(why(e)),
      );
    },
    [system],
  );

  return { preroll, error, set };
}
