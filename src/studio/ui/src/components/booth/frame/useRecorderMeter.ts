import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePort } from '../../../ports/usePort';
import { recorderMeterFor, type RecorderMeterView } from './recorderMeter';

/**
 * The built-in recorder's level for the Levels menu (#2732): while the caller is mounted (the menu is open) and the window has focus, the
 * meter runs on `device` and its `recording:level` stream moves the row; during a take no meter is started and the take's own level moves
 * it. Unmounting, losing focus or a take starting stops the meter. The calls and their answers live in the app-wide `RecorderMeter`, so
 * none is lost when the menu closes mid-call.
 */
export function useRecorderMeter(device: string, recording: boolean): RecorderMeterView {
  const recorder = usePort('recording');
  const meter = recorderMeterFor(recorder);
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
    if (!focused) return;
    meter.want(device, recording);
    return () => meter.release();
  }, [meter, device, recording, focused]);
  return useSyncExternalStore(meter.subscribe, meter.snapshot);
}
