import { useCallback, useEffect, useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { NewChapterTracks, useNewChapterPick, type NewChapterPick } from '../../chapterTracks/NewChapterTracks';
import { useVoiceSetup } from '../../engine/voiceLayout';
import { useSettingsHost } from '../row/SettingsHost';

/** Sent when the default pick was put back from outside the row (the header's Reset to defaults), so the list reads it again. */
export const NEW_CHAPTER_DEFAULT_CHANGED = 'narration:new-chapter-default-changed';

/**
 * The body of "New chapter folder": the voices and Extras a new chapter folder is made with, the same checklist the create dialog shows, saved as
 * you tick (#3748). While the layout is Flat a chapter is one track and there is nothing to choose, so the row's body is empty.
 */
export function NewChapterTracksBody() {
  const { setup } = useVoiceSetup();
  // A reset from outside puts the ticks back, so the list is read again rather than showing what it held.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const again = () => setVersion((n) => n + 1);
    window.addEventListener(NEW_CHAPTER_DEFAULT_CHANGED, again);
    return () => window.removeEventListener(NEW_CHAPTER_DEFAULT_CHANGED, again);
  }, []);
  return setup.layout === 'flat' ? null : <Checklist key={version} />;
}

function Checklist() {
  const trackMap = usePort('chapterTrackMap');
  const { notify } = useSettingsHost();
  const read = useCallback(() => trackMap.chapterCreateOptions(), [trackMap]);
  const { pick, setPick, failed, narrator } = useNewChapterPick(true, read);
  // A list that cannot be read is a toast, not a line in the row: the row stays as it was.
  useEffect(() => {
    if (failed) notify('The tracks a new chapter folder is made with could not be read.', 'error');
  }, [failed, notify]);
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
  return <NewChapterTracks narrator={narrator} pick={pick} onChange={change} />;
}
