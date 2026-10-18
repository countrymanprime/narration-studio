import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import { NOT_WHILE_RECORDING, type SamplePlayerStatus } from '../../voicesamples/samplePlayerStore';
import { useSamplePlayer } from '../../voicesamples/useSamplePlayer';
import { useVoiceSamples } from '../../voicesamples/useVoiceSamples';
import { cantTellSentence, PAUSE_GRACE_MS } from './boothSamples';

export type BoothSamplesOptions = {
  /** The Story Bible's characters: a speaker label is a character's canonical name. */
  characters: readonly GuideEntity[];
  /** The speakers who speak in this chapter, for the picker's first group. */
  inChapter: ReadonlySet<string>;
  /** `control.recording`: a take is recording. */
  recording: boolean;
  /** Whether the DAW has gone quiet, so the page cannot tell if a take is recording, and when it was last heard. */
  recorder: { unknown: boolean; checkedAt: number | null; checkAgain: () => void };
  /** The teleprompter session: whether one is running, whether its listening is paused, and how to pause it or resume it. */
  listening: { active: boolean; paused: boolean; pause: (paused: boolean) => void };
  /** Where a refusal or a failed load is said. */
  notify: (text: string, tone?: 'error') => void;
};

export type BoothSamples = {
  /** The list has been asked for and answered (or failed); until then no speaker has a sample and nothing is refused. */
  loaded: boolean;
  /** What a failed read said, when the last read failed; the last list that was read stays. */
  readProblem: string | undefined;
  inChapter: ReadonlySet<string>;
  /** A speaker's samples in the host's order (the primary first), including a sample whose clip is missing. */
  samplesOf: (speaker: string) => VoiceSample[];
  /** The sample the quick play uses: the primary when its clip is there, otherwise the first one that can play. */
  primaryOf: (speaker: string) => VoiceSample | undefined;
  /** Why a sample cannot play now (a take is recording, or the DAW cannot be heard), or undefined. */
  refusal: string | undefined;
  /** True when `refusal` is about the DAW having gone quiet, which the narrator can check again. */
  cantTell: boolean;
  checkAgain: () => void;
  /** Plays a sample (pausing a listening session first), or says why it cannot. A press on the one playing restarts it. */
  play: (sample: VoiceSample, speaker: string) => void;
  playPrimary: (speaker: string) => void;
  stop: () => void;
  /** The sample that is waiting to start, loading or playing. */
  activeId: string | null;
  statusOf: (id: string) => SamplePlayerStatus;
  progressOf: (id: string) => number;
  /** What the polite live region says. */
  announcement: string;
  /** Listening is paused because a sample is playing, not because the narrator paused it. */
  listeningPaused: boolean;
};

/**
 * The Booth's voice samples: which samples each speaker has, the guards (not while a take records, not while the DAW cannot be heard), the one shared
 * player, and the pause of a listening session while a sample plays. The pause follows the phase 5 spike (docs/prds/character-voice-samples.prd.md,
 * the decisions log): when a session is running and not paused, a play asks it to pause, starts the sound one chunk later, and asks it to resume one chunk
 * after the sound ends, stops, fails or is replaced. It resumes only a pause it made: a session the narrator paused stays paused, a resume by the narrator during
 * the sample is honoured, and a session that has ended is left alone. The page that paused is the one that resumes, at once when it unmounts.
 */
