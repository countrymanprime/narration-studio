import { wholeNumberRange } from '../numberSetting';
import { ROWS } from './rows';
import type { ChoiceControl } from './types';

/**
 * The control of a host choice that has no registry row, by `Tool.key`, or `Tool.*` for every choice of a tool. The "Set on a page"
 * panels and the pages' options dialogs draw these.
 */
export const PAGE_FIELD_CONTROLS: Readonly<Record<string, ChoiceControl>> = {
  'Preview.preset': 'segmented',
  // One key per readiness signal a provider declares, each Required or Ignored.
  'StageRecommendations.*': 'segmented',
};

/**
 * Choices whose list grows, by `Tool.key` (component-selection CS-E2). It is the only reason a choice of five or fewer may be a `select`:
 * a group that fits today would not once the list is longer.
 */
export const GROWS: ReadonlySet<string> = new Set([
  // The Whisper models: one more with each model the transcription sidecar learns to load.
  'TranscriptCompare.model_size',
  'RecordingCoverage.cascade_first_pass_model',
  'RecordingCoverage.cascade_recheck_model',
  'RecordingCoverage.background_first_pass_model',
  // One per voice in config/tts-assets.json.
  'Piper.tts_voice_id',
]);

/**
 * What fits a `segmented` group on one line in a 960 px window, in characters: the labels together, plus `SEGMENT_COST` for each segment's own
 * padding. Measured (`tests/visual/settings-segmented-fit.spec.ts`): a changed row in Advanced leaves the group 177 px beside Reset and Saved,
 * the group's frame takes 8 px, a segment 26 px and a character of a label about 6.6 px.
 */
export const SEGMENTED_LABEL_BUDGET = 25;
export const SEGMENT_COST = 4;

/** The most options a group shows at once (component-selection CS-E1). */
const GROUP_MAX = 5;

/**
 * The control a host choice is drawn with, wherever it is drawn: the registry row of that field says, else `PAGE_FIELD_CONTROLS`. A field
 * neither names is a `select`, which shows any list; `choiceControls.test.ts` keeps that from being reached by a field the app draws.
 */
export function choiceControlFor(tool: string | undefined, key: string): ChoiceControl {
  const row = ROWS.find((candidate) => candidate.field?.tool === tool && candidate.field?.key === key);
  return row?.control ?? PAGE_FIELD_CONTROLS[`${tool}.${key}`] ?? PAGE_FIELD_CONTROLS[`${tool}.*`] ?? 'select';
}

const words = (label: string): number => label.trim().split(/\s+/).length;

const groupProblem = (count: number): string | undefined =>
  count < 2 || count > GROUP_MAX ? `a group shows 2 to ${GROUP_MAX} options, and this has ${count}` : undefined;

function segmentedProblem(labels: readonly string[], grows: boolean): string | undefined {
  if (grows) return 'a list that grows is a select: a longer one would not fit a segmented group';
  const long = labels.find((label) => words(label) > 2);
  if (long) return `a segment's label is two words at most, and "${long}" is longer: use radio`;
  const size = labels.reduce((sum, label) => sum + label.length + SEGMENT_COST, 0);
  return size > SEGMENTED_LABEL_BUDGET
    ? `the labels take ${size} characters, counting ${SEGMENT_COST} for each segment, and a segmented group fits ${SEGMENTED_LABEL_BUDGET}: use radio`
    : undefined;
}

const PROBLEM: Record<ChoiceControl, (choice: { values: readonly string[]; labels: readonly string[]; grows: boolean }) => string | undefined> = {
  segmented: ({ labels, grows }) => groupProblem(labels.length) ?? segmentedProblem(labels, grows),
  radio: ({ labels }) => groupProblem(labels.length),
  select: ({ labels, grows }) =>
    labels.length > GROUP_MAX || grows ? undefined : `a fixed list this short (${labels.length}) is a group, not a select: use segmented or radio`,
  number: ({ values }) =>
    values.length <= GROUP_MAX || !wholeNumberRange(values) ? `a number box is for more than ${GROUP_MAX} consecutive whole numbers` : undefined,
};

/** Why `control` is the wrong control for a choice with these values, labels and growth (component-selection CS-E1 to CS-E6), or undefined when it fits. */
export function checkChoiceControl(choice: {
  control: ChoiceControl;
  values: readonly string[];
  labels: readonly string[];
  grows: boolean;
}): string | undefined {
  return PROBLEM[choice.control](choice);
}
