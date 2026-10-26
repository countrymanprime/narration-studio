import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from '../../../motion';
import { subscribeFrames } from './frameLoop';
import { swellPhase } from './waveSwell';

export interface WaveSwellOptions {
  /** Whether the swell should run now (the chapter is playing, or the waveform is being read). */
  active: boolean;
  /** The element the swell is drawn in; the loop stops while it is off screen. */
  target: Element | null;
  /** A fixed phase (0..1) to draw instead of running the clock, for a story or a screenshot that must be the same on every run. */
  fixedPhase?: number;
  /** Changes when the motion choice may have changed (the root's `data-motion`, the system setting), so it is read again. */
  motionKey?: unknown;
  /** Draws one frame: the swell's phase and the frame clock. */
  onFrame: (phase: number, nowMs: number) => void;
  /** Draws the still look, once, when the loop stops. */
  onStill: () => void;
}

/**
 * Runs the waveform swell on the shared frame loop (`frameLoop.ts`): only while `active`, motion is wanted, the page is shown and `target` is
 * on screen, so a hidden or scrolled-away waveform schedules no frames. Nothing goes through React state per frame; `onFrame` draws straight
 * to the canvas. Returns whether the loop is running.
 */
export function useWaveSwell({ active, target, fixedPhase, motionKey, onFrame, onStill }: WaveSwellOptions): boolean {
  const draw = useRef({ onFrame, onStill });
  draw.current = { onFrame, onStill };
  const [onScreen, setOnScreen] = useState(true);
  const [shown, setShown] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');

  useEffect(() => {
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => setOnScreen(entries[entries.length - 1]?.isIntersecting ?? true));
    io.observe(target);
    return () => io.disconnect();
  }, [target]);
  useEffect(() => {
    const update = () => setShown(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const running = active && fixedPhase == null && onScreen && shown && !reducedMotion();
  useEffect(() => {
    if (!running) return;
    let start: number | null = null;
    const stop = subscribeFrames((now) => {
      start ??= now;
      draw.current.onFrame(swellPhase(now - start), now);
    });
    return () => {
      stop();
      draw.current.onStill();
    };
  }, [running, motionKey]);
  return running;
}
