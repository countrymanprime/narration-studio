import { useCallback, useEffect, useState } from 'react';
import type { ScopedSettingField } from '../../../api/contracts/system';
import { usePort } from '../../../ports/usePort';
import { NO_SETTINGS } from './backupsText';

/** The DAW settings the Backups tab edits (ADR 0863): the toggle, the window either side of an edit and how long a backup is kept. */
const TOOL = 'DAW';
const KEEP_KEY = 'capability.backups';
export const WINDOW_KEY = 'backups.window_seconds';
export const RETENTION_KEY = 'backups.retention_days';

/** A number setting as the host sends it: its value and its limits. The limits are the host's, never the tab's. */
type NumberSetting = { value: number; min?: number; max?: number; step?: number };

export type BackupSettings = { keep: boolean; window: NumberSetting; retention: NumberSetting };

export interface BackupSettingsState {
  /** Null until the settings are read, and while they cannot be. */
  settings: BackupSettings | null;
  /** Why they could not be read or saved, or ''. */
  error: string;
  setKeep: (keep: boolean) => void;
  setWindow: (seconds: number) => void;
  setRetention: (days: number) => void;
}

const numberOf = (field: ScopedSettingField | undefined): NumberSetting | null => {
  const value = Number(field?.effectiveValue);
  if (!field || field.effectiveValue === '' || !Number.isFinite(value)) return null;
  const r = field.number;
  return { value, min: r?.min ?? undefined, max: r?.max ?? undefined, step: r?.step ?? undefined };
};

/** Reads the backups settings from the project's settings, as Settings layers them. */
export function backupSettingsOf(fields: Record<string, ScopedSettingField[]>): BackupSettings | null {
  const rows = fields[TOOL] ?? [];
  const find = (key: string) => rows.find((r) => r.key === key);
  const window = numberOf(find(WINDOW_KEY));
  const retention = numberOf(find(RETENTION_KEY));
  if (!window || !retention) return null;
  return { keep: find(KEEP_KEY)?.effectiveValue !== 'off', window, retention };
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The backups settings through the settings port, at project scope (the mock keeps them with the project). Turning backups off saves the
 * toggle `off`, and on gives it back to `auto`, so the DAW decides again whether it has them. Each change is saved, then read back.
 */
export function useBackupSettings(): BackupSettingsState {
  const system = usePort('system');
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    system.settingsForScope('project').then(
      (fields) => {
        if (!live) return;
        const read = backupSettingsOf(fields);
        setSettings(read);
        setError(read ? '' : NO_SETTINGS);
      },
      (e) => live && setError(why(e)),
    );
    return () => {
      live = false;
    };
  }, [system, version]);

  const save = useCallback(
    (key: string, value: string) => {
      system.saveSettings(TOOL, 'project', { [key]: value }).then(
        () => setVersion((v) => v + 1),
        (e) => setError(why(e)),
      );
    },
    [system],
  );

  return {
    settings,
    error,
    setKeep: (keep) => save(KEEP_KEY, keep ? 'auto' : 'off'),
    setWindow: (seconds) => save(WINDOW_KEY, String(seconds)),
    setRetention: (days) => save(RETENTION_KEY, String(Math.round(days))),
  };
}
