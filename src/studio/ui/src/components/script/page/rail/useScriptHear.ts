import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import { useHearEntry } from '../../../storybible/useHearEntry';
import type { InThisChapterRow } from './InThisChapter';

/** Said when the preview voice is not installed: the install prompt lives on the Story Bible entry, not in this rail. */
export const HEAR_NEEDS_VOICE = 'The preview voice is not installed yet. Open the name in the Story Bible and press play to install it.';

/**
 * Hear on Script's "In this chapter" rows: a Story Bible name plays the host's preview of the entry, the one the Story Bible's own list plays (`useHearEntry`).
 * Returns the row's `hear` for an entry id, or undefined for a name that has no pronunciation to play.
 */
export function useScriptHear(): (entryId: string | undefined, has: boolean) => InThisChapterRow['hear'] {
  const storyBible = usePort('storyBible');
  const player = useHearEntry({
    requestPreview: (id) => storyBible.guidePreview(id),
    onAssetRequired: () => overlay.toast(HEAR_NEEDS_VOICE),
    notify: (text, tone) => overlay.toast(text, tone ? { tone } : undefined),
  });
  return (entryId, has) =>
    entryId && has ? { playing: player.playingId === entryId, loading: player.loadingId === entryId, onPress: () => player.hear(entryId) } : undefined;
}
