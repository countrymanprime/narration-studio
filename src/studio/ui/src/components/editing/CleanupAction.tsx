import { useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { describeApiError } from '../../api/errorMessage';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useCapability } from '../../useCapability';
import type { LevelMatchPreviewResult } from '../../types';
import { Button } from '../primitives/Button';
import { CapabilityGate } from '../primitives/CapabilityGate';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import type { Notify } from '../primitives/Toast';

/**
 * Item gain: the editing check's row for `bridge.LevelMatchClient` (apps/desktop/internal/bridge/levelnormalize.go). It previews the items
 * through the host before offering Match in a `ConfirmDialog`, and is gated behind its own `CapabilityGate` so the control is visible,
 * disabled with the host's "Experimental" message, until the owner's verification pass promotes it. Silence trim moved to the Editing
 * page's Clean up tab (SN-E9); the Studio Next mock has no item-gain row, so this one stays as built (D98).
 */

/** The level-match target this action offers (no per-narrator target setting exists yet). ACX's own RMS window is -23 to -18 dBFS;
 * the middle of that range is a reasonable default match target until a narrator can choose one. */
const LEVEL_MATCH_METRIC = 'rms_dbfs' as const;
const LEVEL_MATCH_TARGET_DB = -20;
const LEVEL_MATCH_TOLERANCE_DB = 2;

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function LevelMatchAction({ chapterId, notify }: { chapterId: string; notify: Notify }) {
  const api = useApi();
  const capability = useCapability('item_gain');
  const action = usePendingAction();
  const [preview, setPreview] = useState<LevelMatchPreviewResult>();

  const openPreview = () =>
    action.run('gain-preview', async () => {
      try {
        setPreview(await api.levelMatchPreview(chapterId, LEVEL_MATCH_METRIC, LEVEL_MATCH_TARGET_DB, LEVEL_MATCH_TOLERANCE_DB));
      } catch (reason) {
        notify(describeApiError(reason), 'error');
      }
    });

  const apply = () =>
    action.run('gain-apply', async () => {
      try {
        const result = await api.levelMatchApply(chapterId, LEVEL_MATCH_METRIC, LEVEL_MATCH_TARGET_DB, LEVEL_MATCH_TOLERANCE_DB);
        notify(`Matched levels on ${pluralize(result.changed.length, 'item')}.`, 'info');
      } catch (reason) {
        notify(describeApiError(reason), 'error');
      } finally {
        setPreview(undefined);
      }
    });

  return (
    <>
      <CapabilityGate capability={capability}>
        <Button
          variant="secondary"
          onClick={() => void openPreview()}
          pending={action.isPending('gain-preview')}
          disabled={action.isBlockedFor('gain-preview')}
        >
          Match levels…
        </Button>
      </CapabilityGate>
      {preview && (
        <ConfirmDialog
          title="Match levels"
          confirmLabel="Match"
          confirm={() => void apply()}
          cancel={() => setPreview(undefined)}
          pending={action.isPending('gain-apply')}
          body={
            <>
              <p>
                {pluralize(preview.candidates.length, 'item')} on this chapter's linked track differ from {LEVEL_MATCH_TARGET_DB} dBFS RMS by more than{' '}
                {LEVEL_MATCH_TOLERANCE_DB} dB.
              </p>
              <p>Matching changes each item's volume in REAPER to bring it onto target, in one undo step.</p>
            </>
          }
        />
      )}
    </>
  );
}

export function CleanupAction({ chapterId, notify }: { chapterId: string; notify: Notify }) {
  return (
    <div className="flex flex-wrap gap-2">
      <LevelMatchAction chapterId={chapterId} notify={notify} />
    </div>
  );
}
