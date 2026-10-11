// The interaction feedback rows for the extraction call sites (see interactionFeedback.catalog.ts for what a row says). Starts empty; the extraction slices append their rows.
import type { FeedbackRow } from './row';

export const extractionFeedback: Record<string, FeedbackRow> = {};
