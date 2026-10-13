import { useEffect, useState } from 'react';
import type { DawChoice } from '../../../api/contracts/daw';
import { usePort } from '../../../ports/usePort';

/**
 * The project's DAW choice (`dawChoice`), read on mount and again whenever the capability report changes (the DAW starts or stops
 * answering, the project switches), so the Booth's setup chip says whether the project's DAW is linked, connected or not running.
 * null when the read fails: the chip then words the capability report alone.
 */
export function useDawChoice(): DawChoice | null | undefined {
  const api = usePort('dawChoice');
  const capabilities = usePort('dawCapabilities');
  const [choice, setChoice] = useState<DawChoice | null>();
  useEffect(() => {
    let live = true;
    const read = () =>
      api.dawChoice().then(
        (next) => live && setChoice(next),
        () => live && setChoice(null),
      );
    void read();
    const unsubscribe = capabilities.subscribeDawCapabilities(() => void read());
    return () => {
      live = false;
      unsubscribe();
    };
  }, [api, capabilities]);
  return choice;
}
