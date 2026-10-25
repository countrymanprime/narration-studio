import { useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { Field } from '../../primitives/Field';
import { StatusBadge } from '../../primitives/StatusBadge';
import { useSettingsHost } from '../row/SettingsHost';
import { announceKeyChanged, useMwKeyStatus, useNetwork } from './mwKeyStatus';

/**
 * The body of "Merriam-Webster key": the narrator's own key for online lookups. It goes to the host once and never comes back; this only ever
 * knows whether one is saved, so a saved key shows as dots with Test key and Remove key. Test key asks the host for one plain word. What a
 * lookup sends is said here in plain words.
 */
export function MwKeyBody() {
  const port = usePort('pronunciationOnline');
  const { notify } = useSettingsHost();
  const network = useNetwork();
  const { status, error: readError, reload } = useMwKeyStatus();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState<'save' | 'remove' | 'test' | 'signup'>();

  const run = async (what: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(what);
    setError(undefined);
    try {
      await action();
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setBusy(undefined);
    }
  };
  const save = () =>
    run('save', async () => {
      await port.pronunciationOnlineKeySet(draft);
      setDraft('');
      setResult('Key saved.');
      notify('Merriam-Webster key saved.');
      announceKeyChanged();
    });
  const remove = () =>
    run('remove', async () => {
      await port.pronunciationOnlineKeyClear();
      setResult('');
      notify('Merriam-Webster key removed.');
      announceKeyChanged();
    });
  const test = () =>
    run('test', async () => {
      if (!network) return setResult('Offline: cannot test the key.');
      const answer = await port.pronunciationOnlineLookup('test');
      setResult(answer.cached ? 'The key is saved. This word was answered from this computer, so nothing was sent.' : 'The key works.');
    });

  if (!status) {
    return readError ? (
      <p role="alert" className="text-[0.8125rem] text-[var(--danger-text)]">
        The key’s state could not be read: {readError}{' '}
        <Button variant="link" size="sm" onClick={reload}>
          Retry
        </Button>
      </p>
    ) : (
      <p className="text-[0.8125rem] text-[var(--text-muted)]">Reading the key’s state…</p>
    );
  }
  return (
    <div className="flex max-w-[60ch] flex-col gap-2">
      {status.present ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="success" label="Key saved" />
          <span aria-hidden="true" className="text-[var(--text-muted)]">
            ••••••••••••
          </span>
          <Button variant="secondary" size="sm" pending={busy === 'test'} disabled={busy !== undefined} onClick={() => void test()}>
            Test key
          </Button>
          <Button variant="secondary" size="sm" pending={busy === 'remove'} disabled={busy !== undefined} onClick={() => void remove()}>
            Remove key
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <Field
              label="Merriam-Webster key"
              value={draft}
              onChange={setDraft}
              secret
              placeholder="Paste your key here"
              error={error}
              disabled={busy !== undefined}
            />
          </div>
          <Button variant="secondary" size="sm" pending={busy === 'save'} disabled={draft.trim() === '' || busy !== undefined} onClick={() => void save()}>
            Save key
          </Button>
          <Button
            variant="link"
            size="sm"
            pending={busy === 'signup'}
            disabled={busy !== undefined}
            onClick={() => void run('signup', () => port.pronunciationOnlineSignUpOpen())}
          >
            Get a free key
          </Button>
        </div>
      )}
      {status.present && error && (
        <p role="alert" className="text-[0.8125rem] text-[var(--danger-text)]">
          {error}
        </p>
      )}
      <span role="status" className="text-[0.8125rem] text-[var(--text-muted)]">
        {result}
      </span>
      <span className="text-[0.8125rem] text-[var(--text-muted)]">
        When no dictionary on this computer knows a name, Look up online asks Merriam-Webster. Only the one word you look up is sent, never your text, file
        names or project. Answers are kept on this computer, so a word is never sent twice.
        {!status.protectedAtRest && ' On this system the key is kept in a file only your account can read, not in a protected credential store.'}
      </span>
    </div>
  );
}
