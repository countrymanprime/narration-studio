import { useEffect, useState } from 'react';
import type { DawChoice } from '../../../api/contracts/daw';
import { useDawState } from '../../../daw/useDawSession';
import { usePort } from '../../../ports/usePort';

/**
 * The project's DAW choice (`dawChoice`), read on mount and again whenever the capability report changes (the DAW starts or stops
 * answering, the project switches), so the Booth's setup chip says whether the project's DAW is linked, connected or not running.
 * null when the read fails: the chip then words the capability report alone.
 */
export function useDawChoice(): DawChoice | null | undefined {
  const api = usePort('dawChoice');
  const capsVersion = useDawState((state) => state.capsVersion);
  const [choice, setChoice] = useState<DawChoice | null>();
  useEffect(() => {
    let live = true;
    const read = () =>
      api.dawChoice().then(
        (next) => live && setChoice(next),
        () => live && setChoice(null),
      );
    void read();
    return () => {
      live = false;
    };
  }, [api, capsVersion]);
  return choice;
}
