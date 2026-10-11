// The delivery package's checks on Master & QC (the Studio Next mock's `packageItems`): drawn from the profile's own rules and what was
// measured, so a rule the profile lacks (or has turned off) has no row and nothing here is typed in by hand.
import type { DeliveryProfile, DeliveryRule, MeasureFileResult } from '../../../types';
import { formatLength } from '../../master/deliveryFormat';
import { formatBound, formatRuleValue } from '../../master/deliveryProfile';
import { fileVerdict } from '../../master/fileVerdict';

export type PackageItem = { state: 'ok' | 'bad' | 'wait'; text: string };

/** How the page names a profile: a built-in by its platform ("ACX"), a custom profile by the name the narrator gave it. */
export const profileName = (profile: DeliveryProfile): string => (profile.builtIn ? profile.platform : profile.name);

/** The retail sample is a file of its own; the book's length and consistency checks leave it out. */
export const isSample = (file: MeasureFileResult): boolean => /sample/i.test(file.name);

const ruleFor = (profile: DeliveryProfile, metric: string): DeliveryRule | undefined => profile.rules.find((rule) => rule.metric === metric && !rule.off);

const measured = (files: readonly MeasureFileResult[]) => files.filter((file) => file.status === 'measured' && file.report);

/** Whether the host judged any of these rules as not met in any file. */
const missed = (files: readonly MeasureFileResult[], rules: readonly (DeliveryRule | undefined)[]): boolean =>
  files.some((file) => file.rules.some((result) => result.status === 'not_met' && rules.some((rule) => rule?.id === result.ruleId)));

const minutes = (seconds: number): string => String(Number((seconds / 60).toFixed(1)));

export function packageItems(profile: DeliveryProfile | undefined, files: readonly MeasureFileResult[]): PackageItem[] {
  if (!profile) return [];
  const items: PackageItem[] = [];
  const oneFile = ruleFor(profile, 'one_section_per_file');
  if (oneFile) items.push({ state: 'ok', text: 'Chapters are one file each' });

  const length = ruleFor(profile, 'duration_seconds');
  if (length?.max != null) {
    const longest = Math.max(
      0,
      ...measured(files)
        .filter((file) => !isSample(file))
        .map((file) => file.report!.duration_seconds),
    );
    items.push({ state: longest <= length.max ? 'ok' : 'bad', text: `Every file under ${minutes(length.max)} min` });
  }

  const retail = ruleFor(profile, 'retail_sample_seconds');
  const sample = measured(files).find(isSample);
  if (retail?.max != null && sample) {
    const seconds = sample.report!.duration_seconds;
    items.push({ state: seconds <= retail.max ? 'ok' : 'bad', text: `Retail sample ${formatLength(seconds)} (up to ${minutes(retail.max)} min)` });
  }

  const channels = ruleFor(profile, 'channels');
  const rate = ruleFor(profile, 'sample_rate');
  const format = ruleFor(profile, 'mp3_format');
  const parts = [
    channels && channels.oneOf.map((value) => formatRuleValue(channels, value)).join(' or '),
    rate && formatBound(rate),
    format && formatBound(format),
  ].filter((part): part is string => !!part);
  if (parts.length > 0) items.push({ state: missed(files, [channels, rate, format]) ? 'bad' : 'ok', text: parts.join(' · ') });
  return items;
}

/** The files that fail, with how many of their rules were missed, and how many files have no measurement yet. */
export function packageCounts(files: readonly MeasureFileResult[]) {
  const failing = files
    .filter((file) => fileVerdict(file) === 'fail')
    .map((file) => ({ name: file.name, checks: file.rules.filter((result) => result.status === 'not_met').length }));
  return { failing, notReady: files.filter((file) => file.status !== 'measured').length };
}
