import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChapterTrackMatch, ChapterTrackSetResult, TrackMapping } from '../../api/contracts/chapterTrackMap';
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
  /** The link was made; the page reads the chapter again at once. */
  onLinked: (result: ChapterTrackSetResult) => void;
  /** Check again was pressed, so the page can read the chapter again too (the link may have been made elsewhere). */
  onCheckedAgain?: () => void;
  onClose: () => void;
};

/**
 * Variant 2 of the resolve dialog: the chapter is not linked to a REAPER track. It names the chapter, lists the tracks the host found with
 * the matcher's best match preselected, and links the chosen one in place. Creating a track named after the chapter is not offered: the host
 * has no call for it.
 */
export function ChapterLinkDialog({ chapterId, chapterName, sentence, dawName, missing = false, onLinked, onCheckedAgain, onClose }: ChapterLinkDialogProps) {
  const trackMap = usePort('chapterTrackMap');
  const [read, setRead] = useState<Read>({ status: 'loading' });
  const [asked, setAsked] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

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

  const noTracks = read.status === 'ready' && choices.length === 0;
  return (
    <ResolveShell
      title={missing ? `${chapterName}’s track is not in the project` : `${chapterName} is not linked to a track`}
      description={sentence}
      onClose={onClose}
      primary={{ label: 'Link track', onPress: link, pending: linking, disabled: !chosen || read.status !== 'ready' }}
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
          The saved {dawName} project has no tracks yet. Add a track for {chapterName} in {dawName}, save the project, then check again.
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
        </>
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
