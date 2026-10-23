import { createContext, useContext } from 'react';
import type { WordFx } from '../../../../api/contracts/wordFx';

/** What the marker after an effect's last word offers: the chapter's effects, and selecting or taking one off. */
export interface FxMarkers {
  effects: readonly WordFx[];
  onSelect: (fx: WordFx) => void;
  onRemove: (fx: WordFx) => void;
}

export const FxMarkersContext = createContext<FxMarkers | null>(null);

/** The stored effect with this id and what the marker can do with it, or null outside the page or for an effect it has not read. */
export function useFxMarker(id: string | undefined): (FxMarkers & { fx: WordFx }) | null {
  const markers = useContext(FxMarkersContext);
  const fx = id === undefined ? undefined : markers?.effects.find((e) => e.id === id);
  return markers && fx ? { ...markers, fx } : null;
}
