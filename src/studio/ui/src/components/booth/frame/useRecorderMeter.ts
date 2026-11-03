import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePort } from '../../../ports/usePort';
import { recorderMeterFor, type RecorderMeterView } from './recorderMeter';

/**
 * The built-in recorder's level for the Levels menu (#2732): while the caller is mounted (the menu is open) and the window has focus, the
 * meter runs on `device` and its `recording:level` stream moves the menu's input meter; during a take no meter is started and the take's
 * own level moves it. `device` is null until the recorder has listed its microphones, and "" when none it lists is chosen: nothing is
 * started then. Unmounting stops the meter; losing focus pauses it (stopped, and the menu says so) until the window has focus again. The
 * calls and their answers live in the app-wide meter, so none is lost when the menu closes mid-call.
 */
export function useRecorderMeter(device: string | null, recording: boolean): RecorderMeterView & { retry: () => void } {
  const meter = recorderMeterFor(usePort('recording'));
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const blur = () => setFocused(false);
    const focus = () => setFocused(true);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
    };
  }, []);
  useEffect(() => {
    if (device === null) meter.release();
    else if (!focused) meter.pause();
    else meter.want(device, recording);
  }, [meter, device, recording, focused]);
  useEffect(() => () => meter.release(), [meter]);
  const view = useSyncExternalStore(meter.subscribe, meter.snapshot);
  return { ...view, retry: () => meter.retry() };
}
