import type { DawCapabilities } from '../api/contracts/daw';
import { capitalised, noAnswerSentence } from '../studio/dawNames';
import { reasonSentence } from '../api/errorMessage';
import { within } from '../within';

// The playback port (docs/design/editing-daw-transport-sync.md, Who plays): every place that plays audio asks an ordered list of
// providers, the linked DAW's first and the app's own player last, and `playThrough` takes the first that is ready and plays. A
// provider says what it can do through the DAW's capability fields only; this file never names a DAW or branches on its kind.

/** What a provider says before it is asked. `why` is said when another provider plays instead; null keeps it quiet (an engine that
 * never declared the capability is not a fallback). `wait`: it has not answered yet, so nothing plays and `why` is said. */
export type Readiness = { ready: true } | { ready: false; why: string | null; wait?: boolean };

/** What one provider's play did. `final`: nothing else may play either (the DAW is recording), and `why` says so. */
export type PlayAttempt = { played: true } | { played: false; why: string; final?: boolean };

/** Told to a provider's play: `late()` turns true once `playThrough` stopped waiting for it (the deadline passed), so an answer that comes after that
 * must undo what it started in the DAW instead of playing beside the provider that took its place. */
export interface PlayContext {
  late: () => boolean;
}

export interface PlaybackProvider<R> {
  /** Who plays, as a notice names it: the DAW's name, or `APP`. */
  readonly name: string;
  readiness(request: R): Readiness;
  play(request: R, context: PlayContext): PlayAttempt | Promise<PlayAttempt>;
}

export interface PlayRule {
  /** The action needs the DAW's own effects, routing or project state: only the first provider may play it. */
  dawSpecific?: boolean;
  /** False once the narrator stopped or asked for something else while a provider was being asked: nothing more is tried. */
  stillWanted?: () => boolean;
  /** Asked before a later provider plays: a sentence keeps the room quiet (the DAW is recording) and nothing plays. */
  keepQuiet?: () => Promise<string | null>;
  /** How long a provider's play, or `keepQuiet`, may take before it counts as not answered: a click that plays is never silent for long (`PLAY_DEADLINE_MS`). Absent: no limit. */
  deadlineMs?: number;
}

/** Who played (null: nothing did), what to tell the narrator, if anything, and the reasons of the providers passed over before it. */
export type PlayOutcome = { by: string | null; notice: string | null; passed: readonly string[] };

export const APP = 'the app';

/** What a DAW that is recording says in place of a play: the one sentence every page shows for it. */
export const recordingSentence = (name: string): string => `${capitalised(name)} is recording, so nothing plays. Stop recording first.`;

/** A page's read of the DAW's capabilities: whether the last one failed, and a read again. */
export interface DawRead {
  failed: boolean;
  retry: () => Promise<void>;
}

export const CHECKING = 'Checking whether the DAW can play this. Try again in a moment.';
export const READ_FAILED = 'The app could not ask the DAW what it can do; it is asking again.';

/** The reasons as sentences (a capital, a full stop: the shared `reasonSentence`), so "Played in the app instead." does not run into one. */
const join = (whys: readonly string[]): string => whys.map(reasonSentence).join(' ');

/**
 * The selection rule. Providers are tried in order: one that is not ready is passed over, its reason kept; one that fails is passed
 * over the same way. The first that plays wins, and when an earlier one was passed over the notice says why and who played instead. A
 * first provider that is still waiting plays nothing (a DAW that can play is never bypassed before it answers), and a DAW-specific
 * action never goes past the first provider.
 */
export async function playThrough<R>(providers: readonly PlaybackProvider<R>[], request: R, rule: PlayRule = {}): Promise<PlayOutcome> {
  const tried = rule.dawSpecific ? providers.slice(0, 1) : providers;
  const whys: string[] = [];
  // With a deadline, the DAW-is-recording read starts with the DAW's play and shares its one budget: a DAW that answers neither hands the note to the
  // app after 3 s in all, and the read still has the whole 3 s to answer, so a DAW that records is heard.
  const quietRead =
    rule.keepQuiet && rule.deadlineMs !== undefined && tried.length > 1
      ? within(
          rule.keepQuiet().catch(() => null),
          rule.deadlineMs,
        )
      : undefined;
  for (const [index, provider] of tried.entries()) {
    const ready = provider.readiness(request);
    if (!ready.ready) {
      if (ready.wait && index === 0) return { by: null, notice: ready.why, passed: whys };
      if (ready.why) whys.push(ready.why);
      continue;
    }
    if (index > 0 && rule.keepQuiet) {
      // A read of the DAW's state that never answers does not hold the app back (as one that fails does not).
      const asked = quietRead ? await quietRead : { value: await rule.keepQuiet() };
      const quiet = asked?.value ?? null;
      if (quiet) return { by: null, notice: quiet, passed: whys };
    }
    if (rule.stillWanted && !rule.stillWanted()) return { by: null, notice: null, passed: whys };
    let late = false;
    const playing = Promise.resolve(provider.play(request, { late: () => late }));
    const answered = rule.deadlineMs === undefined ? { value: await playing } : await within(playing, rule.deadlineMs);
    if (!answered) late = true;
    const attempt: PlayAttempt = answered ? answered.value : { played: false, why: noAnswerSentence(provider.name) };
    if (attempt.played) return { by: provider.name, notice: whys.length ? `${join(whys)} Played in ${provider.name} instead.` : null, passed: whys };
    if (attempt.final) return { by: null, notice: attempt.why, passed: whys };
    whys.push(attempt.why);
    if (rule.stillWanted && !rule.stillWanted()) return { by: null, notice: null, passed: whys };
  }
  const said = rule.dawSpecific && providers[0] ? [...whys, `Nothing played: this can only be done in ${providers[0].name}.`] : whys;
  return { by: null, notice: said.length ? join(said) : null, passed: whys };
}

/**
 * Whether the linked DAW can play through `capability` now, from what it declared: not answered yet (wait, or `READ_FAILED` when the read
 * failed), never declared (quiet, so an engine without it plays in the app as its normal path), declared but not usable now (its own
 * sentence), or ready. A provider adds its own runtime checks after this one.
 */
export function dawReadiness(caps: DawCapabilities | null, capability: string, readFailed = false): Readiness {
  if (!caps) return readFailed ? { ready: false, why: READ_FAILED } : { ready: false, why: CHECKING, wait: true };
  const support = caps.capabilities[capability];
  if (!support || (support.level !== 'experimental' && support.level !== 'supported')) return { ready: false, why: null };
  if (!caps.reachable || !support.available) return { ready: false, why: support.message ?? `${caps.daw} is not answering.` };
  return { ready: true };
}

/**
 * `dawReadiness` for a click that plays: a DAW that has not yet said what it can do is asked at once, so no check stands between the click and
 * the sound (owner rule on #4043); it plays, or it refuses and the app plays with the reason. A read that failed is still said and asked again.
 */
export function playReadiness(caps: DawCapabilities | null, capability: string, readFailed = false): Readiness {
  return caps === null && !readFailed ? { ready: true } : dawReadiness(caps, capability, readFailed);
}

/** `keepQuiet` for a page with a linked DAW: a DAW that is recording keeps the room quiet. A read that fails does not hold the play back. */
export function quietWhileRecording(projectState: () => Promise<{ playState: string }>, name: string): () => Promise<string | null> {
  return async () => {
    try {
      return (await projectState()).playState === 'recording' ? recordingSentence(name) : null;
    } catch {
      return null;
    }
  };
}
