import { useEffect, useState } from 'react';
import { useChapterTrackState } from '../chapterTracks/ChapterTrackState';
import { apiErrorMessage } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';
import { useDawState } from '../../daw/useDawSession';
import { recorderName, wrongProjectReason } from '../../studio/dawNames';
import { useDawStatus } from '../connection/useDawStatus';
import type { Track } from '../../types';
import { useAudacityLink } from './useAudacityLink';
import { useChapterLinks, type ChapterLinks } from './useChapterLinks';

const NO_TRACKS: Track[] = [];
const noop = () => {};

export type DawToolsSource = {
  links: ChapterLinks;
  forAudacity: boolean;
  /** Why the tools cannot be used for a reason that is about the DAW or the project file, in a sentence; null when there is none. */
  dawOff: string | null;
  /** The sentence for a DAW that has a different project open than the one linked here; null when it has the linked one, or nothing is linked or heard. */
  wrongProject: string | null;
  /** How many chapters are linked to a track in the project; undefined until the chapters and the links have been read. */
  linkedChapterCount: number | undefined;
};

/**
 * What a page that offers the DAW tools needs to draw them: the project's tracks (the shared chapter track state's, the Engine list's and the Booth's),
 * the one reader of the chapter links, whether the project records in Audacity, and why the DAW is not answering when it is not. Nothing is read until
 * the menu has been opened (`opened` counts its openings), so a page that never opens it makes no host call for it; after that the shared state keeps
 * reading (its 5 s timer) while the page is mounted, and each further opening reads once more, so a read that failed is tried again.
 */
export function useDawToolsSource(opened: number): DawToolsSource {
  const enabled = opened > 0;
  const system = usePort('system');
  const audacity = useAudacityLink(enabled);
  const forAudacity = audacity.link?.chosen === true;
  const status = useDawStatus();
  const reachable = useDawState((state) => state.caps?.reachable);
  const [wrongProject, setWrongProject] = useState<string | null>(null);
  // The tracks are the shared state's (the Engine list and the Booth read the same ones), read while the menu has been opened and the project is not Audacity's.
  const trackState = useChapterTrackState({ enabled: enabled && !forAudacity });
  const tracks = trackState.project?.tracks ?? NO_TRACKS;
  const readError = trackState.project ? '' : trackState.live.error;
  // Each opening of the menu, and the DAW starting to answer, reads once more, so a read that failed is tried again.
  const { reread } = trackState;
  useEffect(() => {
    if (enabled && !forAudacity && opened > 1) reread();
  }, [reread, enabled, forAudacity, opened, reachable]);

  // Whether the DAW has the linked project open, read as the Booth reads it: only a linked, heard DAW that disagrees counts. A read that fails is said, so no entry is silently live.
  const dawKind = useDawState((state) => state.caps?.daw);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    system.bootstrap().then(
      (data) => {
        if (active) setWrongProject(data.dawFileLinked && data.dawReachable && !data.dawProjectMatches ? wrongProjectReason(dawKind) : null);
      },
      (reason) => {
        if (active) setWrongProject(`Whether ${recorderName(dawKind)} has the linked project open could not be read: ${apiErrorMessage(reason).slice(0, 200)}`);
      },
    );
    return () => {
      active = false;
    };
  }, [system, enabled, opened, reachable, dawKind]);

  const links = useChapterLinks(tracks, opened, noop, null, enabled);
  const linked = links.rows.filter((row) => row.state === 'linked' || row.state === 'several').length;
  const dawOff =
    !trackState.project && trackState.reading && !readError
      ? 'Reading the REAPER project…'
      : readError
        ? `The REAPER project could not be read: ${readError.slice(0, 200)}`
        : trackState.live.stale
          ? // A read that fails after a good one keeps the last tracks on screen; the tools say they are old rather than acting on them silently (#3415).
            `The REAPER tracks could not be read again${trackState.live.error ? `: ${trackState.live.error.slice(0, 200)}` : ''}. The last ones read are shown.`
          : links.error
            ? `The chapter links could not be read: ${links.error.slice(0, 200)}`
            : status.off;
  return {
    links,
    forAudacity,
    dawOff: forAudacity ? null : dawOff,
    wrongProject: forAudacity ? null : wrongProject,
    linkedChapterCount: links.chapters.length > 0 ? linked : undefined,
  };
}
