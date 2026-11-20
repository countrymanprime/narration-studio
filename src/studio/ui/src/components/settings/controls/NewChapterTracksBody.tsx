import { useCallback } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { NewChapterTracks, useNewChapterPick, type NewChapterPick } from '../../chapterTracks/NewChapterTracks';
import { useVoiceSetup } from '../../engine/voiceLayout';
import { useSettingsHost } from '../row/SettingsHost';

/**
 * The body of "New chapter folder": the voices and Extras a new chapter folder is made with, the same checklist the create dialog shows, saved as
 * you tick (#3748). While the layout is Flat a chapter is one track and there is nothing to choose, so the row's body is empty.
 */
export function NewChapterTracksBody() {
  const { setup } = useVoiceSetup();
  return setup.layout === 'flat' ? null : <Checklist />;
}

function Checklist() {
  const trackMap = usePort('chapterTrackMap');
  const { notify } = useSettingsHost();
  const read = useCallback(() => trackMap.chapterCreateOptions(), [trackMap]);
  const { pick, setPick, failed } = useNewChapterPick(true, read);
  if (failed) return <p role="alert">The tracks a new chapter folder is made with could not be read.</p>;
  if (!pick) return null;
  const change = (next: NewChapterPick) => {
    const before = pick;
    setPick(next);
    trackMap
      .chapterCreateDefaultSet({ voices: next.voices.filter((voice) => voice.checked).map((voice) => voice.name), extras: next.extras.checked })
      .catch((reason: unknown) => {
        // Not kept: the list goes back to what is, so it never shows a choice the next chapter will not get.
        setPick(before);
        notify(describeApiError(reason), 'error');
      });
  };
  return <NewChapterTracks narrator="Narrator" pick={pick} onChange={change} />;
}
