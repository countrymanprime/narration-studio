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
import { keepUnits } from './editingCheckText';

/**
 * Item gain: the editing check's row for `bridge.LevelMatchClient` (src/studio/desktop/internal/bridge/levelnormalize.go). It previews the items
 * through the host before offering Match in a `ConfirmDialog`, and is gated behind its own `CapabilityGate` so the control is visible,
 * disabled with the host's sentence, while the DAW cannot do it. Silence trim moved to the Editing
 * page's Clean up tab (SN-E9); the research mock has no item-gain row, so this one stays as built (D98).
 */

/** The level-match target this action offers (no per-narrator target setting exists yet). ACX's own RMS window is -23 to -18 dBFS;
 * the middle of that range is a reasonable default match target until a narrator can choose one. */
const LEVEL_MATCH_METRIC = 'rms_dbfs' as const;
const LEVEL_MATCH_TARGET_DB = -20;
const LEVEL_MATCH_TOLERANCE_DB = 2;

/** The host refuses a preview with nothing to change in these words (src/studio/desktop/bindings_cleanup.go, errNoGainCandidates). */
const NOTHING_TO_CHANGE = /needs a gain change/;
const ALREADY_LEVEL = keepUnits(
  `Every item on this chapter's linked track is already within ${LEVEL_MATCH_TOLERANCE_DB} dB of ${LEVEL_MATCH_TARGET_DB} dBFS RMS.`,
);

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
        const found = await api.levelMatchPreview(chapterId, LEVEL_MATCH_METRIC, LEVEL_MATCH_TARGET_DB, LEVEL_MATCH_TOLERANCE_DB);
        // Nothing to match is the answer "already level", with no dialog to confirm an empty change.
        if (found.candidates.length === 0) notify(ALREADY_LEVEL, 'info');
        else setPreview(found);
      } catch (reason) {
        const message = describeApiError(reason);
        if (NOTHING_TO_CHANGE.test(message)) notify(ALREADY_LEVEL, 'info');
        else notify(message, 'error');
      }
    });

  const apply = () =>
    action.run('gain-apply', async () => {
      try {
        const result = await api.levelMatchApply(chapterId, LEVEL_MATCH_METRIC, LEVEL_MATCH_TARGET_DB, LEVEL_MATCH_TOLERANCE_DB);
        if (result.changed.length > 0) notify(`Matched levels on ${pluralize(result.changed.length, 'item')}.`, 'info');
        else if (result.stale.length > 0) {
          // The host measures again on apply: an item that moved on since the preview is left as it is, and a run that changed nothing is not a success.
          notify(
            `No item's level was changed. ${pluralize(result.stale.length, 'item')} changed in REAPER since the preview. Match levels again to read them afresh.`,
            'error',
          );
        } else notify(ALREADY_LEVEL, 'info');
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
      {/* The gate's reason, in view rather than only in the hint (alignment audit R3PR1-23). */}
      {!capability.available && capability.message && (
        <p className="basis-full text-xs" style={{ color: 'var(--text-muted)' }}>
          {capability.message}
        </p>
      )}
      {preview && (
        <ConfirmDialog
          title="Match levels"
          confirmLabel="Match"
          confirm={() => void apply()}
          cancel={() => setPreview(undefined)}
          pending={action.isPending('gain-apply')}
          body={
            <div className="space-y-2">
              <p>
                {keepUnits(
                  `${pluralize(preview.candidates.length, 'item')} on this chapter's linked track ${preview.candidates.length === 1 ? 'differs' : 'differ'} from ${LEVEL_MATCH_TARGET_DB} dBFS RMS by more than ${LEVEL_MATCH_TOLERANCE_DB} dB.`,
                )}
              </p>
              <p>Matching changes each item's volume in REAPER to bring it onto target, in one undo step.</p>
            </div>
          }
        />
      )}
    </>
  );
}

export function CleanupAction({ chapterId, notify }: { chapterId: string; notify: Notify }) {
  return (
    <div className="flex flex-wrap gap-2">
      {/* Keyed by the chapter: a preview of one chapter is never applied to another, and a late preview for the old chapter has no dialog to open. */}
      <LevelMatchAction key={chapterId} chapterId={chapterId} notify={notify} />
    </div>
  );
}
