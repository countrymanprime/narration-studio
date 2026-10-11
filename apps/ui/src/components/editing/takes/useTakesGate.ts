import { useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import type { TakesGate } from './types';

const CHECKING: TakesGate = { ok: false, reason: 'Checking what the DAW can do.' };

/** Whether the DAW can choose a take now, with its own sentence when it cannot. */
export function useTakesGate(): TakesGate {
  const daw = usePort('daw');
  const [gate, setGate] = useState<TakesGate>(CHECKING);
  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (caps) => {
        if (!live) return;
        const support = caps.capabilities['takes'];
        setGate(support?.available ? { ok: true } : { ok: false, reason: support?.message ?? 'The DAW cannot choose a take now.' });
      },
      () => live && setGate({ ok: false, reason: 'Could not ask the DAW what it can do.' }),
    );
    return () => {
      live = false;
    };
  }, [daw]);
  return gate;
}
