import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import type { RecordingEngine } from '../../api/contracts/recording';

/** The project's recording engine for the engine chip (App.tsx): REAPER until the project chooses the built-in recorder. */
export function useRecordingEngine(): RecordingEngine {
  const api = useApi();
  const [engine, setEngine] = useState<RecordingEngine>('daw');
  useEffect(() => {
    let live = true;
    // A live change is newer than the first answer, which may still be on its way: once one arrives, the answer is dropped.
    let changed = false;
    const unsubscribe = api.subscribeRecorderState((state) => {
      changed = true;
      setEngine(state.engine);
    });
    void api
      .recorderState()
      .then((state) => live && !changed && setEngine(state.engine))
      .catch(() => {});
    return () => {
      live = false;
      unsubscribe();
    };
  }, [api]);
  return engine;
}
