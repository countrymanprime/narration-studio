/**
 * The fixed inputs behind every estimate on the Schedule (ADR 0801). They stand in for the narrator's own numbers until the app can
 * measure them, so they live here and nowhere else; nothing derives them from a time log. The Production plan chart and the
 * target-pace popover import them from here instead of copying them.
 */

/** Standard words per finished hour. */
export const WPH = 9300;
/** Work-hours per finished hour, per stage. */
export const RATIO = { rec: 3.0, edit: 2.1, proof: 0.94 } as const;
/** Work-hours the narrator does per day. */
export const PACE = 1.5;
/** Work-hours to redo one pickup in a pickup session. */
export const PICKUP_HOURS = 0.06;
/** The length of the first-minutes checkpoint some delivery profiles ask for, in finished minutes. */
export const CHECKPOINT_MINUTES = 15;
/** Days left at or under which an unfinished deadline reads as a warning. */
export const WARN_DAYS = 7;
