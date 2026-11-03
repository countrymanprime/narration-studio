import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { apiErrorMessage } from '../../api/errorMessage';
import type { MasteringProvider, MasteringProviders } from '../../api/contracts/mastering';
import { useErrorToast } from '../../hooks/useErrorToast';
import { overlay } from '../../overlay/overlayService';
import { HelpButton } from '../primitives/HelpButton';
import { Panel } from '../primitives/Panel';
import { RadioGroup } from '../primitives/RadioGroup';
import { Badge } from '../primitives/StatusBadge';
import { TooltipTarget } from '../primitives/Tooltip';
import { saveMasteringChoiceRequest, useMasteringChoiceSaving } from './masterRequests';

const MUTED = { color: 'var(--text-muted)' };

/** The toast for a save of the mastering chain the host did not answer in time. */
export const MASTERING_SAVE_NO_ANSWER = 'The app did not answer when asked to save the mastering chain. It was read again.';

/**
 * The mastering chains and the project's choice: read on opening and again on `reload`, and saved with `choose`, whose answer is the
 * host's own state after the save. Every answer, read or save, is numbered when it is asked, and one older than the answer already
 * shown is dropped, so a read that set off before a save cannot put the old choice back. A save waits at most
 * `MASTER_REQUEST_WAIT_MS` (`masterRequests.ts`, held outside the card, so one save at a time); a refusal or no answer is a toast
 * and the rows are read again. `undefined` while loading.
 */
export function useMasteringProviders(): {
  providers?: MasteringProviders;
  problem?: string;
  saveProblem?: string;
  saving: boolean;
  reload: () => void;
  choose: (name: string) => void;
} {
  const api = useApi();
  const [providers, setProviders] = useState<MasteringProviders>();
  const [problem, setProblem] = useState<string>();
  const [saveProblem, setSaveProblem] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const saving = useMasteringChoiceSaving();
  const asked = useRef(0);
  const shown = useRef(0);
  const show = (ticket: number, state: MasteringProviders) => {
    if (ticket < shown.current) return false;
    shown.current = ticket;
    setProviders(state);
    setProblem(undefined);
    return true;
  };
  useEffect(() => {
    let active = true;
    asked.current += 1;
    const ticket = asked.current;
    api
      .masteringProviders()
      .then((state) => active && show(ticket, state))
      .catch((error) => active && setProblem(apiErrorMessage(error)));
    return () => {
      active = false;
    };
  }, [api, attempt]);
  const reload = () => setAttempt((n) => n + 1);
  const choose = (name: string) => {
    setSaveProblem(undefined);
    asked.current += 1;
    const ticket = asked.current;
    saveMasteringChoiceRequest(() => api.masteringChooseProvider(name), {
      answered: (state) => {
        if (!show(ticket, state)) return;
        const label = state.providers.find((row) => row.name === state.effective)?.label ?? state.effective;
        overlay.announce(state.effective === name ? `Saved. This project masters with ${label}.` : `Saved, but this project masters with ${label}.`);
      },
      refused: (error) => {
        setSaveProblem(`The mastering chain was not saved: ${apiErrorMessage(error)}`);
        reload();
      },
      timedOut: () => {
        setSaveProblem(MASTERING_SAVE_NO_ANSWER);
        reload();
      },
      late: reload,
    });
  };
  return { providers, problem, saveProblem, saving, reload, choose };
}

// A row this computer cannot master with: its name, carrying the host's reason as its tooltip. Marked disabled, so TooltipTarget
// makes the wrapper the tab stop that says the reason (a disabled radio cannot take focus or hover).
function Unavailable({ children }: { disabled: true; children: ReactNode }) {
  return <span>{children}</span>;
}

function rowOption(row: MasteringProvider, held: boolean) {
  if (row.support.available) return { value: row.name, label: row.label, disabled: held };
  const reason = row.support.message ?? `${row.label} is not available on this computer.`;
  return {
    value: row.name,
    label: (
      <TooltipTarget text={reason}>
        <Unavailable disabled>{row.label}</Unavailable>
      </TooltipTarget>
    ),
    disabled: true,
  };
}

/**
 * The mastering chain the book masters with (mock 05; the mastering port,
 * docs/architecture/provider-ports.md): the project's row from internal/masteringport, its fixed steps in order as a row of chips, and why the project's
 * choice is not the row it masters with, when it is not; with `onChoose`, a choice of row (#2739). The choice shows the row the host
 * says the project masters with, never the one just pressed: a press asks the host to save it and the choice moves when the host
 * answers. Every row is held while a save waits (`saving`) or an export runs or starts (`locked`), and a row this computer cannot
 * master with is off, with the host's reason as its tooltip. The built-in chain is fixed and takes its numbers from the
 * platform's rules, so mock 05's "Edit chain" is not drawn, and neither is "A/B raw ↔ mastered", which needs a player
 * for a rendered file the host does not have yet.
 */
export function MasteringChain({
  providers,
  problem,
  saveProblem,
  saving = false,
  locked = false,
  onChoose,
}: {
  providers?: MasteringProviders;
  problem?: string;
  saveProblem?: string;
  saving?: boolean;
  locked?: boolean;
  onChoose?: (name: string) => void;
}) {
  useErrorToast(problem && `The mastering chain could not be read: ${problem}`);
  useErrorToast(saveProblem);
  const row = providers?.providers.find((candidate) => candidate.name === providers.effective);
  return (
    // The long description is the body's first line, not a subtitle squeezed beside the title, so the header is as tall as its neighbours'
    // and the text does not fold into a narrow column at 390 (XMS-15, R4MS2-10).
    <Panel
      title="Mastering chain"
      actions={
        row && (
          <HelpButton label="About the mastering chain">
            {`One chain for the book: ${row.label}, the same for every platform, with each platform's own RMS window and peak limit.`}
          </HelpButton>
        )
      }
    >
      {row && (
        <>
          {providers?.notice && (
            <p role="status" className="mt-1 text-sm" style={{ color: 'var(--warn-text)' }}>
              {providers.notice}
            </p>
          )}
          {providers && providers.hasProject && onChoose && (
            <div className="mb-3">
              <RadioGroup
                label="Master with"
                value={providers.effective}
                onChange={(name) => {
                  if (name !== providers.effective) onChoose(name);
                }}
                options={providers.providers.map((candidate) => rowOption(candidate, saving || locked))}
              />
            </div>
          )}
          {row.chain.length > 0 ? (
            <ol aria-label="Mastering steps" className="flex flex-wrap items-center gap-2">
              {row.chain.map((step, index) => {
                // The chain's last step is the platform's own gain target, not one of the book's fixed steps (mock 05:
                // its chip alone is --accent-soft).
                const last = index === row.chain.length - 1;
                // The arrow leads its step inside the step's item, so a row that wraps never ends on a dangling arrow.
                return (
                  <li key={step.name} className="inline-flex items-center gap-2">
                    {index > 0 && (
                      <span aria-hidden="true" className="text-sm" style={MUTED}>
                        →
                      </span>
                    )}
                    <Badge
                      label={`${step.name} · ${step.detail}`}
                      colors={
                        last
                          ? { fill: 'var(--accent-soft)', text: 'var(--accent-strong)', line: 'transparent' }
                          : { fill: 'var(--surface-2)', text: 'var(--text)', line: 'transparent' }
                      }
                    />
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-2 text-sm" style={MUTED}>
              The chain&apos;s steps are your DAW&apos;s own FX chain.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
