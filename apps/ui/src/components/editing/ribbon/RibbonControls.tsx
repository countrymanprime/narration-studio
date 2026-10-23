import type { ReactNode } from 'react';
import { IconButton } from '../../primitives/IconButton';
import { fineClock } from './rangeMath';
import type { RibbonView } from './useRibbonView';

/** The row above the waveform: what it is (`head`), what part of the audio it shows, and the zoom buttons. */
export function ZoomRow({ t0, ribbon, head }: { t0: number; ribbon: RibbonView; head?: ReactNode }) {
  const { view, canZoomIn, canZoomOut, zoom } = ribbon;
  return (
    <div className="flex h-8 min-w-0 flex-none items-center gap-2 px-3 text-xs text-[var(--text-muted)]">
      {head}
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        <span>Showing</span>
        <span className="font-mono text-[var(--text)]" data-view-label>
          {fineClock(t0 + view.start)} to {fineClock(t0 + view.start + view.len)}
        </span>
      </span>
      <span className="flex-1" />
      <IconButton action="zoomOut" size="sm" disabledReason={canZoomOut ? undefined : 'The whole recording is showing'} onClick={() => zoom(1)} />
      <IconButton action="zoomIn" size="sm" disabledReason={canZoomIn ? undefined : 'One second is the closest view'} onClick={() => zoom(-1)} />
    </div>
  );
}

/**
 * The arrow at one end of the waveform: it pages the view back or forward by a whole window. The waveform has no scrollbar (#2251, item 33):
 * these, the right-drag, the wheel, two fingers and the arrow keys on the focused waveform move it.
 */
export function ScrollEnd({ dir, ribbon }: { dir: 1 | -1; ribbon: RibbonView }) {
  const able = dir < 0 ? ribbon.canBack : ribbon.canForward;
  return (
    <IconButton
      action={dir < 0 ? 'scrollWaveBack' : 'scrollWaveForward'}
      size="sm"
      className="self-center"
      disabledReason={able ? undefined : dir < 0 ? 'The start of the recording is showing' : 'The end of the recording is showing'}
      onClick={() => ribbon.nudge(dir, true)}
    />
  );
}
