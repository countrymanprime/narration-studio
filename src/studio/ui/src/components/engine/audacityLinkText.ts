import type { AudacityLink, AudacityLinkState } from '../../api/contracts/daw';
import type { StatusTone } from '../primitives/StatusBadge';

/** The short title a state wears on the card and the chip's tooltip. The host's `message` is the sentence under it. */
export function audacityTitle(link: AudacityLink): string {
  const titles: Record<AudacityLinkState, string> = {
    unsupported: 'Not available here',
    not_installed: 'Not found',
    not_running: 'Not running',
    module_off: 'Scripting is off',
    needs_restart: 'Needs a restart',
    audacity4: "Audacity 4 can't be linked",
    dialog: 'May be waiting on a dialog',
    no_project: 'No project open',
    answering: link.openProject === 'linked' ? 'Audacity linked' : link.openProject === 'other' ? 'A different project is open' : 'Audacity answering',
  };
  return titles[link.state];
}

/** The badge tone: linked is green, a state the narrator can walk out of by one action is neutral, one that needs attention is a warning. */
export function audacityTone(link: AudacityLink): StatusTone {
  switch (link.state) {
    case 'answering':
      return link.openProject === 'linked' ? 'success' : link.openProject === 'other' ? 'warning' : 'neutral';
    case 'not_running':
      return 'neutral';
    default:
      return 'warning';
  }
}

/** "last heard 12 s ago" from the answer's own age plus the time since it arrived; null when Audacity has not answered since the project opened. */
export function heardText(link: AudacityLink, receivedAt: number | undefined, now: number): string | null {
  if (link.heardSecondsAgo === null) return null;
  const since = receivedAt === undefined ? 0 : Math.max(0, Math.floor((now - receivedAt) / 1000));
  const seconds = link.heardSecondsAgo + since;
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`;
}
