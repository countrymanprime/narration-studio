import { useMemo, useState, type ReactNode } from 'react';
import { useApi } from '../../api/ApiContext';
import { describeApiError } from '../../api/errorMessage';
import { formatCount, plural, pluralWord } from '../../plural';
import type { GuideEntity } from '../../types';
import { Button } from '../primitives/Button';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { IconButton } from '../primitives/IconButton';
import type { Notify } from '../primitives/Toast';
import { entryRowElement } from './entryRowElement';
import type { EntrySelection } from './useEntrySelection';

/**
 * Deleting the ticked entries of the Story Bible's list in one step (#3662), for when an import pulls in junk. Returns the bar that takes the table's header row while any entry is
 * ticked, and the confirmation it opens. The host has one delete, so this asks it once per entry, one after the other, and reads the list once at the end: a failure part way
 * leaves the entries before it deleted and says how many went and why the first failure did. A locked entry is never asked for (the host refuses it); the question says how many are kept.
 */
export function useBulkDelete({
  entries,
  selection,
  openId,
  reload,
  notify,
  guarded,
}: {
  /** The entries as the list draws them. */
  entries: readonly GuideEntity[];
  selection: EntrySelection;
  /** The entry open beside the list: deleting it with unsaved changes in it asks about them first. */
  openId?: string;
  reload: () => Promise<void>;
  notify: Notify;
  guarded: (action: () => void) => void;
}): { bar: ReactNode; dialog: ReactNode } {
  const api = useApi();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const ticked = useMemo(() => selection.ids.flatMap((id) => byId.get(id) ?? []), [selection.ids, byId]);
  const targets = useMemo(() => ticked.filter((entry) => !entry.locked), [ticked]);
  const kept = ticked.length - targets.length;

  const ask = () => {
    if (openId !== undefined && targets.some((entry) => entry.id === openId)) guarded(() => setAsking(true));
    else setAsking(true);
  };
  const run = async () => {
    setPending(true);
    let done = 0;
    let failed = 0;
    let why: string | undefined;
    for (const entry of targets) {
      try {
        await api.guideDelete(entry.id);
        done += 1;
      } catch (error) {
        failed += 1;
        why ??= describeApiError(error);
      }
    }
    try {
      await reload();
    } finally {
      selection.clear();
      setPending(false);
      setAsking(false);
    }
    if (failed === 0) notify(`Deleted ${plural(done, 'entry', 'entries')}.`);
    else notify(`Deleted ${formatCount(done)} of ${plural(targets.length, 'entry', 'entries')}; ${formatCount(failed)} could not be deleted: ${why}`, 'error');
  };

  if (ticked.length === 0) return { bar: null, dialog: null };
  const bar = (
    <div className="flex min-w-0 items-center justify-center gap-1 normal-case">
      <span className="shrink-0 whitespace-nowrap text-[var(--text)]">
        {formatCount(ticked.length)}
        <span className="@max-sm:sr-only"> selected</span>
      </span>
      <Button
        variant="danger"
        size="sm"
        className="shrink-0 whitespace-nowrap"
        disabledReason={targets.length === 0 ? 'Every ticked entry is locked. Unlock an entry to delete it.' : undefined}
        onClick={ask}
      >
        Delete {plural(targets.length === 0 ? ticked.length : targets.length, 'entry', 'entries')}
      </Button>
      <IconButton action="clearSelection" label="Clear the selection" size="sm" onClick={selection.clear} />
    </div>
  );
  const dialog = asking ? (
    <ConfirmDialog
      title={`Delete ${plural(targets.length, 'entry', 'entries')}`}
      body={`Delete the ${plural(targets.length, 'entry', 'entries')} you ticked, with their aliases, evidence, and relationships? This cannot be undone.${
        kept > 0 ? ` ${plural(kept, 'locked entry', 'locked entries')} ${pluralWord(kept, 'is', 'are')} kept.` : ''
      }`}
      confirmLabel={`Delete ${plural(targets.length, 'entry', 'entries')}`}
      confirmVariant="danger"
      pending={pending}
      confirm={() => void run()}
      cancel={() => setAsking(false)}
      returnFocus={() => (openId ? entryRowElement(openId) : null)}
    />
  ) : null;
  return { bar, dialog };
}