export function useBoothSamples(options: BoothSamplesOptions): BoothSamples {
  const { characters, inChapter, recording, recorder, listening } = options;
  const { read } = useVoiceSamples();
  const list = read.status === 'ready' ? read.samples : read.status === 'failed' ? read.samples : undefined;
  const player = useSamplePlayer({
    guard: { recording, ...(recorder.unknown ? { cantTell: cantTellSentence(recorder.checkedAt, Date.now()) } : {}) },
    notify: options.notify,
  });
  const live = useRef({ ...options, player });
  useEffect(() => {
    live.current = { ...options, player };
  });

  const idOf = useMemo(() => new Map(characters.map((entity) => [entity.canonical_name, entity.id])), [characters]);
  const samplesOf = useCallback(
    (speaker: string): VoiceSample[] => {
      const id = idOf.get(speaker);
      return id && list ? list.samples.filter((sample) => sample.characterId === id) : [];
    },
    [idOf, list],
  );
  const primaryOf = useCallback(
    (speaker: string): VoiceSample | undefined => {
      const mine = samplesOf(speaker).filter((sample) => sample.clipState === 'ok');
      return mine.find((sample) => sample.primary) ?? mine[0];
    },
    [samplesOf],
  );

  const refusal = recording ? NOT_WHILE_RECORDING : recorder.unknown ? cantTellSentence(recorder.checkedAt, Date.now()) : undefined;

  // The pause of a listening session. `pausedByUs` is the page's own pause; `pauseSentAt` when it was asked; `seenPaused` that the host's state has said so.
  const [waiting, setWaiting] = useState<string | null>(null);
  const [listeningPaused, setListeningPaused] = useState(false);
  const generation = useRef(0);
  const pausedByUs = useRef(false);
  const pauseSentAt = useRef(0);
  const seenPaused = useRef(false);
  const startTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stopOwing = () => {
    pausedByUs.current = false;
    seenPaused.current = false;
    setListeningPaused(false);
  };

  const play = useCallback((sample: VoiceSample, speaker: string) => {
    const now = live.current;
    const mine = ++generation.current;
    clearTimeout(startTimer.current);
    clearTimeout(resumeTimer.current);
    const start = () => {
      setWaiting(null);
      live.current.player.play(sample.id, { name: speaker });
    };
    // A refusal is the player's to say; nothing is paused for a sound that will not play.
    const blocked = now.recording || now.recorder.unknown;
    if (blocked || sample.clipState !== 'ok') {
      setWaiting(null);
      if (blocked) now.player.play(sample.id, { name: speaker });
      return;
    }
    let wait = 0;
    if (pausedByUs.current) {
      wait = Math.max(0, PAUSE_GRACE_MS - (Date.now() - pauseSentAt.current));
    } else if (now.listening.active && !now.listening.paused) {
      pausedByUs.current = true;
      seenPaused.current = false;
      pauseSentAt.current = Date.now();
      setListeningPaused(true);
      now.listening.pause(true);
      wait = PAUSE_GRACE_MS;
    }
    if (wait === 0) return start();
    setWaiting(sample.id);
    startTimer.current = setTimeout(() => {
      if (generation.current === mine) start();
    }, wait);
  }, []);

  const stop = useCallback(() => {
    generation.current += 1;
    clearTimeout(startTimer.current);
    setWaiting(null);
    live.current.player.stop();
  }, []);

  const playPrimary = useCallback(
    (speaker: string) => {
      const sample = primaryOf(speaker);
      if (sample) play(sample, speaker);
    },
    [primaryOf, play],
  );

  // Once nothing is waiting or playing, a pause the page made is taken back after one chunk's grace.
  const busy = player.status !== 'idle' || waiting !== null;
  useEffect(() => {
    if (busy || !pausedByUs.current) return;
    resumeTimer.current = setTimeout(() => {
      if (!pausedByUs.current) return;
      stopOwing();
      live.current.listening.pause(false);
    }, PAUSE_GRACE_MS);
    return () => clearTimeout(resumeTimer.current);
  }, [busy]);

  // The host's state follows the page's pause; a resume by the narrator after that is theirs, and a session that ended has nothing to resume.
  const { active, paused } = listening;
  useEffect(() => {
    if (!pausedByUs.current) return;
    if (!active) return stopOwing();
    if (paused) seenPaused.current = true;
    else if (seenPaused.current) stopOwing();
  }, [active, paused]);

  // Leaving the page takes the pause back at once; the player stops the sample it started.
  useEffect(
    () => () => {
      clearTimeout(startTimer.current);
      clearTimeout(resumeTimer.current);
      if (pausedByUs.current) {
        pausedByUs.current = false;
        live.current.listening.pause(false);
      }
    },
    [],
  );

  const activeId = waiting ?? player.id;
  return {
    loaded: read.status !== 'loading',
    readProblem: read.status === 'failed' ? read.message : undefined,
    inChapter,
    samplesOf,
    primaryOf,
    refusal,
    cantTell: !recording && recorder.unknown,
    checkAgain: recorder.checkAgain,
    play,
    playPrimary,
    stop,
    activeId,
    statusOf: (id) => (waiting === id ? 'loading' : player.isActive(id) ? player.status : 'idle'),
    progressOf: (id) => (player.isActive(id) ? player.progress : 0),
    announcement: player.announcement,
    listeningPaused,
  };
}
