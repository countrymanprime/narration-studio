import { useEffect, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { apiErrorMessage } from '../../../api/errorMessage';
import type { WordFx } from '../../../api/contracts/wordFx';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { IconButton } from '../../primitives/IconButton';
import { clock } from '../bar/clock';
import { useEffectHost } from './EffectSettings';

const CHECKING = 'Checking what the DAW can do.';
const NO_HOST = 'The page has not linked this effect to the DAW.';
const NOT_IN_SCRIPT = 'These words are not in the script, so the DAW cannot be taken to them.';

/** Why the DAW cannot move to a place: the `navigate` capability's own sentence, or null when it can (the takes footer's rule). */
function navigateReason(caps: DawCapabilities | null): string | null {
  if (!caps) return CHECKING;
  const support = caps.capabilities.navigate;
  return support?.available ? null : (support?.message ?? 'This DAW cannot move to a place in the project.');
}

/**
 * The inspector's "Show in the DAW" (the mock's `#reaper`): moves the DAW to the effect's first word through `workspaceGoTo`, as the takes footer's
 * does for a line, and says where it went or why it did not. Off, with the reason, on a DAW that cannot navigate or for words the script lacks.
 */
export function ShowEffectInDaw({ fx }: { fx: WordFx }) {
  const daw = usePort('daw');
  const workspace = usePort('workspace');
  const host = useEffectHost();
  const [caps, setCaps] = useState<DawCapabilities | null>(null);
  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (answer) => live && setCaps(answer),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [daw]);

  const tokens = host ? fx.keys.map((k) => host.locator.token(k)).filter((t): t is number => t !== undefined) : [];
  const reason = !host ? NO_HOST : tokens.length === 0 ? NOT_IN_SCRIPT : navigateReason(caps);
  const go = async (): Promise<void> => {
    if (!host) return;
    try {
      const went = await workspace.workspaceGoTo(host.chapterId, Math.min(...tokens));
      if (went.outcome === 'refused') overlay.toast(went.message, { tone: 'error' });
      else if (went.outcome === 'navigated') overlay.toast(`Moved to ${clock(went.projectTime)} in the DAW.`);
    } catch (error) {
      overlay.toast(`The DAW was not asked: ${apiErrorMessage(error)}`, { tone: 'error' });
    }
  };
  return <IconButton action="showInReaper" label="Show in the DAW" size="sm" disabledReason={reason ?? undefined} onClick={() => void go()} />;
}
