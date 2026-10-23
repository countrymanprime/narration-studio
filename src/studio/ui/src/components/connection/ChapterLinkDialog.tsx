import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChapterTrackCreateResult, ChapterTrackMatch, ChapterTrackSetResult, TrackMapping } from '../../api/contracts/chapterTrackMap';
import { Button } from '../primitives/Button';
import { apiErrorMessage } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';
import { useSecondsSince } from '../layout/CheckLine';
import { bestChoice, trackChoices } from '../mapping/trackChoices';
import { TrackSelect } from '../mapping/TrackSelect';
import { ResolveShell } from './ResolveShell';

type Read = { status: 'loading' } | { status: 'failed'; message: string } | { status: 'ready'; match: ChapterTrackMatch; links: TrackMapping[]; at: number };

export type ChapterLinkDialogProps = {
  chapterId: string;
  chapterName: string;
  /** The words of the headline: why the chapter has no audio to edit (`noAudioText`). */
  sentence: string;
  /** The DAW's name, for the sentences that point at it. */
  dawName: string;
  /** The chapter was linked to a track that is no longer in the saved project; linking replaces that link. */
  missing?: boolean;
  /** The chapter is linked to more than one track (the Booth's `several_links`): linking one replaces them all. */
  several?: boolean;
  /** Whether the DAW can add a track from here (its `track_create` capability); absent, the host's answer to the press decides. */
  create?: { available: boolean; message?: string };
  /** The link was made, to a track the narrator chose or to one the DAW just added (`created`); the page reads the chapter again at once. */
  onLinked: (result: ChapterTrackSetResult, created?: Extract<ChapterTrackCreateResult, { outcome: 'created' }>['track']) => void;
  /** Check again was pressed, so the page can read the chapter again too (the link may have been made elsewhere). */
  onCheckedAgain?: () => void;
  onClose: () => void;
};

/**
 * Variant 2 of the resolve dialog: the chapter is not linked to a track. It names the chapter and offers both fixes: link one of the tracks the
 * host found (the matcher's best match preselected), or have the DAW add a new track named after the chapter and link that
 * (`chapterTrackCreate`). With no tracks to choose from, adding one is the primary action.
 */
export function ChapterLinkDialog({
  chapterId,
  chapterName,
  sentence,
  dawName,
  missing = false,
  several = false,
  create,
  onLinked,
  onCheckedAgain,
  onClose,
}: ChapterLinkDialogProps) {
  const trackMap = usePort('chapterTrackMap');
  const [read, setRead] = useState<Read>({ status: 'loading' });
  const [asked, setAsked] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      trackMap.chapterTrackMatch(chapterId),
      trackMap.chapterTrackMapList().then(
        (l) => l.mappings,
        () => [] as TrackMapping[],
      ),
    ]).then(
      ([match, links]) => {
        if (!live) return;
        setRead({ status: 'ready', match, links, at: Date.now() });
        // Keeps the narrator's own pick across a check; otherwise starts on the best match.
        setChosen((current) => (current && match.tracks.some((t) => t.guid === current) ? current : bestChoice(trackChoices(match, links))));
      },
      (error: unknown) => live && setRead({ status: 'failed', message: apiErrorMessage(error) }),
    );
    return () => {
      live = false;
    };
  }, [trackMap, chapterId, asked]);

  const checkAgain = useCallback(() => {
    setRefused(null);
    setAsked((n) => n + 1);
    onCheckedAgain?.();
  }, [onCheckedAgain]);
  const readSeconds = useSecondsSince(read.status === 'ready' ? read.at : null);

  const choices = useMemo(() => (read.status === 'ready' ? trackChoices(read.match, read.links, chapterId) : []), [read, chapterId]);
  const held = choices.find((c) => c.guid === chosen && c.heldBy);

  const link = () => {
    if (!chosen || linking) return;
    setLinking(true);
    setRefused(null);
    trackMap.chapterTrackSet(chapterId, chosen).then(
      (result) => {
        setLinking(false);
        onLinked(result);
      },
      (error: unknown) => {
        setLinking(false);
        setRefused(`The link could not be made: ${apiErrorMessage(error)}`);
      },
    );
  };

  // One press adds one track: a second press while the first is out is ignored, so a double click never makes two.
  const createTrack = () => {
    if (creating || linking || create?.available === false) return;
    setCreating(true);
    setRefused(null);
    trackMap.chapterTrackCreate(chapterId).then(
      (result) => {
        setCreating(false);
        if (result.outcome === 'created') onLinked(result, result.track);
        else setRefused(result.message);
      },
      (error: unknown) => {
        setCreating(false);
        setRefused(`The track could not be added: ${apiErrorMessage(error)}`);
      },
    );
  };

  const noTracks = read.status === 'ready' && choices.length === 0;
  // Nothing to choose from (no tracks, or the saved project could not be read): adding a track is the fix, and the primary action.
  const createFirst = noTracks || read.status === 'failed';
  const createLabel = 'Create a new track';
  const createOff = create?.available === false;
  const createAction = { label: createLabel, onPress: createTrack, pending: creating, disabled: createOff || linking };
  const title = missing
    ? `${chapterName}’s track is not in the project`
    : several
      ? `${chapterName} is linked to more than one track`
      : `${chapterName} is not linked to a track`;
  return (
    <ResolveShell
      title={title}
      description={sentence}
      onClose={onClose}
      primary={createFirst ? createAction : { label: 'Link track', onPress: link, pending: linking, disabled: !chosen || read.status !== 'ready' || creating }}
      secondary={{ label: 'Check again', onPress: checkAgain }}
    >
      {read.status === 'loading' && <p role="status">Reading the {dawName} tracks…</p>}
      {read.status === 'failed' && (
        <p role="alert" className="text-[var(--danger-text)]">
          The {dawName} tracks could not be read: {read.message}
        </p>
      )}
      {noTracks && (
        <p>
          The saved {dawName} project has no tracks yet. {createFirst && !createOff ? `${createLabel} adds one named after the chapter and links it.` : ''}
        </p>
      )}
      {read.status === 'ready' && !noTracks && (
        <>
          <TrackSelect label={`Track for ${chapterName}`} choices={choices} value={chosen ?? ''} onChange={setChosen} fullWidth />
          {held && (
            <p className="text-[var(--text-muted)]">
              {held.name} is linked to {held.heldBy}. Linking it here moves it.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
            <span className="text-[var(--text-muted)]">Or have {dawName} add a new track for this chapter, named after it, and link it:</span>
            <Button
              variant="secondary"
              size="sm"
              pending={creating}
              {...(createAction.disabled ? { 'aria-disabled': true } : {})}
              onClick={createAction.disabled ? undefined : createTrack}
            >
              {createLabel}
            </Button>
          </div>
        </>
      )}
      {createOff && (
        <p className="text-[var(--text-muted)]">{create?.message || `${dawName} cannot add a track from this app. Add one in ${dawName}, then check again.`}</p>
      )}
      {refused && (
        <p role="alert" className="text-[var(--danger-text)]">
          {refused}
        </p>
      )}
      {/* Only the sentence is announced; the seconds tick every second. */}
      <p className="text-[var(--text-muted)]">
        <span role="status">{read.status === 'failed' ? `Can't tell which tracks ${dawName} has.` : `Waiting for ${chapterName} to be linked.`}</span>{' '}
        {readSeconds === null ? 'Not checked yet.' : `Last checked ${readSeconds} s ago, from the project as last saved.`}
      </p>
    </ResolveShell>
  );
}
