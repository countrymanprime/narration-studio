import { useEffect, useState } from 'react';
import type { AudacityLink } from '../../api/contracts/daw';
import { apiErrorMessage } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';
import { Button } from '../primitives/Button';
import { StatusBadge } from '../primitives/StatusBadge';
import type { Notify } from '../primitives/Toast';
import { audacityTitle, audacityTone, heardText } from './audacityLinkText';
import type { AudacityLinkView } from './useAudacityLink';

/** Re-renders once a second while mounted, so "last heard N s ago" counts up between the host's pushes. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * How far the project is from talking to Audacity 3, and the one step that moves it on: the host's sentence for the state, the
 * first-start steps, and the actions that apply (start Audacity, turn scripting on, link the open project, choose or unlink the
 * Audacity project file). Every state but "answering" is recoverable and says how. When Audacity goes quiet the card says when it was
 * last heard instead of keeping the last answer as if it were current, and Check again asks Audacity at once.
 */
export function AudacityLinkCard({ view, notify }: { view: AudacityLinkView; notify: Notify }) {
  const port = usePort('audacityLink');
  const project = usePort('project');
  const { link, error, receivedAt, check, adopt } = view;
  const [busy, setBusy] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const now = useNow(link !== undefined && link.state !== 'answering');

  if (!link) {
    return error ? (
      <p role="alert" className="text-[0.8125rem] text-[var(--danger-text)]">
        {error}
      </p>
    ) : (
      <p className="text-[0.8125rem] text-[var(--text-muted)]">Reading how Audacity is doing…</p>
    );
  }

  const run = async (name: string, call: () => Promise<AudacityLink | void>) => {
    setBusy(name);
    try {
      const next = await call();
      if (next) adopt(next);
      setProblem(undefined);
    } catch (failure) {
      setProblem(apiErrorMessage(failure));
    } finally {
      setBusy(undefined);
    }
  };

  const heard = link.state === 'answering' ? null : heardText(link, receivedAt, now);
  const stepsOpen = link.steps.some((step) => !step.done);
  const answering = link.state === 'answering' || link.state === 'no_project';
  const canLinkOpen = link.state === 'answering' && link.openProject !== 'linked';
  const canStart = link.action === 'launch';

  return (
    <div
      role="group"
      aria-label="Audacity connection"
      data-audacity-state={link.state}
      className="flex flex-col items-start gap-2 rounded-md p-3 text-[0.8125rem]"
      style={{ background: 'var(--surface-2)' }}
    >
      <StatusBadge tone={audacityTone(link)} label={audacityTitle(link)} />
      <span className="text-[var(--text-muted)]">{link.message}</span>
      {link.linkedFile && <span className="text-[var(--text-muted)]">Linked to {link.linkedFile}.</span>}
      <span role="status" className="text-[var(--text-muted)]">
        {heard ? `Last heard from Audacity ${heard}.` : link.state !== 'answering' && link.chosen ? 'Audacity has not answered since this project opened.' : ''}
      </span>
      <details open={stepsOpen} className="text-[var(--text-muted)]">
        <summary className="cursor-pointer font-medium text-[var(--text)]">Set up Audacity</summary>
        <ol className="mt-1.5 list-none space-y-1 pl-0">
          {link.steps.map((step) => (
            <li key={step.id} data-done={step.done}>
              <span aria-hidden="true">{step.done ? '✓' : '○'}</span> <span className="sr-only">{step.done ? 'Done: ' : 'Not yet: '}</span>
              {step.label}
            </li>
          ))}
        </ol>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        {canStart && (
          <Button
            variant="primary"
            size="sm"
            disabled={busy !== undefined}
            onClick={() =>
              void run('start', async () => {
                await project.launchDaw();
                notify('Started Audacity. The app connects when it answers.');
              })
            }
          >
            {busy === 'start' ? 'Starting Audacity…' : 'Start Audacity'}
          </Button>
        )}
        {link.action === 'enable_module' && (
          <Button variant="primary" size="sm" disabled={busy !== undefined} onClick={() => void run('module', () => port.audacityEnableModule())}>
            Turn on scripting
          </Button>
        )}
        {canLinkOpen && (
          <Button variant="primary" size="sm" disabled={busy !== undefined} onClick={() => void run('open', () => port.audacityLinkOpenProject())}>
            Link the open Audacity project
          </Button>
        )}
        <Button variant="secondary" size="sm" disabled={busy !== undefined} onClick={() => void run('file', () => port.audacityLinkFile())}>
          {link.linkedFile ? 'Change Audacity project file' : 'Choose Audacity project file'}
        </Button>
        {link.linked && (
          <Button variant="secondary" size="sm" disabled={busy !== undefined} onClick={() => void run('unlink', () => port.audacityUnlink())}>
            Unlink
          </Button>
        )}
        <Button variant="secondary" size="sm" disabled={busy !== undefined} onClick={() => void run('check', () => check())}>
          {busy === 'check' ? 'Checking…' : 'Check again'}
        </Button>
      </div>
      {link.linked && answering && (
        <span className="text-[var(--text-muted)]">Unlinking leaves the link label in the Audacity project; delete it there if you like.</span>
      )}
      {(problem ?? error) && (
        <p role="alert" className="text-[var(--danger-text)]">
          {problem ?? error}
        </p>
      )}
    </div>
  );
}
