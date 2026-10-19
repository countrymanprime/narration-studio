// The delivery package's checks on Master & QC (the Studio Next mock's `packageItems`): drawn from the profile's own rules and what was
// measured, so a rule the profile lacks (or has turned off) has no row and nothing here is typed in by hand.
import type { DeliveryProfile, DeliveryRule, ManuscriptChapter, MeasureFileResult } from '../../../types';
import type { CreditsEntry } from '../../credits/creditsEntries';
import { chapterStates, listedChapters, readinessCounts, stateOf, type ChapterState } from '../../delivery/page/chapterStates';
import { chapterOfFile } from '../../master/chapterFile';
import { formatLength } from '../../master/deliveryFormat';
import { formatBound, formatRuleValue } from '../../master/deliveryProfile';

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

/** The profile's range for the retail sample, as the mock writes it: "1 to 5 min", "up to 5 min" or "at least 1 min". */
function sampleRange(rule: DeliveryRule): string {
  if (rule.min != null && rule.max != null) return `${minutes(rule.min)} to ${minutes(rule.max)} min`;
  return rule.max != null ? `up to ${minutes(rule.max)} min` : `at least ${minutes(rule.min!)} min`;
}

/** The credits files Delivery counts as chapters, read the way its page reads them. */
type CreditsEntries = { opening?: CreditsEntry; closing?: CreditsEntry };

export function packageItems(profile: DeliveryProfile | undefined, files: readonly MeasureFileResult[]): PackageItem[] {
  if (!profile) return [];
  const items: PackageItem[] = [];
  // Nothing measured: every check is waiting, never passing.
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
  if (retail && (retail.min != null || retail.max != null) && sample) {
    const seconds = sample.report!.duration_seconds;
    const fits = (retail.min == null || seconds >= retail.min) && (retail.max == null || seconds <= retail.max);
    items.push({ state: fits ? 'ok' : 'bad', text: `Retail sample ${formatLength(seconds)} (${sampleRange(retail)})` });
  }

  const channels = ruleFor(profile, 'channels');
  const rate = ruleFor(profile, 'sample_rate');
  const format = ruleFor(profile, 'mp3_format');
  const parts = [
    channels && channels.oneOf.map((value) => formatRuleValue(channels, value)).join(' or '),
    rate && formatBound(rate),
    format && formatBound(format),
  ].filter((part): part is string => !!part);
  // The MP3's format cannot be judged from a WAV render: a format the host never judged is waiting, not passing.
  const judged = (statuses: readonly string[]) =>
    files.some((file) => file.rules.some((result) => result.ruleId === format?.id && statuses.includes(result.status)));
  const formatUnjudged = !!format && judged(['not_checked', 'not_measurable']) && !judged(['met', 'not_met']);
  if (parts.length > 0) {
    const state = missed(files, [channels, rate, format]) ? 'bad' : formatUnjudged ? 'wait' : 'ok';
    items.push({ state, text: parts.join(' · ') + (state === 'wait' ? ' (the MP3 format is checked on the MP3 you upload)' : '') });
  }
  return anyMeasured(files) ? items : items.map((item): PackageItem => ({ ...item, state: 'wait' }));
}

/**
 * The rows Master & QC's package card counts, from the same judgement Delivery's "Before you build" list makes: one per chapter
 * (`chapterStates`), so a chapter with no file is not ready, plus a row per measured file no chapter claims (a file named for
 * nothing in the manuscript still fails the package if it fails its checks).
 */
function packageStates(chapters: readonly ManuscriptChapter[], credits: CreditsEntries, files: readonly MeasureFileResult[]): ChapterState[] {
  const listed = listedChapters(chapters, credits);
  const stray = files.filter((file) => !isSample(file) && !chapterOfFile(file, listed)).map((file) => stateOf({ id: file.path, name: file.name }, file));
  return [...chapterStates(listed, files), ...stray];
}

/** The rows that fail, with their sentence ("Chapter 04.wav fails 2 checks"), and how many are not ready. */
export function packageCounts(chapters: readonly ManuscriptChapter[], credits: CreditsEntries, files: readonly MeasureFileResult[]) {
  const states = packageStates(chapters, credits, files);
  const { wait } = readinessCounts(states);
  return {
    failing: states.filter((state) => state.kind === 'bad').map((state) => `${state.name} ${state.text.toLowerCase()}`),
    notReady: wait,
  };
}

/** Whether any file has a measurement behind it: with none, no package check has been tried and none can read as passing. */
const anyMeasured = (files: readonly MeasureFileResult[]): boolean => measured(files).length > 0;
