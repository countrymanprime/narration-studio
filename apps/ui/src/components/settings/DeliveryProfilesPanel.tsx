import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage } from '../../api/errorMessage';
import { useApi } from '../../api/ApiContext';
import type { DeliveryProfile, DeliveryProfileEdit, DeliveryProfileRef, DeliveryProfilesState } from '../../types';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { Select } from '../primitives/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import type { Notify } from '../primitives/Toast';
import { deliveryProfileKey, deliveryProfileTitle } from '../master/deliveryProfile';
import { LOCK_ICON, Mark } from '../master/RuleBadges';
import { DeliveryProfileEditor } from './DeliveryProfileEditor';

const MUTED = { color: 'var(--text-muted)' };

/** A select option's value: a built-in at its version, a custom profile by its id alone (it always judges with its latest revision). */
export const optionValue = (ref: DeliveryProfileRef | DeliveryProfile) =>
  'builtIn' in ref ? (ref.builtIn ? `${ref.id}@${ref.version}` : ref.id) : ref.version ? `${ref.id}@${ref.version}` : ref.id;

/** How many of a custom profile's numbers differ from the built-in it is based on, and how many rules are off. */
function differences(profile: DeliveryProfile, base?: DeliveryProfile) {
  let numbers = 0;
  for (const rule of profile.rules) {
    const original = base?.rules.find((candidate) => candidate.id === rule.id);
    if (!original) continue;
    if (original.min !== rule.min) numbers += 1;
    if (original.max !== rule.max) numbers += 1;
  }
  return { numbers, off: profile.rules.filter((rule) => rule.off).length };
}

