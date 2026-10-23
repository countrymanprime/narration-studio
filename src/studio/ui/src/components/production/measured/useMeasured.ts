import { useCallback, useEffect, useState } from 'react';
import type { Measured } from '../../../api/schemas/base';
import type { TakeLogEntry } from '../../../fixtures/measurements';
import type { MeasurementsPort } from '../../../ports/measurements';

type MeasuredAnswers = {
  roomTone: Measured<number>;
  takeLog: Measured<TakeLogEntry[]>;
  pickupSessionSeconds: Measured<number>;
  chapterLengths: Measured<Record<string, number>>;
};

export type MeasuredState =
  { status: 'loading'; answers: MeasuredAnswers | null; refresh: () => void } | { status: 'ready'; answers: MeasuredAnswers; refresh: () => void };

const REFUSED = (error: unknown): Measured<never> => ({ ok: false, reason: error instanceof Error ? error.message : 'The read failed.' });
const settle = async <T>(read: () => Promise<Measured<T>>): Promise<Measured<T>> => {
  try {
    return await read();
  } catch (error) {
    return REFUSED(error);
  }
};

/** Reads the four answers once, and again when the port instance, the microphone or the pickups change or `refresh()` is called. A refused read is a reason, never a throw; the last answer stays while re-reading. */
export function useMeasured(port: MeasurementsPort, mic: string, pickupIds: readonly string[]): MeasuredState {
  const [answers, setAnswers] = useState<MeasuredAnswers | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const ids = pickupIds.join('\u0000');
  useEffect(() => {
    let live = true;
    void Promise.all([
      settle(() => port.roomTone(mic)),
      settle(() => port.takeLog()),
      settle(() => port.pickupSessionSeconds(ids ? ids.split('\u0000') : [])),
      settle(() => port.chapterLengths()),
    ]).then(([roomTone, takeLog, pickupSessionSeconds, chapterLengths]) => {
      if (live) setAnswers({ roomTone, takeLog, pickupSessionSeconds, chapterLengths });
    });
    return () => {
      live = false;
    };
  }, [port, mic, ids, tick]);
  return answers ? { status: 'ready', answers, refresh } : { status: 'loading', answers: null, refresh };
}
