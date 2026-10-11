// The interaction feedback rows for the Script call sites (see interactionFeedback.catalog.ts for what a row says). Starts empty; the Script slices append their rows.
import type { FeedbackRow } from './row';

export const scriptFeedback: Record<string, FeedbackRow> = {};
