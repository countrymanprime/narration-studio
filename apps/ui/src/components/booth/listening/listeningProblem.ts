import type { TeleprompterSession } from '../useTeleprompterSession';

type Session = Pick<TeleprompterSession, 'error' | 'canStart' | 'startReason' | 'device' | 'devicesLoading' | 'settingsLoaded'> & {
  /** The host's own state of the session: a session that ended in an error (a microphone unplugged mid-take) says so here, not in `error`. */
  host?: Pick<TeleprompterSession['host'], 'phase' | 'message'>;
};

const NO_MIC = 'Choose a microphone first.';

/**
 * Why the text cannot follow the narrator's voice, for the Booth's footer, or nothing when it can. A take still records without
 * it; only the following stops. Nothing is said while the microphones and the saved choice are still being read.
 */
export function listeningProblem(session: Session): string | undefined {
  if (session.error) return `The text cannot follow your voice: ${session.error}`;
  if (session.host?.phase === 'error')
    return `The text cannot follow your voice: ${session.host.message.trim() || 'the listening session ended with an error.'}`;
  if (session.canStart || session.devicesLoading || !session.settingsLoaded) return undefined;
  if (session.device === '' && session.startReason === NO_MIC) return 'Choose the microphone the Booth listens to in Levels, so the text follows your voice.';
  return `The text cannot follow your voice: ${session.startReason}`;
}
