import { chapterTrackOf } from '../../../api/chapterTrackItems';
import { PLAY_DEADLINE_MS, dawNameOf } from '../../engine/ShowInDaw';
import type { VoiceTracksLayout } from '../../../api/contracts/voiceTracks';
import { destinationFor } from '../../engine/destination';
import { useVoiceLayout } from '../../engine/voiceLayout';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PickupItem } from '../../../api/contracts/pickups';
import type { TrackItem } from '../../../api/contracts/tracks';
import { usePort } from '../../../ports/usePort';
import { useRangePlayer } from '../../engine/useRangePlayer';
import { buildPlaylist, segmentAtElapsed } from '../../proof/playlist';
import { useDawCapabilities } from '../../../hooks/useDawCapabilities';
import { overlay } from '../../../overlay/overlayService';
import { useNewestPlay } from '../../../playback/useNewestPlay';
import { APP, playReadiness, playThrough, quietWhileRecording, type PlaybackProvider } from '../../../playback/providers';
import { chapterLink, linkStateOf, tracksUnreadable, type ChapterLinkState } from '../../chapterTracks/chapterLink';
import { useChapterTrackState } from '../../chapterTracks/ChapterTrackState';

/** The Retry a line that played nothing offers is one toast at a time; a newer press, Stop or leaving the page withdraws it. */
export const ORIGINAL_TOPIC = 'pickups-original-retry';
/** Seconds of the recording heard before and after the line's place. */
const ORIGINAL_AROUND = 3;
/** Milliseconds past the stretch's end before the button goes back to Hear: the DAW stops itself at the end, this only resets the list. */
const RESET_MARGIN_MS = 300;
/** Why a line cannot be heard: the host gave it no place in the recording. */
const NO_PLACE = 'This line has no place in the recording yet.';
const NO_AUDIO = 'The recording of this chapter is not in the project, so the original cannot be played.';

/** Why a pickup of a chapter in this link state has no recording to play. */
function noSpotReason(state: ChapterLinkState, layout: VoiceTracksLayout): string {
  if (state === 'unlinked') return destinationFor(layout).noOriginal.unlinked;
  if (state === 'missing') return destinationFor(layout).noOriginal.missing;
  return NO_AUDIO;
}

/** Where a pickup falls in the chapter's source audio: the file and the second in it. `at` is a project second; `time` is a second on the app's own line over the played files. */
export function sourceSpot(items: readonly TrackItem[], pickup: Pick<PickupItem, 'at' | 'time'>): { sourceFile: string; seconds: number } | undefined {
  const playable = items.filter((item) => item.supported && item.sourceAvailable && item.sourceFile !== '');
  if (pickup.at !== null) {
    const hit = playable.find((item) => pickup.at! >= item.position && pickup.at! <= item.position + item.length);
    if (hit) return { sourceFile: hit.sourceFile, seconds: hit.sourceStart + (pickup.at - hit.position) * (hit.playRate || 1) };
  }
  if (pickup.time !== null) {
    const found = segmentAtElapsed(buildPlaylist(playable), pickup.time);
    if (found) return { sourceFile: found.segment.sourceFile, seconds: found.segment.sourceStart + Math.max(0, pickup.time - found.segment.elapsedStart) };
  }
  return undefined;
}

/**
 * Plays a pickup's place in the recording with `ORIGINAL_AROUND` seconds either side, through the playback providers (playback/providers.ts):
 * the linked DAW's transport (`transport_sync`) from the pickup's project second, stopped after the stretch, then the range player the Proof
 * takes use on the source file (no project change either way). A DAW that cannot play now or refuses hands the line to the app with a notice;
 * a DAW that is recording keeps the room quiet. One line plays at a time; pressing the playing line again stops it. A refusal comes back as
 * a sentence through `onRefused` with a `retry` (only when nothing played) that plays the line again while it is still the newest press and the list is
 * here, a fallback's notice through `onNotice`. The press asks the DAW at once, on what the list last heard of its capabilities (nothing, until the first read
 * answers): no read and no check stands between the click and the play call (owner rule on #4043, #4076).
 */
