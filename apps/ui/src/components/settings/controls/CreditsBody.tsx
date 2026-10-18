import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../../api/ApiContext';
import { apiErrorMessage } from '../../../api/errorMessage';
import type { CreditsRenderResult, CreditTemplate, RetailSample } from '../../../types';
import { Button } from '../../primitives/Button';
import { StatusBadge } from '../../primitives/StatusBadge';
import { CreditsPanel } from '../CreditsPanel';
import { useSettingsHost } from '../row/SettingsHost';

type Summary = {
  opening?: { template: CreditTemplate; result?: CreditsRenderResult };
  closing?: { template: CreditTemplate; result?: CreditsRenderResult };
  sample: RetailSample | null;
};

const mmss = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

function CreditsLine({ title, part }: { title: string; part: Summary['opening'] }) {
  const unresolved = part?.result?.unresolved ?? [];
  return (
    <div className="flex flex-wrap items-center gap-2" data-credits={title}>
      <b>{title}</b>
      {!part ? (
        <span className="text-[var(--text-muted)]">No template</span>
      ) : unresolved.length > 0 ? (
        <StatusBadge tone="warning" label={`Needs ${unresolved.map((token) => token.replace(/^\[|\]$/g, '').toLowerCase()).join(', ')}`} />
      ) : (
        <>
          <StatusBadge tone="success" label="Ready" />
          <span className="text-[var(--text-muted)]">Template “{part.template.name}”</span>
        </>
      )}
    </div>
  );
}

/**
 * Credits: whether the opening and closing credits can be read as they stand (every token filled), the retail sample, and Edit credits…,
 * which opens the real editor in place: the template library, this project's values with a live preview, and the retail sample range.
 */
export function CreditsRowBody() {
  const api = useApi();
  const { notify } = useSettingsHost();
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState<Summary>();
  const [problem, setProblem] = useState('');

  const read = useCallback(async () => {
    try {
      const [templates, sample] = await Promise.all([api.creditsTemplates(), api.creditsRetailSample()]);
      const part = async (kind: string) => {
        const template = templates.find((candidate) => candidate.kind === kind);
        if (!template) return undefined;
        const result = await api.creditsPreview(template.body).catch(() => undefined);
        return { template, result };
      };
      setSummary({ opening: await part('opening'), closing: await part('closing'), sample: sample.sample });
      setProblem('');
    } catch (failure) {
      setProblem(apiErrorMessage(failure));
    }
  }, [api]);

  // The summary is read again each time the editor closes, so it says what the editor just saved.
  useEffect(() => {
    if (!editing) void read();
  }, [editing, read]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {!editing && (
        <>
          {summary ? (
            <>
              <CreditsLine title="Opening credits" part={summary.opening} />
              <CreditsLine title="Closing credits" part={summary.closing} />
              <div className="flex flex-wrap items-center gap-2">
                <b>Retail sample</b>
                <span className="text-[var(--text-muted)]">
                  {summary.sample ? `${summary.sample.words.toLocaleString('en-US')} words, ${mmss(summary.sample.seconds)}` : 'Not chosen'}
                </span>
              </div>
            </>
          ) : (
            !problem && <span className="text-[var(--text-muted)]">Reading the credits…</span>
          )}
          {problem && (
            <p role="alert" className="m-0 text-[var(--danger-text)]">
              {problem}
            </p>
          )}
        </>
      )}
      <div>
        <Button variant="secondary" size="sm" aria-expanded={editing} onClick={() => setEditing((open) => !open)}>
          {editing ? 'Close credits editor' : 'Edit credits…'}
        </Button>
      </div>
      {editing && (
        <div className="w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <CreditsPanel notify={notify} />
        </div>
      )}
    </div>
  );
}
