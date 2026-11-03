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
 * setup. It needs the project's tracks and chapter links, which it reads as the panel does. While the layout is Flat there are no voice
 * tracks, and the row says what turns them on.
 */
export function VoicesBody() {
  const { setup } = useVoiceSetup();
  if (setup.layout === 'flat') {
    return (
      <p className="text-[0.8125rem] text-[var(--text-muted)]">
        Each chapter records on one track. Choose Voice folders under Chapter layout to give each voice its own.
      </p>
    );
  }
  return <VoiceFolders />;
}

/** Read only while the layout is Voice folders, so the Story Bible and the tracks are not read for a flat project. */
function VoiceFolders() {
  const { notify } = useSettingsHost();
  const tracksPort = usePort('tracks');
  const voices = useVoiceTracks(notify);
  const [tracks, setTracks] = useState<Track[]>(NO_TRACKS);
  useEffect(() => {
    let active = true;
    tracksPort
      .tracksList()
      .then((project) => active && setTracks(project.tracks))
      .catch((reason: unknown) => active && notify(describeApiError(reason), 'error'));
    return () => {
      active = false;
    };
  }, [tracksPort, notify]);
  const links = useChapterLinks(tracks, 0, noop);
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
    />
  );
}
