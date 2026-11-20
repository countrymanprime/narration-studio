import { useCallback, useEffect, useRef, useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { NewChapterTracks, choiceOf, useNewChapterPick, type NewChapterPick } from '../../chapterTracks/NewChapterTracks';
import { useVoiceSetup } from '../../engine/voiceLayout';
import { projectDataChanged } from '../data/projectDataSignal';
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
  // The list is read again when the voice assignments change (the Voices row above): a voice given a character is a known voice at once.
  const { setup } = useVoiceSetup();
  const assigned = setup.tracks.map((entry) => entry.track).join('\n');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const read = useCallback(() => trackMap.chapterCreateOptions(), [trackMap, assigned]);
  const { pick, setPick, failed, narrator } = useNewChapterPick(true, read);
  // A list that cannot be read is a toast, not a line in the row: the row stays as it was.
  useEffect(() => {
    if (failed) notify('The tracks a new chapter folder is made with could not be read.', 'error');
  }, [failed, notify]);
  // Each tick saves the whole pick, one save at a time and in the order ticked, so two quick ticks cannot land the other way round. The row shows the
  // host's own answer once the last save is in, and what the host holds after a save that failed: never a pick the host does not hold.
  const saves = useRef(Promise.resolve());
  const latest = useRef(0);
  if (!pick) return null;
  const change = (next: NewChapterPick) => {
    setPick(next);
    const mine = ++latest.current;
    saves.current = saves.current.then(async () => {
      try {
        const options = await trackMap.chapterCreateDefaultSet(choiceOf(next));
        if (mine === latest.current && options.folders) setPick({ voices: options.voices, extras: options.extras, omitted: options.omitted });
        // Changed reads the row again: it differs from its default while a voice or Extras is left out.
        projectDataChanged();
      } catch (reason: unknown) {
        notify(describeApiError(reason), 'error');
        if (mine !== latest.current) return;
        const held = await trackMap.chapterCreateOptions().catch(() => null);
        if (mine === latest.current && held?.folders) setPick({ voices: held.voices, extras: held.extras, omitted: held.omitted });
      }
    });
  };
  return <NewChapterTracks narrator={narrator} pick={pick} onChange={change} />;
}
