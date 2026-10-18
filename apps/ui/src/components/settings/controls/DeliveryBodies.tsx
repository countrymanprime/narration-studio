import type { DeliveryProfile } from '../../../types';
import { Select } from '../../primitives/Select';
import { describeCheck, deliveryProfileKey, deliveryProfileTitle, formatBound } from '../../master/deliveryProfile';
import { CustomProfileList, DefaultProfileSelect, useDeliveryProfiles } from '../DeliveryProfilesPanel';
import { useSettingsHost } from '../row/SettingsHost';

/** What a profile judges, one line for each rule that is on: the label and its bound, or why the app does not measure it. */
export function ProfileLimits({ profile }: { profile: DeliveryProfile | undefined }) {
  const rules = profile?.rules ?? [];
  return (
    <dl aria-label="Limits of this profile" className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[0.8125rem]">
      {rules.length === 0 ? (
        <>
          <dt className="text-[var(--text-muted)]">Limits</dt>
          <dd className="m-0">None checked. Master &amp; QC measures but does not judge.</dd>
        </>
      ) : (
        rules.map((rule) => (
          <div key={rule.id} className="contents">
            <dt className="text-[var(--text-muted)]">{rule.label}</dt>
            <dd className="m-0">{rule.off ? 'Off' : rule.checkedBy === 'measured' ? formatBound(rule) || 'Measured' : describeCheck(rule)}</dd>
          </div>
        ))
      )}
    </dl>
  );
}

/** The body of "Delivery profile": this project's profile as a select over every profile, and the limits of the chosen one. */
export function DeliveryProfileBody() {
  const { notify } = useSettingsHost();
  const ctl = useDeliveryProfiles(notify);
  const { state } = ctl;
  if (!state) {
    return ctl.loadError ? (
      <p role="alert" className="text-[0.8125rem] text-[var(--danger-text)]">
        The delivery profiles could not be read: {ctl.loadError}
      </p>
    ) : (
      <p className="text-[0.8125rem] text-[var(--text-muted)]">Reading the delivery profiles…</p>
    );
  }
  const chosen = state.profiles.find((profile) => deliveryProfileKey(profile) === state.projectProfile);
  return (
    <div className="flex flex-col gap-2.5">
      <Select
        label="Delivery profile"
        className="max-w-[260px]"
        value={state.projectProfile}
        disabled={ctl.busy || !state.hasProject}
        options={state.profiles.map((profile) => ({ value: deliveryProfileKey(profile), label: deliveryProfileTitle(profile) }))}
        onChange={(key) => {
          const next = state.profiles.find((profile) => deliveryProfileKey(profile) === key);
          if (next) void ctl.chooseProject(next);
        }}
      />
      {!state.hasProject && <span className="text-[0.8125rem] text-[var(--text-muted)]">Open a project to choose its profile.</span>}
      <ProfileLimits profile={chosen} />
    </div>
  );
}

/** The body of "Default profile for new projects": the Global default, for every project that has not chosen its own. */
export function DeliveryDefaultBody() {
  const { notify } = useSettingsHost();
  const ctl = useDeliveryProfiles(notify);
  return <DefaultProfileSelect ctl={ctl} label="Default profile for new projects" />;
}

/** The body of "Custom profiles": copies of a built-in profile with their own limits, with Duplicate, Edit and Delete. */
export function DeliveryCustomBody() {
  const { notify } = useSettingsHost();
  return <CustomProfileList ctl={useDeliveryProfiles(notify)} />;
}
