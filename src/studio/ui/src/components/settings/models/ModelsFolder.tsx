import { useEffect, useState } from 'react';
import { overlay } from '../../../overlay/overlayService';
import { formatSize } from '../../assets/AssetFacts';
import { Button } from '../../primitives/Button';
import { ConfirmDialog } from '../../primitives/ConfirmDialog';
import { IconButton } from '../../primitives/IconButton';
import { WorkDialog } from '../../primitives/WorkDialog';
import { isMoveRunning, type AssetMovePhase, type AssetMoveState, type WorkJob } from '../../../types';
import { useAssetsStore } from './AssetsStore';

const path = (value: string) => <code className="font-['IBM_Plex_Mono',ui-monospace,monospace] text-[0.75rem] [overflow-wrap:anywhere]">{value}</code>;

const PHASE: Record<AssetMovePhase, WorkJob['phase']> = {
  idle: 'idle',
  copying: 'running',
  verifying: 'running',
  switching: 'running',
  success: 'success',
  cancelled: 'cancelled',
  error: 'error',
};

/** The move as the work dialog draws it: the two passes are one bar, and the bytes sit beside the message. */
function jobOf(move: AssetMoveState, started: number, now: number): WorkJob {
  const running = isMoveRunning(move);
  return {
    id: move.id,
    kind: 'asset_install',
    phase: PHASE[move.phase],
    message: move.message,
    percent: move.percent,
    detail: move.bytesTotal > 0 && running ? `${formatSize(move.bytesDone / 2)} of ${formatSize(move.bytesTotal / 2)}` : undefined,
    logs: [],
    elapsed: Math.max(0, (now - started) / 1000),
    error: move.error || undefined,
  };
}

/**
 * Change location and its Reset (the registry row `models.folder`, and the disk panel on Models & downloads): the question, the system's
 * folder dialog, the move with its progress and Cancel, and the way back to the default folder. Nothing here changes the folder: the host
 * copies, checks, and only then uses the new one; the old copy stays until the offer under it is answered.
 */
export function ModelsFolderControl() {
  const store = useAssetsStore();
  const { catalog, move } = store;
  const [asking, setAsking] = useState<'change' | 'reset'>();
  const [started, setStarted] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const running = move !== undefined && isMoveRunning(move);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  if (!catalog) return null;

  const begin = async (target: string) => {
    setStarted(Date.now());
    setNow(Date.now());
    const refused = await store.startMove(target);
    if (refused !== undefined) overlay.toast(`The models were not moved. ${refused}`, { tone: 'error' });
  };
  const confirm = async () => {
    const mode = asking;
    setAsking(undefined);
    if (mode === 'reset') {
      await begin('');
      return;
    }
    const folder = await store.pickFolder();
    if (folder !== '') await begin(folder);
  };

  return (
    <>
      <Button variant="secondary" size="sm" className="flex-none" onClick={() => setAsking('change')}>
        Change location…
      </Button>
      {catalog.custom && (
        <IconButton
          action="undo"
          label="Reset the models folder to the default folder"
          className="flex-none border-transparent"
          onClick={() => setAsking('reset')}
        />
      )}
      {asking === 'change' && (
        <ConfirmDialog
          title="Change where downloads are kept?"
          body="The files are copied to the new folder and checked, and only then used from there. Nothing is downloaded again. The current copy stays until you delete it."
          confirmLabel="Choose a folder…"
          focusCancel
          confirm={() => void confirm()}
          cancel={() => setAsking(undefined)}
        />
      )}
      {asking === 'reset' && (
        <ConfirmDialog
          title="Move the downloads back to the default folder?"
          body={
            <>
              The files are copied back to {path(catalog.defaultRoot)} and checked, and only then used from there. The current copy stays until you delete it.
            </>
          }
          confirmLabel="Move back"
          focusCancel
          confirm={() => void confirm()}
          cancel={() => setAsking(undefined)}
        />
      )}
      {move && move.phase !== 'idle' && (
        <WorkDialog title="Moving models and downloads" job={jobOf(move, started, now)} cancel={() => void store.cancelMove()} close={store.dismissMove} />
      )}
    </>
  );
}

/**
 * The old copy a finished move left, until the narrator answers: Delete (after a danger confirm) or Keep it. The host deletes only the
 * folders of downloads in it and never anything else, and never the folder in use.
 */
export function OldCopyOffer() {
  const store = useAssetsStore();
  const previous = store.catalog?.previousRoot ?? '';
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  if (!store.catalog || previous === '' || (store.move !== undefined && isMoveRunning(store.move))) return null;

  const answer = async (act: () => Promise<string | undefined>, failure: string) => {
    setPending(true);
    const refused = await act();
    setPending(false);
    setAsking(false);
    if (refused !== undefined) overlay.toast(`${failure} ${refused}`, { tone: 'error' });
  };
  return (
    <div data-old-copy className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.8125rem] text-[var(--text-muted)]">
      <span className="min-w-0">The old copy is still in {path(previous)}</span>
      <span className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
          Delete old copy…
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void answer(store.keepOld, 'The old copy was not kept.')}>
          Keep it
        </Button>
      </span>
      {asking && (
        <ConfirmDialog
          title="Delete the old copy?"
          body={
            <>
              This deletes the downloaded models, voices and tools in {path(previous)}. Anything else in that folder stays. The copy in{' '}
              {path(store.catalog.cacheRoot)} is used from now on.
            </>
          }
          confirmLabel="Delete"
          confirmVariant="danger"
          focusCancel
          pending={pending}
          confirm={() => void answer(store.deleteOld, 'The old copy was not deleted.')}
          cancel={() => setAsking(false)}
        />
      )}
    </div>
  );
}
