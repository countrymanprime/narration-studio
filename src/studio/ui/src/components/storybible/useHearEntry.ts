import { useRef, useState } from 'react';
import type { GuidePreview } from '../../types';
import type { Notify } from '../primitives/Toast';
import { usePreviewAudio } from './usePreviewAudio';

type HearEntryOptions = {
  /** The host's preview of an entry's name (`guidePreview`). */
  requestPreview: (entryId: string) => Promise<GuidePreview>;
  /** The voice is not installed (or a download is wanted): the page says where to get it. */
  onAssetRequired: (entryId: string) => void;
  notify: Notify;
};

/**
 * The one "Hear this name" (audit cluster 13, docs/research/ui-function-audit.md): the host's preview of an entry's name, one playing at a time, as the entry's own
 * play button plays it. The Story Bible's list and Script's "In this chapter" rows both use it, so a name sounds the same and a missing voice is
 * handled the same way, instead of one page playing it and the other toasting that it is.
 */
export function useHearEntry({ requestPreview, onAssetRequired, notify }: HearEntryOptions) {
  const target = useRef<string>(undefined);
  const [heardId, setHeardId] = useState<string>();
  const preview = usePreviewAudio({
    resetKey: undefined,
    requestPreview: () => requestPreview(target.current!),
    onAssetRequired: () => onAssetRequired(target.current!),
    notify,
  });
  const hear = (id: string) => {
    if (target.current !== id) preview.stopPreview();
    target.current = id;
    setHeardId(id);
    void preview.playPreview();
  };
  return {
    hear,
    stop: preview.stopPreview,
    playingId: preview.playingPreview ? heardId : undefined,
    loadingId: preview.loadingPreview ? heardId : undefined,
  };
}
