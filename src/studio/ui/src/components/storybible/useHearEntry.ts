import { useRef, useState } from 'react';
import type { GuidePreview } from '../../types';
import type { Notify } from '../primitives/Toast';
import { usePreviewAudio } from './usePreviewAudio';

type HearEntryOptions = {
  /** The host's preview of one name of an entry (`guidePreview`): its own name, or the alias at `aliasIndex`. */
  requestPreview: (entryId: string, aliasIndex?: number) => Promise<GuidePreview>;
  /** The voice is not installed (or a download is wanted): the page says where to get it. */
  onAssetRequired: (entryId: string) => void;
  notify: Notify;
};

/**
 * The one "Hear this name" (audit cluster 13, docs/research/ui-function-audit.md): the host's preview of an entry's name, one playing at a time, as the entry's own
 * play button plays it. The Story Bible's list and Script's "In this chapter" rows both use it, so a name sounds the same and a missing voice is
 * handled the same way, instead of one page playing it and the other toasting that it is.
 */
/** The key `playingId` and `loadingId` answer: the entry id for its own name, `<id>#<alias index>` for an alias. */
export const hearKey = (entryId: string, aliasIndex?: number): string => (aliasIndex === undefined ? entryId : `${entryId}#${aliasIndex}`);

export function useHearEntry({ requestPreview, onAssetRequired, notify }: HearEntryOptions) {
  const target = useRef<{ entryId: string; aliasIndex?: number }>(undefined);
  const [heardId, setHeardId] = useState<string>();
  const preview = usePreviewAudio({
    resetKey: undefined,
    requestPreview: () => requestPreview(target.current!.entryId, target.current!.aliasIndex),
    onAssetRequired: () => onAssetRequired(target.current!.entryId),
    notify,
  });
  const hear = (entryId: string, aliasIndex?: number) => {
    const key = hearKey(entryId, aliasIndex);
    if (target.current && hearKey(target.current.entryId, target.current.aliasIndex) !== key) preview.stopPreview();
    target.current = { entryId, aliasIndex };
    setHeardId(key);
    void preview.playPreview();
  };
  return {
    hear,
    stop: preview.stopPreview,
    playingId: preview.playingPreview ? heardId : undefined,
    loadingId: preview.loadingPreview ? heardId : undefined,
  };
}
