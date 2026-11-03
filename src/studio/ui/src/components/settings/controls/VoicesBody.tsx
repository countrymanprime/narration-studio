import { useEffect, useState } from 'react';
import type { Track } from '../../../api/contracts/tracks';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { useChapterLinks } from '../../engine/useChapterLinks';
import { useVoiceTracks } from '../../engine/useVoiceTracks';
import { useVoiceSetup } from '../../engine/voiceLayout';
import { VoicesCard } from '../../engine/VoicesCard';
import { useSettingsHost } from '../row/SettingsHost';

const NO_TRACKS: Track[] = [];
const noop = () => {};

/**
 * The body of "Voices": the Engine panel's Voices card (the Narrator's character and who each voice track records), on the same shared voice
 * setup, without its own card. It needs the project's tracks and chapter links, which it reads as the panel does. While the layout is Flat
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
  const tracksPort = usePort('tracks');
  const voices = useVoiceTracks(notify);
  const [tracks, setTracks] = useState<Track[]>(NO_TRACKS);
  // The tracks belong to REAPER, which the narrator edits while this page is open: read them again when the window is focused again.
  const [again, setAgain] = useState(0);
  useEffect(() => {
    const bump = () => setAgain((count) => count + 1);
    window.addEventListener('focus', bump);
    return () => window.removeEventListener('focus', bump);
  }, []);
  useEffect(() => {
    let active = true;
    tracksPort
      .tracksList()
      .then((project) => active && setTracks(project.tracks))
      .catch((reason: unknown) => active && notify(describeApiError(reason), 'error'));
    return () => {
      active = false;
    };
  }, [tracksPort, notify, again]);
  const links = useChapterLinks(tracks, again, noop);
  useEffect(() => {
    if (links.error) notify(links.error, 'error');
  }, [links.error, notify]);
  return (
    <VoicesCard
      tracks={tracks}
      chapters={links.chapters}
      mappings={links.mappings}
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
