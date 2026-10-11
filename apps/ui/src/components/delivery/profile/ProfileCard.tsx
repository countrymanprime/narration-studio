import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { DeliveryProfile, DeliveryProfilesState } from '../../../types';
import { deliveryProfileKey } from '../../master/deliveryProfile';
import { Panel } from '../../primitives/Panel';
import { SectionLabel } from '../../primitives/SectionLabel';
import { StatusBadge } from '../../primitives/StatusBadge';
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
  const [state, setState] = useState<DeliveryProfilesState>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const profile = state && activeProfile(state);

  useEffect(() => {
    let live = true;
    port
      .deliveryProfiles()
      .then((next) => live && setState(next))
      .catch((failure) => live && setError(`The delivery profiles could not be read: ${apiErrorMessage(failure)}`));
    return () => {
      live = false;
    };
  }, [port]);
  useEffect(() => {
    if (profile) onProfile?.(profile, limitsOf(profile));
  }, [profile, onProfile]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
        setError(undefined);
        onChange?.();
      } catch (failure) {
        setError(apiErrorMessage(failure));
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  if (!state || !profile) {
    return (
      <Panel title="Delivery profile">
        <p role={error ? 'alert' : undefined} className="text-sm" style={{ color: error ? 'var(--danger-text)' : 'var(--text-muted)' }}>
          {error ?? 'Reading the delivery profiles…'}
        </p>
      </Panel>
    );
  }

  const choose = (next: DeliveryProfile) => run(async () => setState(await port.deliverySelectProfile('project', next.id, next.builtIn ? next.version : '')));
  const save = (edit: ReturnType<typeof editOf>) =>
    run(async () => {
      await port.deliverySaveProfile(edit);
      setState(await port.deliveryProfiles());
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
        {(error || state.notice) && (
          <p role={error ? 'alert' : 'status'} className="text-sm" style={{ color: error ? 'var(--danger-text)' : 'var(--warn-text)' }}>
            {error ?? state.notice}
          </p>
        )}
      </div>
    </Panel>
  );
}
