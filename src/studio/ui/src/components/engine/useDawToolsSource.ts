import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';
import { useDawState } from '../../daw/useDawSession';
import { useDawStatus } from '../editing/page/useDawStatus';
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
  /** How many chapters are linked to a track in the project; undefined until the chapters and the links have been read. */
  linkedChapterCount: number | undefined;
};

/**
 * What a page that offers the DAW tools needs to draw them: the project's tracks, the one reader of the chapter links, whether the project
 * records in Audacity, and why the DAW is not answering when it is not. The Engine panel reads the same things for itself beside the rest of its
 * project; a page header has no such reader, so this is the page's. The tracks are read when the DAW's answer changes, as the Engine panel's
 * are when Audacity answers. Nothing is read until the menu has been opened (`opened` counts its openings), so a page that never opens it makes no host call for it, and each opening reads again, so a read that failed is tried once more.
 */
export function useDawToolsSource(opened: number): DawToolsSource {
  const enabled = opened > 0;
  const tracksPort = usePort('tracks');
  const audacity = useAudacityLink(enabled);
  const forAudacity = audacity.link?.chosen === true;
  // An Audacity project's tracks come from the snapshot taken while Audacity answers, so they are read again each time it does (as the Engine panel's are).
  const audacityHeard = forAudacity ? audacity.receivedAt : undefined;
  const status = useDawStatus();
  const reachable = useDawState((state) => state.caps?.reachable);
  const [tracks, setTracks] = useState<Track[]>(NO_TRACKS);
  const [state, setState] = useState<'reading' | 'read' | { failed: string }>('reading');

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    tracksPort.tracksList().then(
      (project) => {
        if (!active) return;
        setTracks(project.tracks);
        setState('read');
      },
      (reason) => {
        if (active) setState({ failed: `The REAPER project could not be read: ${apiErrorMessage(reason)}` });
      },
    );
    return () => {
      active = false;
    };
  }, [tracksPort, enabled, opened, reachable, audacityHeard]);

  const links = useChapterLinks(tracks, opened, noop, enabled);
  const linked = links.rows.filter((row) => row.state === 'linked').length;
  const dawOff =
    state === 'reading'
      ? 'Reading the REAPER project…'
      : typeof state === 'object'
        ? state.failed
        : links.error
          ? `The chapter links could not be read: ${links.error.slice(0, 200)}`
          : status.off;
  return { links, forAudacity, dawOff: forAudacity ? null : dawOff, linkedChapterCount: links.chapters.length > 0 ? linked : undefined };
}
