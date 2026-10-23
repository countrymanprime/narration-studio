import { useCallback, useState } from 'react';

export type ReferenceTarget = { entryId?: string; noteId?: string };

/**
 * What the side panel's Reference shows. A click on a Story Bible name or a marked word shows it, a click on a plain word or on empty
 * space clears it, and a new chapter starts without one.
 */
export function useBoothReference(chapterId: string): { target: ReferenceTarget | null; show: (target: ReferenceTarget) => void; clear: () => void } {
  const [state, setState] = useState<{ chapterId: string; target: ReferenceTarget | null }>({ chapterId, target: null });
  const show = useCallback((target: ReferenceTarget) => setState({ chapterId, target }), [chapterId]);
  const clear = useCallback(() => setState({ chapterId, target: null }), [chapterId]);
  return { target: state.chapterId === chapterId ? state.target : null, show, clear };
}
