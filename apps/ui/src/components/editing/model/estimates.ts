/**
 * The fixed inputs behind choosing between takes (the Studio Next mock's `config/estimates.ts`). They live here and nowhere else.
 */

/** The longest gap the cleanup leaves, in seconds. A placeholder until the real limit is decided. */
export const DEAD_AIR_LIMIT = 1.2;
/** Takes whose levels are further apart than this (dB) cannot be compared by loudness, noise or clarity until they are normalised. */
export const LEVEL_TOLERANCE_DB = 1.5;
/** The level normalising brings a take to (RMS, dB full scale), inside the ACX window. */
export const TARGET_RMS_DB = -20.5;
/** How far ahead of the next take the best one must score (0 to 1) for full confidence. */
export const SUGGEST_MARGIN_FULL = 0.12;
/** Confidence lost for each trim step (white space, breaths) still to do: pauses and breaths colour what the measurements say. */
export const UNTRIMMED_PENALTY = 0.2;
/** Confidence at or above these reads as High and Medium; below is Low. */
export const CONFIDENCE_HIGH = 0.7;
export const CONFIDENCE_MEDIUM = 0.4;
/** What a take's score is made of: words read as written, how clear it is, how quiet its noise floor is. */
export const SCORE_WEIGHTS = { matched: 0.5, clarity: 0.3, noise: 0.2 } as const;
/** The noise floor range scored from 0 (worst) to 1 (best), in dB. */
export const NOISE_RANGE_DB = { worst: -40, best: -70 } as const;
