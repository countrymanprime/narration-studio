import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { describeApiError } from '../../api/errorMessage';
import { Button } from '../primitives/Button';
import { Dialog } from '../primitives/Dialog';
import { Field } from '../primitives/Field';
import type { ProjectSwitchResult } from '../../types';

type Props = {
  onClose: () => void;
  onCreated: (result: ProjectSwitchResult) => void;
};

// The "Visual Studio model": a name and, optionally, a chosen location, instead of browsing to a raw folder.
// An empty parent tells ProjectCreateIn to default to the projects directory; the dialog reads that folder only to show it.
export function NewProjectDialog({ onClose, onCreated }: Props) {
  const api = useApi();
  const [name, setName] = useState('');
  // null: use the projects directory (the binding's own default for an empty parent).
  const [parent, setParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The projects directory, shown while no other location is chosen; empty until read, or when it cannot be.
  const [defaultLocation, setDefaultLocation] = useState('');

  useEffect(() => {
    let active = true;
    api
      .projectDefaultLocation()
      .then((location) => {
        if (active) setDefaultLocation(location.path);
      })
      .catch(() => undefined); // Unreadable, the dialog names the folder in words; Create still uses it.
    return () => {
      active = false;
    };
  }, [api]);

  const changeLocation = () =>
    void (async () => {
      try {
        const selection = await api.selectProjectFolder();
        if (selection.selected && selection.path) setParent(selection.path);
      } catch (caught) {
        setError(describeApiError(caught));
      }
    })();

  const create = () =>
    void (async () => {
      setBusy(true);
      setError('');
      try {
        const result = await api.createProject(parent ?? '', name.trim());
        if (result.switched) onCreated(result);
        else setError(result.reason ?? '');
      } catch (caught) {
        setError(describeApiError(caught));
      } finally {
        setBusy(false);
      }
    })();

  return (
    <Dialog
      dismissOnOutsidePress={false}
      title="New Project"
      onClose={busy ? undefined : onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" pending={busy} onClick={create} disabled={!name.trim()}>
            Create
          </Button>
        </>
      }
    >
      {error && (
        <p className="mb-3 text-sm" role="alert" style={{ color: 'var(--danger-text)' }}>
          {error}
        </p>
      )}
      <Field label="Name" value={name} onChange={setName} autoFocus disabled={busy} placeholder="My New Audiobook" />
      <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        Location:{' '}
        <span className="font-['IBM_Plex_Mono',ui-monospace,monospace] break-all">{parent ?? (defaultLocation || 'the default projects folder')}</span>
        {parent === null && defaultLocation && ' (the default projects folder)'}
      </p>
      <Button variant="secondary" className="mt-2" onClick={changeLocation} disabled={busy}>
        Change location…
      </Button>
    </Dialog>
  );
}
