import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { reducedMotion } from '../../../motion';
import { IconButton } from '../../primitives/IconButton';
import { Tooltip } from '../../primitives/Tooltip';
import { subscribeFrames } from './frameLoop';
import { createHoldScroll } from './holdScroll';
import { fineClock } from './rangeMath';
import { readScrollStep } from './scrollStep';
import type { RibbonView } from './useRibbonView';

/** The row above the waveform: what it is (`head`), what part of the audio it shows, a "?" with its `gestures`, and the zoom buttons. */
export function ZoomRow({ t0, ribbon, head, gestures }: { t0: number; ribbon: RibbonView; head?: ReactNode; gestures?: string }) {
  const { view, canZoomIn, canZoomOut, zoom } = ribbon;
  const range = `${fineClock(t0 + view.start)} to ${fineClock(t0 + view.start + view.len)}`;
  return (
    <div className="flex h-8 min-w-0 flex-none items-center gap-2 px-3 text-xs text-[var(--text-muted)]">
      {head}
      <span className="flex min-w-0 items-center gap-1.5" title={`Showing ${range}`}>
        <span className="flex-none">Showing</span>
        <span className="min-w-0 truncate font-mono text-[var(--text)]" data-view-label>
          {range}
        </span>
      </span>
      <span className="flex-1" />
      {gestures ? <Tooltip text={gestures} label="Waveform gestures" icon="?" /> : null}
      <IconButton action="zoomOut" size="sm" disabledReason={canZoomOut ? undefined : 'The whole recording is showing'} onClick={() => zoom(1)} />
      <IconButton action="zoomIn" size="sm" disabledReason={canZoomIn ? undefined : 'One second is the closest view'} onClick={() => zoom(-1)} />
    </div>
  );
}

/**
 * The arrow at one end of the waveform: a click moves the view by one step (Settings, 15 to 30 s), holding it scrolls on smoothly until it is let go
 * (`holdScroll.ts`). The waveform has no scrollbar (#2251, item 33): these, the right-drag, the wheel, two fingers and the arrow keys on the
 * focused waveform move it. A key press on the button arrives as a click with no pointer and steps once.
 */
export function ScrollEnd({ dir, ribbon }: { dir: 1 | -1; ribbon: RibbonView }) {
  const able = dir < 0 ? ribbon.canBack : ribbon.canForward;
  const latest = useRef(ribbon);
  useEffect(() => {
    latest.current = ribbon;
  });
  const scroll = useMemo(
    () =>
      createHoldScroll({
        view: () => ({ start: latest.current.view.start, len: latest.current.view.len, total: latest.current.total }),
        scrollTo: (start) => latest.current.scrollTo(start),
        step: readScrollStep,
        reducedMotion,
        subscribe: subscribeFrames,
      }),
    [],
  );
  // A button that goes away mid-hold (the chapter changed) must not keep scrolling.
  useEffect(() => () => scroll.cancel(), [scroll]);
  // At either end of the recording the button turns off and the hold ends there.
  useEffect(() => {
    if (!able) scroll.cancel();
  }, [able, scroll]);
  return (
    <IconButton
      action={dir < 0 ? 'scrollWaveBack' : 'scrollWaveForward'}
      size="lane"
      disabledReason={able ? undefined : dir < 0 ? 'The start of the recording is showing' : 'The end of the recording is showing'}
      onPointerDown={(event) => {
        if (event.button === 0 && able) scroll.press(dir);
      }}
      onPointerUp={() => scroll.release()}
      onPointerLeave={() => scroll.cancel()}
      onPointerCancel={() => scroll.cancel()}
      onBlur={() => scroll.cancel()}
      onClick={(event) => {
        if (event.detail === 0) scroll.step(dir);
      }}
    />
  );
}
