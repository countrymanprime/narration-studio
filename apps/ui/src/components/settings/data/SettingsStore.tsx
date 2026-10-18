import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { Scope, ScopedSettingField } from '../../../types';
import type { SettingMeta } from '../registry/types';
import { without } from './record';
import { useSettingsForms } from './settingsForms';
import { fieldOf, type ReadSettings } from './values';

export type SettingsStore = {
  /** What the host last answered for each scope. */
  settings: ReadSettings;
  /** The host's sentence for a scope that could not be read. */
  readError: Partial<Record<Scope, string>>;
  reload: () => Promise<void>;
  /** The host field behind a row, per scope. */
  fieldsOf: (row: SettingMeta) => { global?: ScopedSettingField; project?: ScopedSettingField };
  /**
   * Saves one value (`null` clears it: back to the default in the computer's file, back to the computer's value in a project's) and reads the
   * scope again. Resolves true when the host kept it; false leaves the previous value in use and the reason in `rowErrors`.
   */
  write: (row: SettingMeta, scope: Scope, value: string | null) => Promise<boolean>;
  /** The row saved last, and a counter so the status is announced again for the same row. */
  saved: { row: string; n: number } | null;
  /** Why a row's last save was not kept, by row id. */
  rowErrors: Record<string, string>;
  setRowError: (rowId: string, message: string | undefined) => void;
  /** The last save failed: the page says changes may not be kept until one succeeds. */
  failing: boolean;
  /** The sentence the live region reads. */
  announcement: string;
  announce: (message: string) => void;
};

const Context = createContext<SettingsStore | undefined>(undefined);

/**
 * The Settings page's data: the host's fields for both scopes (read by `SettingsFormsProvider`, shared with the panels kept behind Set on a
 * page) and the one way to change them. A change applies at once; nothing is held back for a Save button.
 */
export function SettingsStoreProvider({ children }: { children: ReactNode }) {
  const system = usePort('system');
  const { settings, errors, load } = useSettingsForms();
  const [saved, setSaved] = useState<SettingsStore['saved']>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [failing, setFailing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const counter = useRef(0);

  const reload = useCallback(async () => {
    await Promise.all([load('global'), load('project')]);
  }, [load]);

  const setRowError = useCallback((rowId: string, message: string | undefined) => {
    setRowErrors((current) => {
      if (current[rowId] === message || (message === undefined && !(rowId in current))) return current;
      const rest = without(current, rowId);
      return message === undefined ? rest : { ...rest, [rowId]: message };
    });
  }, []);

  const announce = useCallback((message: string) => setAnnouncement(message), []);

  const write = useCallback(
    async (row: SettingMeta, scope: Scope, value: string | null) => {
      if (!row.field) return false;
      try {
        await system.saveSettings(row.field.tool, scope, { [row.field.key]: value });
        setRowError(row.id, undefined);
        setFailing(false);
        counter.current += 1;
        setSaved({ row: row.id, n: counter.current });
        announce(`${row.label} saved.`);
        await load(scope);
        return true;
      } catch (failure) {
        const message = describeApiError(failure);
        setRowError(row.id, message);
        setFailing(true);
        announce(`${row.label} not saved. ${message}`);
        return false;
      }
    },
    [system, load, setRowError, announce],
  );

  const fieldsOf = useCallback((row: SettingMeta) => ({ global: fieldOf(settings, 'global', row), project: fieldOf(settings, 'project', row) }), [settings]);

  const value = useMemo<SettingsStore>(
    () => ({ settings, readError: errors, reload, fieldsOf, write, saved, rowErrors, setRowError, failing, announcement, announce }),
    [settings, errors, reload, fieldsOf, write, saved, rowErrors, setRowError, failing, announcement, announce],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSettingsStore(): SettingsStore {
  const value = useContext(Context);
  if (!value) throw new Error('useSettingsStore needs a SettingsStoreProvider');
  return value;
}
