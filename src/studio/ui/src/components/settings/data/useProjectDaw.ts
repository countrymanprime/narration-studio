import { useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import { onEngineChanged } from './engineSignal';

/**
 * The recording tool this project records with, by name (`DawChoice.daw`: "REAPER", "Audacity", "Built-in"), for the rows and sentences that are
 * about one tool. It is read when the page opens, and when "Record with" is changed here, so a
 * sentence never names the tool the project used to record with. `fallback` stands in until the first read, and when it fails.
 */
export function useProjectDaw(fallback: string): string {
  const dawChoice = usePort('dawChoice');
  const [name, setName] = useState<string>();
  useEffect(() => {
    let live = true;
    const read = () =>
      dawChoice.dawChoice().then(
        (choice) => live && setName(choice.hasProject ? choice.daw : undefined),
        () => undefined,
      );
    void read();
    const stopEngine = onEngineChanged(() => void read());
    return () => {
      live = false;
      stopEngine();
    };
  }, [dawChoice]);
  return name ?? fallback;
}
