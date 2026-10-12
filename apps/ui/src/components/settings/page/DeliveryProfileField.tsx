import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { DeliveryProfile, DeliveryProfilesState } from '../../../types';
import { deliveryProfileKey } from '../../master/deliveryProfile';
import { Panel } from '../../primitives/Panel';
import { Select } from '../../primitives/Select';

export type DeliveryProfileFieldViewProps = {
  /** The profiles the host answered; absent while they are read. */
  state?: DeliveryProfilesState;
  busy?: boolean;
  /** A failed read or a refused choice, in the host's words. */
  error?: string;
  onChoose: (profile: DeliveryProfile) => void;
};

/** The mock's "Delivery profile" panel: one select over the profile list, on the project's choice. Takes props only. */
export function DeliveryProfileFieldView({ state, busy = false, error, onChoose }: DeliveryProfileFieldViewProps) {
  return (
    <Panel title="Delivery profile">
      <div className="flex flex-col gap-2">
        {state ? (
          <Select
            label="Delivery profile"
            className="max-w-[260px]"
            value={state.projectProfile}
            disabled={busy}
            options={state.profiles.map((profile) => ({ value: deliveryProfileKey(profile), label: profile.name }))}
            onChange={(key) => {
              const next = state.profiles.find((profile) => deliveryProfileKey(profile) === key);
              if (next) onChoose(next);
            }}
          />
        ) : (
          !error && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Reading the delivery profiles…
            </p>
          )
        )}
        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--danger-text)' }}>
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}

/**
 * Settings > Delivery profile: the project's profile, saved with `deliverySelectProfile` as the Delivery page's profile card saves it.
 * The Global default, Duplicate, Edit and Delete stay in the kept Delivery category (the SN-M51 audit, finding 6).
 */
export function DeliveryProfileField() {
  const port = usePort('deliveryProfiles');
  const [state, setState] = useState<DeliveryProfilesState>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    port
      .deliveryProfiles()
      .then((next) => live && setState(next))
      .catch((failure: unknown) => live && setError(`The delivery profiles could not be read: ${apiErrorMessage(failure)}`));
    return () => {
      live = false;
    };
  }, [port]);

  const choose = async (profile: DeliveryProfile) => {
    setBusy(true);
    try {
      setState(await port.deliverySelectProfile('project', profile.id, profile.builtIn ? profile.version : ''));
      setError(undefined);
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return <DeliveryProfileFieldView state={state} busy={busy} error={error} onChoose={(profile) => void choose(profile)} />;
}
