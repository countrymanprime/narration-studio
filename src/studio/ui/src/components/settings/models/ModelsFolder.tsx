import { useEffect, useState } from 'react';
import { overlay } from '../../../overlay/overlayService';
import { formatSize } from '../../assets/AssetFacts';
import { Button } from '../../primitives/Button';
import { ConfirmDialog } from '../../primitives/ConfirmDialog';
import { IconButton } from '../../primitives/IconButton';
import { WorkDialog } from '../../primitives/WorkDialog';
import { isMoveRunning, type AssetMovePhase, type AssetMoveState, type WorkJob } from '../../../types';
import { useAssetsStore } from './AssetsStore';

/** A path in a sentence or a title: isolated left to right, so a path with right-to-left letters does not reorder the words around it. */
const isolate = (value: string): string => `\u2066${value}\u2069`;

const path = (value: string) => (
  <code dir="ltr" className="font-['IBM_Plex_Mono',ui-monospace,monospace] text-[0.75rem] [overflow-wrap:anywhere]">
    {value}
  </code>
);

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
function jobOf(move: AssetMoveState, fallback: number, now: number): WorkJob {
  const begun = Date.parse(move.startedAt);
  const started = Number.isNaN(begun) ? fallback : begun;
  const running = isMoveRunning(move);
  return {
    id: move.id,
    kind: 'asset_install',
    phase: PHASE[move.phase],
    message: move.message,
    // A move that ended badly shows an empty bar: it is not progressing, and nothing was changed.
    percent: move.phase === 'error' || move.phase === 'cancelled' ? 0 : move.percent,
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
  // The system's folder dialog is open: another press of Change location waits for it.
  const [picking, setPicking] = useState(false);
  const [started, setStarted] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const running = move !== undefined && isMoveRunning(move);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  if (!catalog) return null;

  const previous = catalog.previousRoot;
  const answerOldFirst = () => overlay.toast('Delete the old copy or keep it first: another move is not offered until you have.', { tone: 'error' });
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
    setPicking(true);
    const folder = await store.pickFolder();
    setPicking(false);
    if (folder !== '') await begin(folder);
  };

  return (
    <>
      <Button variant="secondary" size="sm" className="flex-none" pending={picking} onClick={() => (previous ? answerOldFirst() : setAsking('change'))}>
        Change location…
      </Button>
      {catalog.custom && (
        <IconButton
          action="undo"
          label="Reset the models folder to the default folder"
          disabledReason={previous ? 'Delete the old copy or keep it first' : undefined}
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
        <WorkDialog title="Moving models" job={jobOf(move, started, now)} cancel={() => void store.cancelMove()} close={store.dismissMove} />
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
          title={`Delete the old copy in ${isolate(previous)}?`}
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
