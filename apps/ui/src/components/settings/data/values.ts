import type { Scope, ScopedSettingField } from '../../../types';
import type { SettingMeta } from '../registry/types';

/** The host's answer for each scope: tool, then fields. Absent until read. */
export type ReadSettings = Partial<Record<Scope, Record<string, ScopedSettingField[]>>>;

/** The host field a row edits in `scope`, or undefined (a custom row, a scope not read yet, or a host that does not know the field). */
export function fieldOf(settings: ReadSettings, scope: Scope, row: SettingMeta): ScopedSettingField | undefined {
  if (!row.field) return undefined;
  return settings[scope]?.[row.field.tool]?.find((field) => field.key === row.field!.key);
}

/** The computer's value: what is stored in the global file, else the default. */
export const computerValue = (row: SettingMeta, global: ScopedSettingField | undefined): string => (global?.isSet ? global.value : row.def);

/** This project's own value for a row that allows one, or undefined while the project follows the computer. */
export const overrideValue = (row: SettingMeta, project: ScopedSettingField | undefined): string | undefined =>
  row.scope === 'both' && project?.isSet ? project.value : undefined;

/** The value this project uses. */
export const projectValue = (row: SettingMeta, global: ScopedSettingField | undefined, project: ScopedSettingField | undefined): string =>
  overrideValue(row, project) ?? computerValue(row, global);

/** The computer's value differs from the default. */
export const isChanged = (row: SettingMeta, global: ScopedSettingField | undefined): boolean => Boolean(global?.isSet) && global!.value !== row.def;

/** Changed on this computer, or overridden by this project. */
export const isAnyChanged = (row: SettingMeta, global: ScopedSettingField | undefined, project: ScopedSettingField | undefined): boolean =>
  isChanged(row, global) || overrideValue(row, project) !== undefined;

/** The label of a choice: the registry's word, else what the host sent. */
export const choiceLabel = (row: SettingMeta, value: string): string => row.options?.[value]?.label ?? (value === '' ? 'Not set' : value);
