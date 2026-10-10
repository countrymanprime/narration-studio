/**
 * The fixed inputs behind every estimate in the app. They stand in for the narrator's own numbers until the app can
 * measure them (time tracking is not built), so they live here and nowhere else; nothing derives them from a time log.
 */

/** Standard words per finished hour. */
export const WPH = 9300
/** How many chapters must have a measured finished length before the narrator's own rate is worked out. */
export const MIN_OWN_RATE_CHAPTERS = 3
/** Work-hours per finished hour, per stage. */
export const RATIO = { rec: 3.0, edit: 2.1, proof: 0.94 }
/** Work-hours the narrator does per day. */
export const PACE = 1.5
/** Work-hours to redo one pickup in a pickup session. */
export const PICKUP_HOURS = 0.06
/** The length of the first-minutes checkpoint some delivery profiles ask for, in finished minutes. */
export const CHECKPOINT_MINUTES = 15
/** Days left at or under which an unfinished deadline reads as a warning. */
export const WARN_DAYS = 7

/** The longest gap the cleanup leaves, in seconds. A placeholder until the real limit is decided. */
export const DEAD_AIR_LIMIT = 1.2

/* ---- Editing: choosing between takes ---- */
/** Takes whose levels are further apart than this (dB) cannot be compared by loudness, noise or clarity until they are normalised. */
export const LEVEL_TOLERANCE_DB = 1.5
/** The level normalising brings a take to (RMS, dB full scale), inside the ACX window. */
export const TARGET_RMS_DB = -20.5
/** How far ahead of the next take the best one must score (0 to 1) for full confidence. */
export const SUGGEST_MARGIN_FULL = 0.12
/** Confidence lost for each trim step (white space, breaths) that is still to do: pauses and breaths colour what the measurements say. */
export const UNTRIMMED_PENALTY = 0.2
/** Confidence at or above these reads as High and Medium; below is Low. */
export const CONFIDENCE_HIGH = 0.7
export const CONFIDENCE_MEDIUM = 0.4
/** What a take's score is made of: words read as written, how clear it is, how quiet its noise floor is. */
export const SCORE_WEIGHTS = { matched: 0.5, clarity: 0.3, noise: 0.2 }
/** The noise floor range scored from 0 (worst) to 1 (best), in dB. */
export const NOISE_RANGE_DB = { worst: -40, best: -70 }

/** The recogniser's score under which a word in the script is drawn as unsure (Editing). Bulk actions skip such words. */
export const LOW_CONFIDENCE = 0.7

/** How long the mock recording check takes between two progress steps (ms), and how many percent each step adds. */
export const CHECK_STEP_MS = 400
export const CHECK_STEP_PCT = 20
