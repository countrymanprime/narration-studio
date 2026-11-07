import { useEffect, useRef } from 'react';
import { ShowInDawButton } from '../../engine/ShowInDaw';
import { registerTakeControl } from './takeControls';

/**
 * The takes footer's "Show in {DAW}" (the mock's `#reaper`): the one shared `ShowInDawButton`, aimed at the line's first word. Which DAW it names,
 * where it went and why it is off are the shared button's (#2826).
 */
export function useShowInDawTakeControl(chapterId: string): void {
  const latest = useRef(chapterId);
  latest.current = chapterId;
  useEffect(
    () =>
      registerTakeControl({
        id: 'show-in-daw',
        order: 1,
        render: ({ passage }) => <ShowInDawButton size="sm" target={{ kind: 'passage', chapterId: latest.current, token: passage.firstToken }} />,
      }),
    [],
  );
}
