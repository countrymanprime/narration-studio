import { createContext, useContext, useCallback } from 'react';
import { usePort } from '../../ports/usePort';
import type { DawLinkResult } from '../../api/contracts/project';

/** What pressing "link the project file" came to: the one answer every place that offers it reads (audit cluster 11, docs/research/ui-function-audit.md). */
export type LinkOutcome =
  /** The narrator closed the file picker: nothing was asked for, so nothing is said. */
  | { kind: 'cancelled' }
  | { kind: 'linked'; note?: string }
  /** A file was chosen and the host would not link it; `message` is the host's sentence. */
  | { kind: 'refused'; message: string }
  | { kind: 'failed'; error: unknown }
  /** Another link was already open (the host's file dialog is native and modal), so this press did nothing. */
  | { kind: 'busy' };

export type LinkDawFile = () => Promise<LinkOutcome>;

/** Runs the host's link call and says what it came to. */
export async function linkOutcome(link: () => Promise<DawLinkResult>): Promise<LinkOutcome> {
  try {
    const result = await link();
    if (!result.selected) return { kind: 'cancelled' };
    if (!result.linked) return { kind: 'refused', message: result.message || 'That project file could not be linked.' };
    return { kind: 'linked', ...(result.note ? { note: result.note } : {}) };
  } catch (error) {
    return { kind: 'failed', error };
  }
}

/** The app's one guarded link action, from App (a second press from any place while the picker is open is `busy`). */
export const LinkDawFileContext = createContext<LinkDawFile | null>(null);

/**
 * The one "link the project file" action: App's, so the engine panel, Settings and the Booth share one guard and one result. Without a provider
 * (a component test) it calls the host's link directly.
 */
export function useLinkDawFile(): LinkDawFile {
  const shared = useContext(LinkDawFileContext);
  const project = usePort('project');
  const own = useCallback(() => linkOutcome(() => project.linkDawFile()), [project]);
  return shared ?? own;
}
