import type { DeliveryProfile } from '../../../types';
import { Select } from '../../primitives/Select';
import { deliveryProfileKey } from '../../master/deliveryProfile';

/** Built-ins first, each marked "(built in)"; a custom profile by its name. */
export const orderedProfiles = (profiles: readonly DeliveryProfile[]): DeliveryProfile[] => [
  ...profiles.filter((profile) => profile.builtIn),
  ...profiles.filter((profile) => !profile.builtIn),
];

export const profileMenuLabel = (profile: DeliveryProfile): string => (profile.builtIn ? `${profile.name} (built in)` : profile.name);

/** The profile menu (`#dprof` in the mock). Choosing one reports it; the card saves the choice. */
export function ProfileMenu({
  profiles,
  current,
  disabled,
  onSelect,
}: {
  profiles: readonly DeliveryProfile[];
  current: DeliveryProfile;
  disabled?: boolean;
  onSelect: (profile: DeliveryProfile) => void;
}) {
  const list = orderedProfiles(profiles);
  return (
    <Select
      label={`Delivery profile: ${current.name}`}
      value={deliveryProfileKey(current)}
      disabled={disabled}
      options={list.map((profile) => ({ value: deliveryProfileKey(profile), label: profileMenuLabel(profile) }))}
      onChange={(key) => {
        const next = list.find((profile) => deliveryProfileKey(profile) === key);
        if (next) onSelect(next);
      }}
    />
  );
}