export function usePlayOriginal(onRefused: (sentence: string, retry?: () => void) => void, onNotice: (sentence: string) => void = onRefused) {
  // The tracks and links are the shared state's, as the Engine list and the Booth read them: a press never waits on a read of its own, and a
  // track renamed or deleted in REAPER is what the next press plays (#3366).
  const trackState = useChapterTrackState();
  const layout = useVoiceLayout();
  const tracks = usePort('tracks');
  const daw = usePort('daw');
  const sync = usePort('dawTransportSync');
  const player = useRangePlayer(tracks.mediaUrl, { pre: ORIGINAL_AROUND, post: ORIGINAL_AROUND });
  const [playingId, setPlayingId] = useState<string | null>(null);
  // The line whose play is being asked of the DAW and not yet answered (a few seconds at most): its button shows the busy state, never nothing.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [inDaw, setInDaw] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const asked = useRef(0);
  // The press that owns the DAW's play now: null after Stop. A play that comes back after it was replaced stops the DAW only when nobody owns it.
  const owner = useRef<number | null>(null);
  // A DAW play was started and not stopped since: an earlier press's, which a later press that ended in the app must not leave running.
  const dawStarted = useRef(false);
  // What the DAW last said it can do (read at mount and again when its report changes): a press uses it as it stands and never waits for a read.
  const dawState = useDawCapabilities();
  const dawCaps = useRef(dawState);
  dawCaps.current = dawState;
  const newest = useNewestPlay(ORIGINAL_TOPIC);
  const live = useRef({ onRefused, onNotice, playingId, inDaw });
  const shared = useRef(trackState);
  shared.current = trackState;
  live.current = { onRefused, onNotice, playingId, inDaw };

  // Off, with its reason, for a line with no place and for a chapter with no link (#3394). The DAW can play a stretch by its own project second with
  // no link, but the Engine list says "Not linked" and the button must not look usable beside it. Before the links are first read "no link" means
  // "not read yet", so the button stays as it was.
  const { mappings, linksReadAt } = trackState;
  const unavailable = useCallback(
    (pickup: PickupItem): string | undefined => {
      if (pickup.at === null && pickup.time === null) return NO_PLACE;
      // The line that is playing keeps its Stop: a chapter unlinked meanwhile must not leave a play that cannot be stopped (qa B2).
      if (pickup.id === playingId) return undefined;
      if (linksReadAt !== null && chapterLink(mappings, pickup.chapterId).state === 'unlinked') return noSpotReason('unlinked', layout);
      return undefined;
    },
    [mappings, linksReadAt, playingId, layout],
  );

  const clearTimer = (): void => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  const stopDaw = useCallback((): void => {
    clearTimer();
    dawStarted.current = false;
    // A failed stop leaves the DAW playing; say so, as the Editing page does.
    sync.dawTransportSync('stop', 0).then(
      (result) => !result.ok && live.current.onRefused(result.message),
      () => live.current.onRefused('The DAW could not be stopped. Stop it there.'),
    );
  }, [sync]);

  const stop = useCallback((): void => {
    overlay.dismissTopic(ORIGINAL_TOPIC);
    asked.current += 1;
    owner.current = null;
    if (live.current.inDaw) stopDaw();
    player.stop();
    setInDaw(false);
    setPlayingId(null);
  }, [player, stopDaw]);

  // Plays the line; a press on the playing line stops it (`play`), a Retry plays it again (`begin`).
  const begin = useCallback(
    async (pickup: PickupItem): Promise<void> => {
      stop();
      const mine = asked.current;
      owner.current = mine;
      const { caps, failed: capsFailed, retry: readCapsAgain } = dawCaps.current;
      // A read that failed is asked again for the next press; this one does not wait for it.
      if (!caps && capsFailed) readCapsAgain();
      const ask = newest.begin();
      const retry = (): void => {
        if (newest.current(ask) && asked.current === mine) void begin(pickup);
      };
      const name = dawNameOf(caps);
      const transport: PlaybackProvider<PickupItem> = {
        name,
        readiness: (p) => {
          const declared = playReadiness(caps, 'transport_sync', capsFailed);
          if (!declared.ready) return declared;
          return p.at === null ? { ready: false, why: `This line has no place in ${name}'s project.` } : { ready: true };
        },
        play: async (p, { late }) => {
          // A newer press, or Stop, came while the DAW's capabilities were asked: that press owns the DAW now, and this one sends nothing (qa B4).
          if (asked.current !== mine) return { played: true };
          const from = Math.max(0, p.at! - ORIGINAL_AROUND);
          let why: string;
          try {
            // The DAW plays the stretch and stops itself at its end (play_range), so the end is the DAW's and the timer below only puts the button back.
            const result = await sync.dawTransportSync('playRange', from, p.at! + ORIGINAL_AROUND, p.chapterId);
            if (result.ok) {
              dawStarted.current = true;
              // The deadline passed while the DAW was answering: the app plays in its place, so this DAW play is stopped, not left beside it.
              // An older press's late answer stops nothing a newer press started.
              if (late()) {
                if (owner.current === mine || owner.current === null) stopDaw();
                return { played: true };
              }
              if (asked.current !== mine) {
                // Stop came while the DAW was starting: stop it. A newer press came instead: its own playRange is the one that counts, and a stop here would undo it (qa B4).
                if (owner.current === null) stopDaw();
                return { played: true };
              }
              setPlayingId(p.id);
              setInDaw(true);
              timer.current = window.setTimeout(
                () => {
                  if (asked.current !== mine) return;
                  setInDaw(false);
                  setPlayingId(null);
                },
                (p.at! - from + ORIGINAL_AROUND) * 1000 + RESET_MARGIN_MS,
              );
              return { played: true };
            }
            why = result.message;
          } catch (error) {
            why = `${name} was not asked: ${error instanceof Error ? error.message : String(error)}`;
          }
          return { played: false, why };
        },
      };
      const { project, mappings, reread } = shared.current;
      const link = chapterLink(mappings, pickup.chapterId);
      const found = project ? chapterTrackOf(project.tracks, link.trackGuid) : undefined;
      const spot = sourceSpot(found?.items ?? [], pickup);
      // Why there is nothing to play, in the link's own terms (the same words the Engine list and Editing use), not one sentence for every case.
      const missing = tracksUnreadable(shared.current) ?? (!project ? NO_AUDIO : noSpotReason(linkStateOf(link, Boolean(found)), layout));
      // The state is a few seconds old at most; a press asks it to read again for the next one.
      const app: PlaybackProvider<PickupItem> = {
        name: APP,
        readiness: () => (spot ? { ready: true } : { ready: false, why: missing }),
        play: (p) => {
          setPlayingId(p.id);
          player.play({ sourceFile: spot!.sourceFile, rangeStart: spot!.seconds, rangeEnd: spot!.seconds });
          return { played: true };
        },
      };
      reread();
      const wanted = (): boolean => asked.current === mine;
      setPendingId(pickup.id);
      const { by, notice } = await playThrough([transport, app], pickup, {
        stillWanted: wanted,
        keepQuiet: quietWhileRecording(() => daw.projectState(), name),
        // A click that plays is never silent for long: a DAW that has not answered passes the line to the app.
        deadlineMs: PLAY_DEADLINE_MS,
      });
      setPendingId((id) => (id === pickup.id ? null : id));
      // This press ended in the app (the DAW refused or could not play): it owns no DAW play, and one an earlier press left running is stopped now, or when its
      // late answer comes (qa B1 on #3402).
      if (by !== name && owner.current === mine) {
        owner.current = null;
        if (dawStarted.current) stopDaw();
      }
      if (!wanted() || !notice) return;
      // Retry only when nothing played: a line that fell back to the app and plays is not offered a Retry, which would stop it.
      if (by === null) live.current.onRefused(notice, retry);
      else live.current.onNotice(notice);
    },
    [daw, player, stop, stopDaw, sync, layout, newest],
  );
  const play = useCallback(
    async (pickup: PickupItem): Promise<void> => {
      if (live.current.playingId === pickup.id) return stop();
      return begin(pickup);
    },
    [begin, stop],
  );

  /* The app's range ends by itself or the file fails: the button goes back to Play, and a failed file says so. */
  const { isPlaying, loadError } = player;
  useEffect(() => {
    if (isPlaying || live.current.inDaw) return;
    setPlayingId(null);
    if (loadError) live.current.onRefused(NO_AUDIO);
  }, [isPlaying, loadError]);

  // Leaving the page stops a DAW play this list started.
  useEffect(
    () => () => {
      // A press still waiting on the DAW's capabilities must not start anything on a list that is gone.
      asked.current += 1;
      owner.current = null;
      if (live.current.inDaw) stopDaw();
      clearTimer();
    },
    [stopDaw],
  );
  return { playingId: isPlaying || inDaw ? playingId : null, pendingId, play, unavailable };
}
