import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChapterTrackCreateResult, ChapterTrackMatch, ChapterTrackSetResult } from '../../api/contracts/chapterTrackMap';
import { Button } from '../primitives/Button';
import { apiErrorMessage } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';
import { useOverlay } from '../../overlay/OverlayProvider';
import { useChapterTrackProject, useChapterTrackState } from '../chapterTracks/ChapterTrackState';
import { dialogChapterName, useChapterLinkActions } from '../chapterTracks/useChapterLinkActions';
import { useChapterNameOf } from '../chapterTracks/useChapterNameOf';
import { useSecondsSince } from '../layout/CheckLine';
import { bestChoice, trackChoices } from '../mapping/trackChoices';
import { TrackSelect } from '../mapping/TrackSelect';
import { ResolveShell } from './ResolveShell';
import { destinationFor } from '../engine/destination';
import { useVoiceLayout } from '../engine/voiceLayout';

/** How long the track match may take: a host that never answers ends in the failed state, where adding a track is offered, not in reading for good. */
const MATCH_LIMIT_MS = 8000;
function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type Read = { status: 'loading' } | { status: 'failed'; message: string } | { status: 'ready'; match: ChapterTrackMatch; at: number };

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
  /** The link was made, to a track the narrator chose or to what the DAW just added (`created`: a folder with its Narrator, or a track); the page reads the chapter again at once. */
  onLinked: (result: ChapterTrackSetResult, created?: Extract<ChapterTrackCreateResult, { outcome: 'created' }>) => void;
  /** Check again was pressed, so the page can read the chapter again too (the link may have been made elsewhere). */
  onCheckedAgain?: () => void;
  /** Where focus goes when the dialog closes and nothing had it at open (it opens by itself): the chip that reopens it. */
  returnFocus?: () => HTMLElement | null;
  onClose: () => void;
};

/**
 * Variant 2 of the resolve dialog: the chapter is not linked to a track. It names the chapter and offers both fixes: link one of the tracks the
 * host found (the matcher's best match preselected), or have the DAW add a new track named after the chapter and link that
 * (`chapterTrackCreate`). With no tracks to choose from, adding one is the primary action.
 */
