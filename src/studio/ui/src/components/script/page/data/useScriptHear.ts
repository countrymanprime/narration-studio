import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import { hearKey, useHearEntry } from '../../../storybible/useHearEntry';
import type { InThisChapterRow } from '../rail/InThisChapter';

/** Said when the preview voice is not installed: the install prompt lives on the Story Bible entry, not in this rail. */
export const HEAR_NEEDS_VOICE = 'The preview voice is not installed yet. Open the name in the Story Bible and press play to install it.';

/**
 * Hear on Script's "In this chapter" rows: a Story Bible name plays the host's preview of the entry, the one the Story Bible's own list plays (`useHearEntry`).
 * Returns the row's `hear` for one name of an entry (its own, or the alias at `aliasIndex`), or undefined for a name that has no pronunciation to play.
 */
export function useScriptHear(): (entryId: string | undefined, has: boolean, aliasIndex?: number) => InThisChapterRow['hear'] {
  const storyBible = usePort('storyBible');
  const player = useHearEntry({
    requestPreview: (id, aliasIndex) => storyBible.guidePreview(id, aliasIndex),
    onAssetRequired: () => overlay.toast(HEAR_NEEDS_VOICE),
    notify: (text, tone) => overlay.toast(text, tone ? { tone } : undefined),
  });
  return (entryId, has, aliasIndex) => {
    if (!entryId || !has) return undefined;
    const key = hearKey(entryId, aliasIndex);
    return { playing: player.playingId === key, loading: player.loadingId === key, onPress: () => player.hear(entryId, aliasIndex) };
  };
}
