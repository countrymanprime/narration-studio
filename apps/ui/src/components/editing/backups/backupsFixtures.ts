import type { ScopedSettingField } from '../../../api/contracts/system';
import type { NarrationApi } from '../../../types';
import { RETENTION_KEY, WINDOW_KEY } from './useBackupSettings';

/** A number setting as the host sends it at project scope, unset there. */
const numberField = (key: string, label: string, value: string, min: number, max: number, step: number, unit: string): ScopedSettingField => ({
  key,
  label,
  kind: 'number',
  choices: [],
  value: '',
  isSet: false,
  effectiveValue: value,
  effectiveSource: 'repo_default',
  number: { min, max, step, unit },
});

/** The two backups settings as the host answers them (tests/fixtures/contracts/settings-project.json): two minutes and seven days. */
export const BACKUP_SETTING_FIELDS: readonly ScopedSettingField[] = [
  numberField(WINDOW_KEY, 'Audio kept either side of a punch or an edit (s)', '120', 10, 300, 10, 's'),
  numberField(RETENTION_KEY, 'Keep backups for (days)', '7', 1, 365, 1, 'days'),
];

/**
 * The mock api with the backups settings in its DAW tool, kept as saved. The mock host's settings do not list them yet, so the tests and stories
 * of this tab add them here.
 */
export function withBackupSettings<A extends Pick<NarrationApi, 'settingsForScope' | 'saveSettings'>>(api: A, values: Record<string, string> = {}): A {
  const saved: Record<string, string> = { ...values };
  const fieldsOf = (): ScopedSettingField[] =>
    BACKUP_SETTING_FIELDS.map((f) => (f.key in saved ? { ...f, value: saved[f.key]!, isSet: true, effectiveValue: saved[f.key]! } : { ...f }));
  const read = api.settingsForScope.bind(api);
  const save = api.saveSettings.bind(api);
  return Object.assign(api, {
    settingsForScope: async (scope: Parameters<NarrationApi['settingsForScope']>[0]) => {
      const fields = await read(scope);
      const own = new Set(BACKUP_SETTING_FIELDS.map((f) => f.key));
      return { ...fields, DAW: [...(fields.DAW ?? []).filter((f) => !own.has(f.key)), ...fieldsOf()] };
    },
    saveSettings: async (...args: Parameters<NarrationApi['saveSettings']>) => {
      const [tool, , values] = args;
      if (tool === 'DAW') for (const [k, v] of Object.entries(values)) if (v !== null && BACKUP_SETTING_FIELDS.some((f) => f.key === k)) saved[k] = v;
      return save(...args);
    },
  });
}
