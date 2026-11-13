import { useEffect, useState } from 'react';
import { Button } from '../primitives/Button';
import { keepFocusOnRemoval } from '../layout/keepFocusOnRemoval';
import { plainTrackChoices, type ChapterNameOf } from './trackChoices';
import { TrackSelect } from './TrackSelect';
import type { Track, TrackMapping } from '../../types';

type Props = {
  /** The chapter this link is for, used only to name the track picker for a screen reader. */
  chapterTitle: string;
  /** Every REAPER track the narrator can link to. */
  tracks: Track[];
  /** Every confirmed link, so a track another chapter holds is labelled "(linked to X)" before the press, as the Chapter links list does. */
  links?: readonly TrackMapping[];
  /** The chapter being linked, so its own link is not a holder. */
  chapterId?: string;
  /** Names a holder by the manuscript's current heading (`useChapterNameOf`); absent, the title the host kept. */
  nameOf?: ChapterNameOf;
  /** The confirmed track's resolved name, when the link points at a track that still exists; omit it (leaving
   * `linkedTrackGuid` set) to show a missing-track state, or omit both to show nothing confirmed yet. */
  linkedTrackGuid?: string;
  linkedTrackName?: string;
  /** A track the app found by name or region but the narrator has not confirmed: the picker opens on it, so one Confirm links it (#3231). */
  suggestedTrackGuid?: string;
  /** True while a confirm or clear call is in flight, so the caller's own state controls the busy affordance. */
  busy?: boolean;
  onConfirm: (trackGuid: string) => void;
  onClear: () => void;
  /** The read view's two actions; the Production board's track slide-over names them as its mockup does
   * (chapter-track-link-control mock 02: "Another track…", "Unlink"). */
  changeLabel?: string;
  clearLabel?: string;
};

// A reusable inline "link this chapter to a track" prompt: the Tracks
// page's list uses one per chapter, and the editing check (components/editing/EditingCheckPanel.tsx) shows one when a
// chapter has no confirmed track, without needing the audio engine panel around it. It owns only the pending pick in the
// track dropdown; the confirmed link itself lives in the caller's state, refreshed from `chapterTrackMapList` after
// `onConfirm`/`onClear` resolve.
export function MappingConfirm({
  chapterTitle,
  tracks,
  links,
  chapterId,
  linkedTrackGuid,
  linkedTrackName,
  suggestedTrackGuid,
  busy = false,
  onConfirm,
  onClear,
  changeLabel = 'Change',
  clearLabel = 'Clear',
  nameOf,
}: Props) {
  const hasLink = Boolean(linkedTrackGuid);
  const [picking, setPicking] = useState(!hasLink);
  const choices = plainTrackChoices(tracks, links, chapterId, nameOf);
  // Nothing is picked for the narrator: the select opens on "Choose a track" and Confirm waits for a pick, so one press cannot link the
  // first track to a chapter it does not belong to (alignment audit R3EN2-1). A Change starts from the track already linked.
  const initial = linkedTrackGuid ?? suggestedTrackGuid;
  const [picked, setChosen] = useState(initial && tracks.some((track) => track.guid === initial) ? initial : '');
  // A pick whose track has left the list (deleted in the DAW) is no pick: the select shows its placeholder, so Confirm must wait too.
  const chosen = tracks.some((track) => track.guid === picked) ? picked : '';

  // A confirm or clear call comes back through the caller's own state, as a new `linkedTrackGuid` prop, not through
  // this component's local `picking` intent: once the caller reports a link (a fresh confirm, or a Change followed
  // by a new confirm), drop back to the read view so a completed confirm does not keep showing its own form.
  useEffect(() => {
    if (hasLink) setPicking(false);
  }, [hasLink, linkedTrackGuid]);

  if (hasLink && !picking) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{linkedTrackName ?? 'Linked track is missing from this project'}</span>
        <Button variant="secondary" onClick={() => setPicking(true)} disabled={busy}>
          {changeLabel}
        </Button>
        <Button variant="secondary" onClick={onClear} pending={busy}>
          {clearLabel}
        </Button>
      </div>
    );
  }

  if (choices.length === 0) {
    return (
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
        No REAPER tracks to link
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TrackSelect label={`Track for ${chapterTitle}`} choices={choices} value={chosen} onChange={setChosen} />
      <Button ref={keepFocusOnRemoval} variant={chosen ? 'primary' : 'secondary'} disabled={!chosen} onClick={() => onConfirm(chosen)} pending={busy}>
        Confirm
      </Button>
      {hasLink && (
        <Button
          variant="secondary"
          onClick={() => {
            // Cancel drops the abandoned pick: the next Change opens on the linked track, not on it.
            setChosen(linkedTrackGuid && tracks.some((track) => track.guid === linkedTrackGuid) ? linkedTrackGuid : '');
            setPicking(false);
          }}
          disabled={busy}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}
