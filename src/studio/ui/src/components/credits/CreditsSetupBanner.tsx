import { useState } from 'react';
import { apiErrorMessage } from '../../api/errorMessage';
import { useApi } from '../../api/ApiContext';
import type { CreditsSetupState } from '../../types';
import { Button } from '../primitives/Button';
import { Dot } from '../primitives/StatusBadge';
import { Panel } from '../primitives/Panel';
import type { Notify } from '../primitives/Toast';

/**
 * The credits-setup banner: the way back to the "Set up the credits" dialog once the narrator has pressed
 * Not now, or after Save leaves some tokens still unresolved. Shown on the Production home and above the Manuscript
 * credits card whenever `CreditsSetupState.banner` is true - which the host already limits to "tokens are unresolved
 * and the narrator has not said Don't ask".
 */
export function CreditsSetupBanner({
  state,
  onDone,
  onFillIn,
  notify,
}: {
  state: CreditsSetupState;
  onDone: (next: CreditsSetupState) => void;
  onFillIn: () => void;
  notify: Notify;
}) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const tokens = state.fields.map((field) => field.token);
  const dontAsk = async () => {
    setBusy(true);
    try {
      onDone(await api.creditsSetupDismiss('project'));
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel tone="review">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The dot sits on the sentence's first line, in a box one line tall, however many lines the sentence wraps to (XSC-15). */}
        <div className="flex items-start gap-2 text-sm">
          <span className="flex h-5 flex-none items-center">
            <Dot color="var(--review)" />
          </span>
          <span>
            <strong>
              The credits need {tokens.length} value{tokens.length === 1 ? '' : 's'}
            </strong>{' '}
            — {tokens.join(', ')} will be read as written, in brackets.
          </span>
        </div>
        <div className="flex flex-none gap-2 [&>button]:whitespace-nowrap">
          <Button variant="secondary" type="button" disabled={busy} onClick={() => void dontAsk()}>
            Don&rsquo;t ask for this project
          </Button>
          <Button variant="primary" type="button" disabled={busy} onClick={onFillIn}>
            Fill in
          </Button>
        </div>
      </div>
    </Panel>
  );
}
