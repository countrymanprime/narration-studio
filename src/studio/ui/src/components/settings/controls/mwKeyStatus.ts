import { useCallback, useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import type { PronunciationOnlineKeyStatus } from '../../../types';

export const MW_KEY_CHANGED = 'narration:mw-key-changed';
const CHANGED = MW_KEY_CHANGED;

/** Tells the other bodies on the page that the Merriam-Webster key was saved or removed. */
export const announceKeyChanged = () => window.dispatchEvent(new Event(CHANGED));

/** Whether the computer is online, as the browser knows it, following the `online` and `offline` events. */
export function useNetwork(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** The key's status as the host reports it (never the key itself), read again when another body saves or removes it. `undefined` until read, or when it cannot be. */
export function useMwKeyStatus(): { status: PronunciationOnlineKeyStatus | undefined; error: string | undefined; reload: () => void } {
  const port = usePort('pronunciationOnline');
  const [status, setStatus] = useState<PronunciationOnlineKeyStatus>();
  const [error, setError] = useState<string>();
  const reload = useCallback(() => {
    port.pronunciationOnlineKeyStatus().then(
      (next) => {
        setStatus(next);
        setError(undefined);
      },
      (failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)),
    );
  }, [port]);
  useEffect(() => {
    reload();
    window.addEventListener(CHANGED, reload);
    return () => window.removeEventListener(CHANGED, reload);
  }, [reload]);
  return { status, error, reload };
}
