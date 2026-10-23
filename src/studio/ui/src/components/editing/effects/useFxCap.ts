import { useCallback, useEffect, useState } from 'react';
import type { ScopedSettingField } from '../../../api/contracts/system';
import { usePort } from '../../../ports/usePort';
import { FX_CAP_MAX, FX_CAP_MIN, FX_CAP_PCT } from './effectsMath';

/** Editing.fx_cap_pct: the share of a chapter, a whole percent, effects may cover before the tab warns. The host keeps it for the project. */
const TOOL = 'Editing';
const KEY = 'fx_cap_pct';
/**
 * The cap a settings answer holds: Editing.fx_cap_pct's effective value, or FX_CAP_PCT when the field is absent (an older host) or holds
 * anything but a whole number from 1 to 100, as the host itself reads one.
 */
export function fxCapOf(fields: Record<string, ScopedSettingField[]>): number {
  const field = fields[TOOL]?.find((f) => f.key === KEY);
  const value = Number(field?.effectiveValue);
  return field && field.effectiveValue !== '' && Number.isInteger(value) && value >= FX_CAP_MIN && value <= FX_CAP_MAX ? value : FX_CAP_PCT;
}

export interface FxCapState {
  /** The cap the strip and Add effect judge against: FX_CAP_PCT until the setting is read, and while it cannot be. */
  cap: number;
  /** False until the setting is read; the field stays off until then. */
  ready: boolean;
  /** Why the cap could not be read or saved, or ''. */
  error: string;
  setCap: (pct: number) => void;
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The coverage cap through the settings port, at project scope. A change shows at once and is saved as a whole percent within 1 to 100;
 * a refusal puts the stored cap back and keeps the host's sentence.
 */
export function useFxCap(): FxCapState {
  const system = usePort('system');
  const [cap, setLocal] = useState(FX_CAP_PCT);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    system.settingsForScope('project').then(
      (fields) => {
        if (!live) return;
        setLocal(fxCapOf(fields));
        setReady(true);
      },
      (e) => live && setError(why(e)),
    );
    return () => {
      live = false;
    };
  }, [system, version]);

  const setCap = useCallback(
    (pct: number) => {
      const next = Math.min(FX_CAP_MAX, Math.max(FX_CAP_MIN, Math.round(pct)));
      setLocal(next);
      system.saveSettings(TOOL, 'project', { [KEY]: String(next) }).then(
        () => setError(''),
        (e) => {
          setError(why(e));
          setVersion((v) => v + 1);
        },
      );
    },
    [system],
  );

  return { cap, ready, error, setCap };
}