export function ChapterLinkDialog({
  chapterId,
  chapterName: rawChapterName,
  sentence,
  dawName,
  missing = false,
  several = false,
  create,
  onLinked,
  onCheckedAgain,
  returnFocus,
  onClose,
}: ChapterLinkDialogProps) {
  // A long name would take the whole dialog, a blank one would leave the title with no subject (#3416).
  const chapterName = dialogChapterName(rawChapterName);
  const trackMap = usePort('chapterTrackMap');
  const actions = useChapterLinkActions();
  const nameOf = useChapterNameOf();
  const nameOfRef = useRef(nameOf);
  nameOfRef.current = nameOf;
  const overlay = useOverlay();
  // The links are the app's one chapter-track state, not a snapshot of the dialog's own: a link made here shows on the Engine panel, the Booth
  // and Settings at once, and one made there shows here (#3350). Only the links are watched; the match is this chapter's own question.
  const { mappings: links, applyMappings, refreshLinks } = useChapterTrackState({ enabled: true, tracks: false });
  const [read, setRead] = useState<Read>({ status: 'loading' });
  const [asked, setAsked] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // In a Voice folders project the host makes a folder with a Narrator track for the chapter (ChapterTrackCreate), so the words say folder.
  const dest = destinationFor(useVoiceLayout());
  const folders = dest.folders;

  useEffect(() => {
    let live = true;
    // The links are read through the shared state (every screen sees the answer), together with the match, so the two are one moment.
    // A links read that fails is this dialog's read failing: it says so, as a failed match does, and Check again tries both again.
    // A links read that fails after the match answered leaves the picker as it was, with the failure said under it, not the whole dialog failed.
    let linksFailure = '';
    Promise.all([
      withTimeout(trackMap.chapterTrackMatch(chapterId), MATCH_LIMIT_MS, `${dawName} did not answer in ${MATCH_LIMIT_MS / 1000} s`),
      refreshLinks().catch((error: unknown) => {
        linksFailure = apiErrorMessage(error);
        return undefined;
      }),
    ]).then(
      ([match, fresh]) => {
        if (!live) return;
        setRead({ status: 'ready', match, at: Date.now() });
        if (linksFailure) setRefused(`The links could not be read again: ${linksFailure}. The last ones are shown.`);
        // Keeps the narrator's own pick across a check; otherwise starts on the best match.
        setChosen((current) =>
          current && match.tracks.some((t) => t.guid === current)
            ? current
            : bestChoice(trackChoices(match, fresh ?? linksRef.current, undefined, nameOfRef.current)),
        );
      },
      (error: unknown) => live && setRead({ status: 'failed', message: apiErrorMessage(error) }),
    );
    return () => {
      live = false;
    };
  }, [trackMap, chapterId, asked, refreshLinks, dawName]);

  const readingRef = useRef(true);
  readingRef.current = read.status === 'loading';
  // Another project opened under this dialog (or the project closed): its chapter is not in what is read now, and a link would be written to the
  // wrong project, so the dialog goes away rather than offering it (#3416).
  const projectNow = useChapterTrackProject();
  const openedFor = useRef(projectNow);
  useEffect(() => {
    if (projectNow !== openedFor.current) onClose();
  }, [projectNow, onClose]);
  const linksRef = useRef(links);
  linksRef.current = links;
  // An action that outlives the dialog (Escape while it is pending) still says why it failed, as a toast, since the dialog's own line is gone.
  const open = useRef(true);
  useEffect(
    () => () => {
      open.current = false;
    },
    [],
  );
  const checkAgain = useCallback(() => {
    // Presses while a check is out are ignored: five presses would start five reads and five page re-reads.
    if (readingRef.current) return;
    readingRef.current = true;
    setRefused(null);
    setRead({ status: 'loading' });
    setAsked((n) => n + 1);
    onCheckedAgain?.();
  }, [onCheckedAgain]);
  const readSeconds = useSecondsSince(read.status === 'ready' ? read.at : null);

  const choices = useMemo(() => (read.status === 'ready' ? trackChoices(read.match, links, chapterId, nameOf) : []), [read, links, chapterId, nameOf]);
  const held = choices.find((c) => c.guid === chosen && c.heldBy);

  const link = () => {
    if (!chosen || linking) return;
    setLinking(true);
    setRefused(null);
    actions.set(chapterId, chosen, nameOf).then(
      ({ result, displacedNotice, linkedNotice }) => {
        setLinking(false);
        applyMappings(result.mappings);
        // The chapter that lost the track is named, as every other place that links says (#3365).
        if (displacedNotice) overlay.toast(linkedNotice);
        onLinked(result);
      },
      (error: unknown) => {
        setLinking(false);
        const text = `The link could not be made: ${apiErrorMessage(error)}`;
        if (open.current) setRefused(text);
        else overlay.toast(text, { tone: 'error' });
      },
    );
  };

  // One press adds one track: a second press while the first is out is ignored, so a double click never makes two.
  const createTrack = () => {
    if (creating || linking || create?.available === false) return;
    setCreating(true);
    setRefused(null);
    actions.create(chapterId).then(
      (result) => {
        setCreating(false);
        if (result.outcome === 'created') {
          applyMappings(result.mappings);
          onLinked(result, result);
        } else if (open.current) setRefused(result.message);
        else overlay.toast(result.message, { tone: 'error' });
      },
      (error: unknown) => {
        setCreating(false);
        const text = `The ${dest.noun} could not be added: ${apiErrorMessage(error)}`;
        if (open.current) setRefused(text);
        else overlay.toast(text, { tone: 'error' });
      },
    );
  };

  const noTracks = read.status === 'ready' && choices.length === 0;
  // Nothing to choose from (no tracks, or the saved project could not be read): adding a track is the fix, and the primary action.
  const createFirst = noTracks || read.status === 'failed';
  const createLabel = `Create a new ${dest.noun}`;
  const createWhat = dest.noun;
  const withNarrator = folders ? ', with a Narrator track in it,' : '';
  const createOff = create?.available === false;
  const createAction = { label: createLabel, onPress: createTrack, pending: creating, disabled: createOff || linking };
  const title = missing ? dest.missingTitle(chapterName) : several ? dest.severalTitle(chapterName) : dest.notLinkedTitle(chapterName);
  return (
    <ResolveShell
      title={title}
      description={sentence}
      onClose={onClose}
      returnFocus={returnFocus}
      primary={
        createFirst ? createAction : { label: dest.linkButton, onPress: link, pending: linking, disabled: !chosen || read.status !== 'ready' || creating }
      }
      secondary={{ label: 'Check again', onPress: checkAgain, pending: read.status === 'loading' }}
    >
      {read.status === 'loading' && <p role="status">Reading the {dawName} tracks…</p>}
      {read.status === 'failed' && (
        <p role="alert" className="text-[var(--danger-text)]">
          The {dawName} tracks could not be read: {read.message}
        </p>
      )}
      {noTracks && (
        <p>
          The saved {dawName} project has no tracks yet.{' '}
          {createFirst && !createOff ? `${createLabel} adds one named after the chapter${withNarrator} and links it.` : ''}
        </p>
      )}
      {read.status === 'ready' && !noTracks && (
        <>
          <TrackSelect label={dest.pickerLabel(chapterName)} choices={choices} value={chosen ?? ''} onChange={setChosen} fullWidth />
          {held && (
            <p className="text-[var(--text-muted)]">
              {held.name} is linked to {held.heldBy}. Linking it here moves it.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
            <span className="text-[var(--text-muted)]">
              Or have {dawName} add a new {createWhat} for this chapter, named after it{folders ? ' with a Narrator track in it' : ''}, and link it:
            </span>
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
        <p className="text-[var(--text-muted)]">
          {create?.message || `${dawName} cannot add a ${dest.noun} from this app. Add one in ${dawName}, then check again.`}
        </p>
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
