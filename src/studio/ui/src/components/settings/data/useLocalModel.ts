import { useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';

/** What a row says while the host has not answered whether a local model is installed. */
const CHECKING_LOCAL_MODEL = 'Checking for a local model…';
/** What it says when the host cannot be asked: the controls stay off rather than promise a model that may not be there. */
const CANNOT_TELL_LOCAL_MODEL = 'Could not check for a local model.';

/**
 * Why the local model for unknown speakers cannot be used right now, or undefined when it can: the host's own sentence for its
 * `local-model` extraction source ("No local model is installed."), `CHECKING_LOCAL_MODEL` until it answers and
 * `CANNOT_TELL_LOCAL_MODEL` when it cannot be asked. The Unknown speakers switch and the rows it governs all read it here, so they
 * agree. `ask` false reads nothing and answers undefined, for a row that does not depend on the model.
 */
export function useLocalModelMissing(ask = true): string | undefined {
  const extraction = usePort('extraction');
  const [missing, setMissing] = useState<string | undefined>(ask ? CHECKING_LOCAL_MODEL : undefined);
  useEffect(() => {
    if (!ask) return;
    let alive = true;
    extraction.extractionSources().then(
      (sources) => {
        const model = sources.find((source) => source.id === 'local-model');
        if (alive) setMissing(model?.available ? undefined : model?.reason || 'No local model is installed.');
      },
      () => alive && setMissing(CANNOT_TELL_LOCAL_MODEL),
    );
    return () => {
      alive = false;
    };
  }, [ask, extraction]);
  return missing;
}
