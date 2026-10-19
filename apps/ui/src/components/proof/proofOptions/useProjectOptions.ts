import { useCallback, useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import type { ScopedSettingField } from '../../../types';

type ProjectOptions = {
  /** The tool's settings named by `keys`, in that order, as this project reads them. Empty until read, and while they cannot be. */
  fields: ScopedSettingField[];
  /** Why they could not be read or saved, or ''. */
  error: string;
  /** Saves `value` at the project layer; `null` hands the setting back to the computer-wide value or the default. */
  set: (key: string, value: string | null) => void;
};

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * One tool's settings, read and saved at the project layer through the settings port: the options a Proof panel offers beside what they change.
 * A change is saved, then read back, so what shows is what the host holds; a refused save leaves the last read in place. `onSaved` runs after
 * each accepted save, for the page to read again what the option changes.
 */
export function useProjectOptions(
  tool: string,
  keys: readonly string[],
  { enabled = true, onSaved }: { enabled?: boolean; onSaved?: () => void } = {},
): ProjectOptions {
  const system = usePort('system');
  const [fields, setFields] = useState<ScopedSettingField[]>([]);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const wanted = keys.join('\u0000');

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    system.settingsForScope('project').then(
      (all) => {
        if (!live) return;
        const mine = all[tool] ?? [];
        setFields(wanted.split('\u0000').flatMap((key) => mine.filter((f) => f.key === key)));
        setError('');
      },
      (e) => {
        if (!live) return;
        setFields([]);
        setError(why(e));
      },
    );
    return () => {
      live = false;
    };
  }, [system, tool, wanted, version, enabled]);

  const set = useCallback(
    (key: string, value: string | null) => {
      system.saveSettings(tool, 'project', { [key]: value }).then(
        () => {
          setVersion((v) => v + 1);
          onSaved?.();
        },
        (e) => setError(why(e)),
      );
    },
    [system, tool, onSaved],
  );

  return { fields, error, set };
}