export function describe(profile: DeliveryProfile, base?: DeliveryProfile): string {
  if (profile.builtIn) {
    const host = profile.source.url ? ` · from ${new URL(profile.source.url).host}, read ${profile.source.readOn}` : '';
    return `Built in · read-only · ${profile.rules.length} rules${host}`;
  }
  const { numbers, off } = differences(profile, base);
  return [
    'Custom',
    profile.note ? profile.note.replace(/\.$/, '').replace(/^Moved/, 'moved') : '',
    base ? `based on ${deliveryProfileTitle(base)}` : '',
    `revision ${profile.revision}`,
    numbers > 0 ? `${numbers} ${numbers === 1 ? 'number' : 'numbers'} changed` : '',
    off > 0 ? `${off} ${off === 1 ? 'rule' : 'rules'} off` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const CHANGED = 'narration:delivery-profiles-changed';

/**
 * The delivery profiles as the host answers them, and every action on them: choose the Global default, duplicate, edit, delete. Each action
 * answers with the profiles again and tells the other users of this hook on the page (the project's choice, the default, the list are separate
 * rows of Settings) to read again. The editor and the delete question are state here, drawn by `ProfileDialogs`.
 */
export function useDeliveryProfiles(notify: Notify) {
  const api = useApi();
  const [state, setState] = useState<DeliveryProfilesState>();
  const [loadError, setLoadError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<DeliveryProfile>();
  const [editError, setEditError] = useState<string>();
  const [deleting, setDeleting] = useState<DeliveryProfile>();

  const load = useCallback(() => {
    api
      .deliveryProfiles()
      .then((next) => {
        setState(next);
        setLoadError(undefined);
      })
      .catch((error) => setLoadError(apiErrorMessage(error)));
  }, [api]);
  useEffect(() => {
    load();
    window.addEventListener(CHANGED, load);
    return () => window.removeEventListener(CHANGED, load);
  }, [load]);

  /** Runs an action that changed the profiles: tells the other users of this hook to read again, and shows a refusal as a toast. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      window.dispatchEvent(new Event(CHANGED));
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const byKey = (key?: string) => state?.profiles.find((profile) => deliveryProfileKey(profile) === key);
  const baseOf = (profile: DeliveryProfile) => (profile.basedOn ? byKey(profile.basedOn) : undefined);
  const usedBy = (profile: DeliveryProfile) => {
    if (!state) return [];
    const globalProfile = state.profiles.find((candidate) => optionValue(candidate) === optionValue(state.globalDefault));
    return [
      globalProfile && deliveryProfileKey(globalProfile) === deliveryProfileKey(profile) ? 'Global default' : '',
      state.hasProject && state.projectChoice && optionValue(state.projectChoice) === optionValue(profile) ? 'This project' : '',
    ].filter(Boolean);
  };

  const chooseDefault = (value: string) =>
    run(async () => {
      const profile = state?.profiles.find((candidate) => optionValue(candidate) === value);
      if (!profile) return;
      setState(await api.deliverySelectProfile('global', profile.id, profile.builtIn ? profile.version : ''));
      notify(`The Global default is now ${deliveryProfileTitle(profile)}.`);
    });
  /** The project's own choice (the Delivery page's profile card saves it the same way). */
  const chooseProject = (profile: DeliveryProfile) =>
    run(async () => {
      setState(await api.deliverySelectProfile('project', profile.id, profile.builtIn ? profile.version : ''));
    });
  /** Copies a profile; `edit` opens the copy in the editor at once. */
  const duplicate = (profile: DeliveryProfile, edit = true) =>
    run(async () => {
      const copy = await api.deliveryDuplicateProfile(profile.id, profile.builtIn ? profile.version : '');
      setState(await api.deliveryProfiles());
      notify(`Duplicated as "${copy.name}".`);
      if (edit) {
        setEditError(undefined);
        setEditing(copy);
      }
    });
  const edit = (profile: DeliveryProfile) => {
    setEditError(undefined);
    setEditing(profile);
  };
  const save = (change: DeliveryProfileEdit) =>
    void (async () => {
      setBusy(true);
      try {
        const saved = await api.deliverySaveProfile(change);
        setState(await api.deliveryProfiles());
        setEditing(undefined);
        notify(`Saved "${saved.name}", revision ${saved.revision}.`);
        window.dispatchEvent(new Event(CHANGED));
      } catch (error) {
        setEditError(apiErrorMessage(error));
      } finally {
        setBusy(false);
      }
    })();
  const remove = (profile: DeliveryProfile) =>
    run(async () => {
      setState(await api.deliveryDeleteProfile(profile.id));
      setDeleting(undefined);
      notify(`Deleted "${profile.name}".`);
    });

  return {
    state,
    loadError,
    busy,
    editing,
    setEditing,
    editError,
    deleting,
    setDeleting,
    byKey,
    baseOf,
    usedBy,
    chooseDefault,
    chooseProject,
    duplicate,
    edit,
    save,
    remove,
  };
}
export type DeliveryProfilesController = ReturnType<typeof useDeliveryProfiles>;

/** The sentence while the profiles are read or could not be, or `undefined` once there is a state to draw. */
function Gate({ ctl }: { ctl: DeliveryProfilesController }) {
  if (ctl.loadError) {
    return (
      <p role="alert" className="text-sm" style={{ color: 'var(--danger-text)' }}>
        The delivery profiles could not be read: {ctl.loadError}
      </p>
    );
  }
  if (!ctl.state) {
    return (
      <p className="text-sm" style={MUTED}>
        Reading the delivery profiles…
      </p>
    );
  }
  return null;
}

/** The profile editor and the delete question, when one is open. */
export function ProfileDialogs({ ctl }: { ctl: DeliveryProfilesController }) {
  const { editing, deleting } = ctl;
  return (
    <>
      {editing && (
        <DeliveryProfileEditor
          profile={editing}
          base={ctl.baseOf(editing)}
          pending={ctl.busy}
          error={ctl.editError}
          onCancel={() => ctl.setEditing(undefined)}
          onSave={ctl.save}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          body="A project that chose it is judged against the Global default from then on. This cannot be undone."
          confirmLabel="Delete profile"
          confirmVariant="danger"
          pending={ctl.busy}
          confirm={() => void ctl.remove(deleting)}
          cancel={() => ctl.setDeleting(undefined)}
        />
      )}
    </>
  );
}

/** The select for the Global default profile, every project that has not chosen its own is judged against it. */
export function DefaultProfileSelect({ ctl, label = 'Default delivery profile' }: { ctl: DeliveryProfilesController; label?: string }) {
  const { state } = ctl;
  if (!state) return <Gate ctl={ctl} />;
  const options = state.profiles.map((profile) => ({
    value: optionValue(profile),
    label: `${deliveryProfileTitle(profile)} · ${profile.builtIn ? 'built in' : 'custom'}`,
  }));
  return (
    <>
      <div className="max-w-md">
        <Select
          label={label}
          value={optionValue(state.globalDefault)}
          onChange={(value) => void ctl.chooseDefault(value)}
          options={options}
          disabled={ctl.busy}
          fullWidth
        />
      </div>
      {state.notice && (
        <p role="status" style={{ color: 'var(--warn-text)' }}>
          {state.notice}
        </p>
      )}
    </>
  );
}

/** Every profile as a row: what it is, what uses it, and Duplicate, Edit and Delete (a built-in can only be duplicated). */
export function ProfilesTable({ ctl }: { ctl: DeliveryProfilesController }) {
  const { state, busy } = ctl;
  if (!state) return <Gate ctl={ctl} />;
  return (
    <>
      {/* A profile is a row: what it is, and what can be done with it. */}
      <Table label="Delivery profiles">
        <TableHead>
          <TableRow>
            <TableHeader>Profile</TableHeader>
            <TableHeader hiddenLabel="Actions" />
          </TableRow>
        </TableHead>
        <TableBody>
          {state.profiles.map((profile) => {
            const users = ctl.usedBy(profile);
            return (
              <TableRow key={profile.id}>
                <TableCell>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold">{deliveryProfileTitle(profile)}</span>
                      {profile.builtIn ? (
                        <Mark tone="muted" icon={LOCK_ICON}>
                          Built in
                        </Mark>
                      ) : (
                        <Mark tone="muted">Custom</Mark>
                      )}
                    </div>
                    <div className="text-xs" style={MUTED}>
                      {describe(profile, ctl.baseOf(profile))}
                    </div>
                    <div className="text-xs" style={MUTED}>
                      Used by: {users.length > 0 ? users.join(' · ') : 'no project open here'}
                    </div>
                  </div>
                </TableCell>
                <TableCell align="right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" onClick={() => void ctl.duplicate(profile)} disabled={busy}>
                      Duplicate
                    </Button>
                    {!profile.builtIn && (
                      <>
                        <Button variant="secondary" onClick={() => ctl.edit(profile)} disabled={busy}>
                          Edit
                        </Button>
                        <Button variant="danger" onClick={() => ctl.setDeleting(profile)} disabled={busy}>
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ProfileDialogs ctl={ctl} />
    </>
  );
}

/**
 * The custom profiles as a short list (the built-ins are the ones to copy from): each with what it is based on and what uses it, and Duplicate,
 * Edit and Delete as icon buttons. A built-in is copied with "Duplicate <name>" below the list.
 */
export function CustomProfileList({ ctl }: { ctl: DeliveryProfilesController }) {
  const { state, busy } = ctl;
  if (!state) return <Gate ctl={ctl} />;
  const custom = state.profiles.filter((profile) => !profile.builtIn);
  const builtIns = state.profiles.filter((profile) => profile.builtIn);
  return (
    <div className="flex w-full flex-col gap-2">
      {custom.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {custom.map((profile) => {
            const users = ctl.usedBy(profile);
            return (
              <li key={profile.id} data-profile={profile.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <b>{profile.name}</b>
                <span className="text-[0.8125rem] text-[var(--text-muted)]">
                  {describe(profile, ctl.baseOf(profile))}
                  {users.length > 0 ? ` · used by ${users.join(' and ').toLowerCase()}` : ''}
                </span>
                <span className="flex-1" />
                <IconButton action="copy" label={`Duplicate ${profile.name}`} size="sm" disabled={busy} onClick={() => void ctl.duplicate(profile, false)} />
                <IconButton action="edit" label={`Edit ${profile.name}`} size="sm" disabled={busy} onClick={() => ctl.edit(profile)} />
                <IconButton
                  action="delete"
                  label={`Delete ${profile.name}`}
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => ctl.setDeleting(profile)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="text-[0.8125rem] text-[var(--text-muted)]">No custom profiles. Duplicate a built-in profile to make one.</span>
      )}
      <div className="flex flex-wrap gap-2">
        {builtIns.map((profile) => (
          <Button key={profile.id} variant="secondary" size="sm" disabled={busy} onClick={() => void ctl.duplicate(profile, false)}>
            Duplicate {profile.name}
          </Button>
        ))}
      </div>
      <ProfileDialogs ctl={ctl} />
    </div>
  );
}

/**
 * The kept Delivery profiles panel (the old Settings page): the Global default profile, for every project that has not chosen one, and the
 * profiles themselves. A built-in cannot be changed; Duplicate makes a custom copy whose numbers can change and whose rules can be turned off.
 * A choice takes effect at once: Master & QC and the report judge against it the next time they are read.
 */
export function DeliveryProfilesPanel({ notify }: { notify: Notify }) {
  const ctl = useDeliveryProfiles(notify);
  if (ctl.loadError || !ctl.state) return <Gate ctl={ctl} />;
  return (
    <div className="space-y-5 text-sm">
      <section className="space-y-2">
        <h3 className="text-base font-semibold">Default delivery profile</h3>
        <p style={MUTED}>Every project that has not chosen its own profile is judged against this one.</p>
        <DefaultProfileSelect ctl={ctl} />
      </section>
      <section className="space-y-2">
        <h3 className="text-base font-semibold">Profiles</h3>
        <p style={MUTED}>
          A built-in profile cannot be changed. Duplicate it to change its numbers or turn a rule off; a copy cannot add a kind of rule the app does not check.
          Other platforms (Findaway Voices, Author&apos;s Republic, Google Play, Kobo) are not built in yet.
        </p>
        <ProfilesTable ctl={ctl} />
      </section>
    </div>
  );
}
