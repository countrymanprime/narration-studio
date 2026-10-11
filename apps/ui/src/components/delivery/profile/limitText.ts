// What the profile card writes for a delivery profile's rules (ADR 0179): which rules are a per-chapter limit and which are a
// file-format row, how a bound reads as text or as an edit box, and the edit the host expects back. The wording and numbers come
// from `master/deliveryProfile.ts`; nothing here judges a file.
import type { DeliveryProfile, DeliveryProfileEdit, DeliveryRule } from '../../../types';
import { formatBound } from '../../master/deliveryProfile';

/** The metrics the mock's "Files" group shows; every other measured per-file rule is a "Checks on every chapter" limit. */
const FILE_FORMAT_METRICS = new Set(['mp3_format', 'sample_rate', 'channels', 'duration_seconds']);

/** A rule the narrator can move: a measured per-file rule with a lowest or highest and no fixed set of values. */
const isAdjustable = (rule: DeliveryRule): boolean =>
  rule.scope === 'file' && rule.checkedBy === 'measured' && (rule.min !== null || rule.max !== null) && rule.oneOf.length === 0;

/** The per-file rules that read as a limit with a lowest and a highest. */
export const limitRules = (profile: DeliveryProfile): DeliveryRule[] =>
  profile.rules.filter((rule) => isAdjustable(rule) && !FILE_FORMAT_METRICS.has(rule.metric));

/** The rules shown as file-format rows: the file format, sample rate, channels and the longest file. */
export const formatRules = (profile: DeliveryProfile): DeliveryRule[] => profile.rules.filter((rule) => FILE_FORMAT_METRICS.has(rule.metric));

/** A limit as a page reads it: the rule id, its name, its unit and its two bounds. */
export type Limit = { id: string; label: string; unit: string; min: number | null; max: number | null };

/** The profile's limits, which the Master and Delivery pages both judge against so a custom edit moves both. A rule turned off has none. */
export function limitsOf(profile: DeliveryProfile): Limit[] {
  return profile.rules
    .filter((rule) => isAdjustable(rule) && !rule.off)
    .map((rule) => ({ id: rule.id, label: rule.label, unit: rule.unit, min: rule.min, max: rule.max }));
}

/** The text of a rule's limit in a built-in profile, or "Off" for a rule a custom profile turned off. */
export const limitText = (rule: DeliveryRule): string => (rule.off ? 'Off' : formatBound(rule));

/** A length is edited in minutes; every other bound in the rule's own unit. */
export const shownUnit = (rule: DeliveryRule): string => (rule.metric === 'duration_seconds' ? 'min' : rule.unit);
export const toShown = (rule: DeliveryRule, value: number): string => String(rule.metric === 'duration_seconds' ? Number((value / 60).toFixed(4)) : value);

/** What was typed as a bound, in the rule's own unit; undefined when it is not a number, so the box reverts. */
export function fromShown(rule: DeliveryRule, text: string): number | undefined {
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value)) return undefined;
  return rule.metric === 'duration_seconds' ? value * 60 : value;
}

/** The edit the host expects: every rule with the ids the host gave, the one change applied, never a retyped id. */
export function editOf(profile: DeliveryProfile, change: { name?: string; rule?: { id: string; side: 'min' | 'max'; value: number } }): DeliveryProfileEdit {
  return {
    id: profile.id,
    name: change.name ?? profile.name,
    rules: profile.rules.map((rule) => ({
      id: rule.id,
      off: rule.off ?? false,
      min: change.rule?.id === rule.id && change.rule.side === 'min' ? change.rule.value : rule.min,
      max: change.rule?.id === rule.id && change.rule.side === 'max' ? change.rule.value : rule.max,
    })),
  };
}
