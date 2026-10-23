import { statusTone, type StatusId } from '../../kinds/statusTone';
import type { StatusTone } from '../primitives/StatusBadge';

/** Where an installable thing (an analysis tool, a model, the local dictionary) stands. `absent` is a dictionary the host does not offer. */
export type InstallState = 'installed' | 'downloading' | 'verifying' | 'failed' | 'missing' | 'repair' | 'unavailable' | 'absent';

// The one pill map for tools, models and the dictionary: the registry status sets the tone (kinds/statusTone.ts), the words say what
// happened. A failed download is danger, one that needs repair is a warning, one running is info, one that is not there is neutral.
const PILL: Record<InstallState, { status: StatusId; label: string }> = {
  installed: { status: 'installed', label: 'Installed · checked' },
  downloading: { status: 'downloading', label: 'Downloading' },
  verifying: { status: 'verifying', label: 'Checking the download' },
  failed: { status: 'failed', label: 'Download failed' },
  missing: { status: 'not_installed', label: 'Not installed' },
  repair: { status: 'repair', label: 'Needs repair' },
  unavailable: { status: 'unavailable', label: 'Not available yet' },
  absent: { status: 'unavailable', label: 'Not available yet' },
};

/** The tone and words of an install state's pill. */
export function installPill(state: InstallState): { tone: StatusTone; label: string } {
  const { status, label } = PILL[state];
  return { tone: statusTone(status), label };
}
