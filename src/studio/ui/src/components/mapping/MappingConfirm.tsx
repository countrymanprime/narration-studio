import { useEffect, useState } from 'react';
import { Button } from '../primitives/Button';
import { plainTrackChoices, type TrackHolder } from './trackChoices';
import { TrackSelect } from './TrackSelect';
import type { Track } from '../../types';

type Props = {
  /** The chapter this link is for, used only to name the track picker for a screen reader. */
  chapterTitle: string;
  /** Every REAPER track the narrator can link to. */
  tracks: Track[];
  /** The confirmed track's resolved name, when the link points at a track that still exists; omit it (leaving
   * `linkedTrackGuid` set) to show a missing-track state, or omit both to show nothing confirmed yet. */
  linkedTrackGuid?: string;
  linkedTrackName?: string;
  /** Every confirmed link, and this chapter's id, so a track another chapter holds says so in the picker. */
  links?: readonly TrackHolder[];
  chapterId?: string;
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
// page's list uses one per chapter, and the recording check (components/production/RecordingCheck.tsx) shows one when a
// chapter has no confirmed track, without needing the audio engine panel around it. It owns only the pending pick in the
// track dropdown; the confirmed link itself lives in the caller's state, refreshed from `chapterTrackMapList` after
// `onConfirm`/`onClear` resolve.
export function MappingConfirm({
  chapterTitle,
  tracks,
  linkedTrackGuid,
  linkedTrackName,
  links,
  chapterId,
  busy = false,
  onConfirm,
  onClear,
  changeLabel = 'Change',
  clearLabel = 'Clear',
}: Props) {
  const hasLink = Boolean(linkedTrackGuid);
  const [picking, setPicking] = useState(!hasLink);
  const choices = plainTrackChoices(tracks, links, chapterId);
  // Nothing is picked for the narrator: the select opens on "Choose a track" and Confirm waits for a pick, so one press cannot link the
  // first track to a chapter it does not belong to (alignment audit R3EN2-1). A Change starts from the track already linked.
  const [chosen, setChosen] = useState(linkedTrackGuid && tracks.some((track) => track.guid === linkedTrackGuid) ? linkedTrackGuid : '');

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
      <Button variant={chosen ? 'primary' : 'secondary'} disabled={!chosen} onClick={() => onConfirm(chosen)} pending={busy}>
        Confirm
      </Button>
      {hasLink && (
        <Button variant="secondary" onClick={() => setPicking(false)} disabled={busy}>
          Cancel
        </Button>
      )}
    </div>
  );
}
