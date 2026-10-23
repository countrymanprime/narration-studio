import { useEffect, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { apiErrorMessage } from '../../../api/errorMessage';
import type { WordFx } from '../../../api/contracts/wordFx';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { clock } from '../bar/clock';
import { useEffectHost } from './EffectSettings';

const CHECKING = 'Checking what the DAW can do.';
const NO_WORDS = 'These words are not in the script, so the DAW cannot be asked about them.';

/** Why the DAW cannot move to a place: the `navigate` capability's own sentence, or null when it can. */
function navigateReason(caps: DawCapabilities | null): string | null {
  if (!caps) return CHECKING;
  const support = caps.capabilities.navigate;
  return support?.available ? null : (support?.message ?? 'This DAW cannot move to a place in the project.');
}

/**
 * The inspector's "Show in the DAW" (the mock's `#reaper`): moves the DAW to the effect's first word through `workspaceGoTo`, the same call the
 * takes footer makes, and says where it went or why it did not. `reason` is why the control is off, or null.
 */
export function useShowEffectInDaw(fx: WordFx): { reason: string | null; go: () => void } {
  const daw = usePort('daw');
  const workspace = usePort('workspace');
  const host = useEffectHost();
  const [caps, setCaps] = useState<DawCapabilities | null>(null);
  const [unasked, setUnasked] = useState(false);
  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (c) => live && setCaps(c),
      () => live && setUnasked(true),
    );
    return () => {
      live = false;
    };
  }, [daw]);
  const first = host ? fx.keys.map((k) => host.locator.token(k)).find((t): t is number => t !== undefined) : undefined;
  const reason = (unasked ? 'Could not ask the DAW what it can do.' : navigateReason(caps)) ?? (host === null || first === undefined ? NO_WORDS : null);
  const go = (): void => {
    if (!host || first === undefined) return;
    workspace.workspaceGoTo(host.chapterId, first).then(
      (went) => {
        if (went.outcome === 'refused') overlay.toast(went.message, { tone: 'error' });
        else if (went.outcome === 'navigated') overlay.toast(`Moved to ${clock(went.projectTime)} in the DAW.`);
      },
      (error: unknown) => overlay.toast(`The DAW was not asked: ${apiErrorMessage(error)}`, { tone: 'error' }),
    );
  };
  return { reason, go };
}
