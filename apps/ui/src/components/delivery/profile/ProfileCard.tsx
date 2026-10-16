import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { DeliveryProfile, DeliveryProfilesState } from '../../../types';
import { deliveryProfileKey } from '../../master/deliveryProfile';
import { Button } from '../../primitives/Button';
import { Panel } from '../../primitives/Panel';
import { SectionLabel } from '../../primitives/SectionLabel';
import { StatusBadge } from '../../primitives/StatusBadge';
import { heardText, useHostRead } from '../page/useHostRead';
import { CommitBox } from './CommitBox';
import { FormatRows } from './FormatRows';
import { LimitRow } from './LimitRow';
import { editOf, formatRules, limitRules, limitsOf, type Limit } from './limitText';
import { ProfileMenu } from './ProfileMenu';

/** The profile the project is judged against: the one the project chose, else the Global default. */
const activeProfile = (state: DeliveryProfilesState): DeliveryProfile | undefined =>
  state.profiles.find((profile) => deliveryProfileKey(profile) === state.projectProfile) ?? state.profiles[0];

/**
 * The Delivery page's profile card (the mock's first panel): the profile menu, the "Built in" pill or the editable name, "Checks on every
 * chapter" and "Files". A built-in is text only; a custom profile's limits, longest file and name are editable and save through
 * `deliverySaveProfile` with the host's own rule ids. `onChange` fires after a choice or an edit so the page can drop its built list, and
 * `onProfile` gives the page the profile and its `limits` (the same numbers Master & QC reads).
 */
export function ProfileCard({ onChange, onProfile }: { onChange?: () => void; onProfile?: (profile: DeliveryProfile, limits: Limit[]) => void }) {
  const port = usePort('deliveryProfiles');
  // Read when the page opens and when the window regains focus (a profile edited or deleted in Settings is picked up), and again every two
  // seconds while a read has failed. An answer from a choice or an edit is numbered like a read, so a slower read cannot undo it.
  const read = useHostRead<DeliveryProfilesState>(
    () => port.deliveryProfiles(),
    () => false,
  );
  const state = read.value;
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // A second choice or edit sent before the host answered the first is dropped, whatever the menu's state on screen.
  const working = useRef(false);
  const profile = state && activeProfile(state);
  useEffect(() => {
    if (profile) onProfile?.(profile, limitsOf(profile));
  }, [profile, onProfile]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (working.current) return;
      working.current = true;
      setBusy(true);
      try {
        await action();
        setError(undefined);
        onChange?.();
      } catch (failure) {
        setError(apiErrorMessage(failure));
      } finally {
        working.current = false;
        setBusy(false);
      }
    },
    [onChange],
  );

  if (!state || !profile) {
    return (
      <Panel title="Delivery profile">
        {read.error ? (
          <p role="alert" className="text-sm" style={{ color: 'var(--danger-text)' }}>
            The delivery profiles could not be read, {heardText(read.lastHeard)}: {read.error}{' '}
            <Button variant="ghost" size="sm" onClick={read.again}>
              Check again
            </Button>
          </p>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Reading the delivery profiles…
          </p>
        )}
      </Panel>
    );
  }

  const choose = (next: DeliveryProfile) => run(async () => read.set(await port.deliverySelectProfile('project', next.id, next.builtIn ? next.version : '')));
  const save = (edit: ReturnType<typeof editOf>) =>
    run(async () => {
      await port.deliverySaveProfile(edit);
      read.set(await port.deliveryProfiles());
    });
  const readOnly = profile.builtIn;

  return (
    <Panel
      title="Delivery profile"
      actions={
        <span className="flex items-center gap-2">
          <ProfileMenu profiles={state.profiles} current={profile} disabled={busy} onSelect={(next) => void choose(next)} />
          {readOnly ? (
            <StatusBadge tone="neutral" label="Built in" />
          ) : (
            <CommitBox label="Profile name" value={profile.name} onCommit={(name) => name.trim() !== '' && void save(editOf(profile, { name: name.trim() }))} />
          )}
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <SectionLabel>Checks on every chapter</SectionLabel>
          {limitRules(profile).map((rule) => (
            <LimitRow
              key={rule.id}
              rule={rule}
              readOnly={readOnly}
              onEdit={(side, value) => void save(editOf(profile, { rule: { id: rule.id, side, value } }))}
            />
          ))}
        </div>
        <FormatRows rules={formatRules(profile)} readOnly={readOnly} onEdit={(id, side, value) => void save(editOf(profile, { rule: { id, side, value } }))} />
        {read.error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--danger-text)' }}>
            Can't tell whether this is still the project's profile, {heardText(read.lastHeard)}: {read.error}{' '}
            <Button variant="ghost" size="sm" onClick={read.again}>
              Check again
            </Button>
          </p>
        )}
        {(error || state.notice) && (
          <p role={error ? 'alert' : 'status'} className="text-sm" style={{ color: error ? 'var(--danger-text)' : 'var(--warn-text)' }}>
            {error ?? state.notice}
          </p>
        )}
      </div>
    </Panel>
  );
}
