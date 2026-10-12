import { useEffect, useRef, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import { updateHeldPeak, type HeldPeak } from '../../../levelMeter';

export type InputLevel = { peak: number; rms: number };

const errorText = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason));

/**
 * The input level the Booth's Levels menu and footer meter read: the reading the old Booth's `useInputLevel` made (deleted
 * with it in SN-O10). One subscription to the teleprompter event stream per mount. A running take already relays `level`
 * events on it (`active`), so nothing is started then; otherwise a meter-only capture runs only while `enabled` (the menu
 * is open), is stopped when the menu closes or the component unmounts, and never starts for an empty `device`.
 */
export function useLevels(device: string, { active, enabled }: { active: boolean; enabled: boolean }) {
  const teleprompter = usePort('teleprompter');
  const [level, setLevel] = useState<InputLevel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const held = useRef<HeldPeak>({ peak: -100, at: 0 });

  useEffect(
    () =>
      teleprompter.subscribeTeleprompterEvent((event) => {
        if (event.type === 'level') {
          held.current = updateHeldPeak(held.current, event.peak, Date.now());
          setError(null);
          setLevel({ peak: held.current.peak, rms: event.rms });
        } else if (event.type === 'meter_stopped') {
          held.current = { peak: -100, at: 0 };
          setLevel(null);
          setError(event.error);
        }
      }),
    [teleprompter],
  );

  useEffect(() => {
    if (active) return;
    if (!enabled || !device.trim()) {
      setLevel(null);
      return;
    }
    let cancelled = false;
    void teleprompter.teleprompterMeterStart(device).catch((reason) => {
      if (!cancelled) setError(errorText(reason));
    });
    return () => {
      cancelled = true;
      void teleprompter.teleprompterMeterStop().catch(() => {});
      setLevel(null);
    };
  }, [teleprompter, device, active, enabled]);

  return { level, error };
}
