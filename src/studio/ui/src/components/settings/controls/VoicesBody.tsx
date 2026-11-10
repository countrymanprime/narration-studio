import { useEffect, useState } from 'react';
import type { ManuscriptChapter } from '../../../types';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { Track } from '../../../api/contracts/tracks';
import { useChapterTrackState } from '../../chapterTracks/ChapterTrackState';
import { useVoiceTracks } from '../../engine/useVoiceTracks';
import { useVoiceSetup } from '../../engine/voiceLayout';
import { VoicesCard } from '../../engine/VoicesCard';
import { useSettingsHost } from '../row/SettingsHost';

const NO_TRACKS: Track[] = [];

/**
 * The body of "Voices": the Engine panel's Voices card (the Narrator's character and who each voice track records), on the same shared voice
 * setup, without its own card. It needs the project's tracks and chapter links, which it takes from the shared chapter-track state, as the Engine panel does. While the layout is Flat
 * there are no voice tracks and the row's body is empty.
 */
export function VoicesBody() {
  const { setup } = useVoiceSetup();
  // A flat project has no voice tracks, so the row draws nothing; the row's ? says what turns them on.
  return setup.layout === 'flat' ? null : <VoiceFolders />;
}

/** Read only while the layout is Voice folders, so the Story Bible and the tracks are not read for a flat project. */
function VoiceFolders() {
  const { notify } = useSettingsHost();
  const voices = useVoiceTracks(notify);
  // The tracks are the ones every screen shares (REAPER's list now, as the Engine panel and the Booth show), so a rename made in REAPER and
  // not yet saved is seen here too; they are read again on focus and every few seconds by the shared state, which toasts a failed read.
  const trackState = useChapterTrackState();
  const tracks = trackState.project?.tracks ?? NO_TRACKS;
  // The chapter list is the manuscript's; the links are the shared state's, so they are read once for every screen.
  const manuscript = usePort('manuscript');
  const [chapters, setChapters] = useState<ManuscriptChapter[]>([]);
  useEffect(() => {
    let active = true;
    manuscript
      .manuscriptChapters()
      .then((next) => active && setChapters(next))
      .catch((reason: unknown) => active && notify(describeApiError(reason), 'error'));
    return () => {
      active = false;
    };
  }, [manuscript, notify]);
  return (
    <VoicesCard
      tracks={tracks}
      chapters={chapters}
      mappings={trackState.mappings}
      setup={voices.setup}
      characters={voices.characters}
      onLayout={voices.setLayout}
      onTrackCharacters={voices.setTrackCharacters}
      onNarratorCharacter={voices.setNarratorCharacter}
      layoutInCard={false}
      bare
    />
  );
}
