import type { DeliveryProfile } from '../../../types';
import { Select } from '../../primitives/Select';
import { deliveryProfileKey } from '../../master/deliveryProfile';

/** Built-ins first, each marked "(built in)"; a custom profile by its name. */
const orderedProfiles = (profiles: readonly DeliveryProfile[]): DeliveryProfile[] => [
  ...profiles.filter((profile) => profile.builtIn),
  ...profiles.filter((profile) => !profile.builtIn),
];

const profileMenuLabel = (profile: DeliveryProfile): string => (profile.builtIn ? `${profile.name} (built in)` : profile.name);

/** The profile menu (`#dprof` in the mock). Choosing one reports it; the card saves the choice. */
export function ProfileMenu({
  profiles,
  current,
  disabled,
  selectRef,
  onSelect,
}: {
  profiles: readonly DeliveryProfile[];
  current: DeliveryProfile;
  disabled?: boolean;
  /** The select itself, so the card can give it focus back after the host answers (a disabled select drops it). */
  selectRef?: React.Ref<HTMLSelectElement>;
  onSelect: (profile: DeliveryProfile) => void;
}) {
  const list = orderedProfiles(profiles);
  return (
    <Select
      label={`Delivery profile: ${current.name}`}
      value={deliveryProfileKey(current)}
      disabled={disabled}
      ref={selectRef}
      className="max-w-[16rem] min-w-0 truncate"
      options={list.map((profile) => ({ value: deliveryProfileKey(profile), label: profileMenuLabel(profile) }))}
      onChange={(key) => {
        const next = list.find((profile) => deliveryProfileKey(profile) === key);
        if (next) onSelect(next);
      }}
    />
  );
}
