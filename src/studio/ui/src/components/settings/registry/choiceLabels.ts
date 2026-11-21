import { rowOfField } from './rows';
import type { SettingMeta } from './types';

/**
 * The words of a host choice that has no registry row, by `Tool.key`, or `Tool.*` for every choice of a tool: the "Set on a page" panels and
 * the pages' options dialogs draw these. A choice with a row is worded by the row's `options`, wherever it is drawn.
 */
const PAGE_FIELD_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // The preview suggestion's two presets: a clean, varied, shareable excerpt, or a passage worth a second look.
  'Preview.preset': { sample: 'Sample', spot_check: 'Spot check' },
  // A readiness signal's two policies: it must hold before a stage is suggested, or it is not looked at.
  'StageRecommendations.*': { required: 'Required', ignored: 'Ignored' },
};

/**
 * The name of a value nobody listed words for, which is how a stored value the host no longer offers reads in every control: an empty one
 * is "Not set"; with the field's unit, a whole number gets the unit and anything else is said to be invalid; otherwise the value itself.
 */
export function unlistedChoiceLabel(value: string, unit?: string): string {
  if (value === '') return 'Not set';
  if (unit) return /^\d+$/.test(value) ? `${value} ${unit}` : `${value} (invalid)`;
  return value;
}

/** The label of a choice of a registry row: the registry's word, else `unlistedChoiceLabel`. */
export const choiceLabel = (row: SettingMeta, value: string): string => row.options?.[value]?.label || unlistedChoiceLabel(value, row.unit);

/**
 * The label of a choice of the host field `tool`.`key`, wherever it is drawn (component-selection CS-E10): a Settings row, a "Set on a page"
 * panel and an options dialog say the same words for the same value, a stored value the host no longer offers included.
 */
export function fieldChoiceLabel(tool: string | undefined, key: string, value: string): string {
  const row = rowOfField(tool, key);
  if (row) return choiceLabel(row, value);
  return PAGE_FIELD_LABELS[`${tool}.${key}`]?.[value] ?? PAGE_FIELD_LABELS[`${tool}.*`]?.[value] ?? unlistedChoiceLabel(value);
}
