import { useEffect, useRef } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { IconButton } from '../../primitives/IconButton';
import { clock } from '../bar/clock';
import { registerTakeControl } from './takeControls';

const CHECKING = 'Checking what the DAW can do.';

/** Why the DAW cannot move to a line: the `navigate` capability's own sentence, or null when it can. */
export function navigateReason(caps: DawCapabilities | null): string | null {
  if (!caps) return CHECKING;
  const support = caps.capabilities.navigate;
  return support?.available ? null : (support?.message ?? 'This DAW cannot move to a place in the project.');
}

/**
 * The takes footer's "Show in the DAW" (the mock's `#reaper`): moves the DAW to the line's first word through `workspaceGoTo`, and says where it
 * went or why it did not. Off, with the capability's sentence, on a DAW that cannot navigate.
 */
export function useShowInDaw(chapterId: string, caps: DawCapabilities | null): void {
  const workspace = usePort('workspace');
  const latest = useRef({ chapterId, caps, workspace });
  latest.current = { chapterId, caps, workspace };
  useEffect(
    () =>
      registerTakeControl({
        id: 'show-in-daw',
        order: 1,
        render: ({ passage }) => {
          const reason = navigateReason(latest.current.caps);
          const go = async (): Promise<void> => {
            const { workspace: ws, chapterId: id } = latest.current;
            try {
              const went = await ws.workspaceGoTo(id, passage.firstToken);
              if (went.outcome === 'refused') overlay.toast(went.message, { tone: 'error' });
              else if (went.outcome === 'navigated') overlay.toast(`Moved to ${clock(went.projectTime)} in the DAW.`);
            } catch (error) {
              overlay.toast(`The DAW was not asked: ${apiErrorMessage(error)}`, { tone: 'error' });
            }
          };
          return <IconButton action="showInReaper" label="Show in the DAW" size="sm" disabledReason={reason ?? undefined} onClick={() => void go()} />;
        },
      }),
    [],
  );
}
