import { useState } from 'react';
import { Button } from '../primitives/Button';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { InsetCard } from '../primitives/InsetCard';
import type { ChapterFolders } from '../../api/contracts/chapterTrackMap';

const folderOf = (name: string) => (name ? `${name}’s folder` : 'the top level');

/**
 * The Chapter links panel's notice when a linked chapter's track sits inside another linked chapter's folder in REAPER (#2838): it
 * says which, and "Move them out…" shows every track the move changes before anything is written. Drawn only for a nesting the DAW
 * reported; nothing is shown while the check has no answer.
 */
export function NestedChaptersNotice({ check, repairing, onRepair }: { check: ChapterFolders | null; repairing: boolean; onRepair: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (check?.outcome !== 'nested') return null;
  const chapters = check.moves.filter((move) => move.chapterId);
  const folders = [...new Set(chapters.map((move) => move.fromName))];
  const named = chapters.map((move) => move.trackName);
  const who = named.length <= 2 ? named.join(' and ') : `${named.slice(0, 2).join(', ')} and ${named.length - 2} more`;

  return (
    <InsetCard tone="warn" fill className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 text-sm">
        In REAPER, <strong>{who}</strong> {named.length === 1 ? 'sits' : 'sit'} inside {folders.map(folderOf).join(' and ')}, so{' '}
        {named.length === 1 ? 'it is' : 'they are'} read as {folders.length === 1 ? 'its voices' : 'their voices'}.
      </p>
      <Button variant="secondary" pending={repairing} onClick={() => setConfirming(true)}>
        Move them out…
      </Button>
      {confirming && (
        <ConfirmDialog
          title={`Move ${chapters.length === 1 ? 'a chapter' : `${chapters.length} chapters`} out of ${folders.join(' and ')}?`}
          body="Only the folder setting of the track just before each chapter changes in REAPER. One Undo in REAPER takes it back."
          confirmLabel="Move them out"
          pending={repairing}
          confirm={() => {
            setConfirming(false);
            onRepair();
          }}
          cancel={() => setConfirming(false)}
        >
          <ul className="max-h-[min(40vh,16rem)] space-y-1 overflow-auto text-sm" aria-label="Tracks that move">
            {check.moves.map((move) => (
              <li key={move.trackGuid}>
                <strong>
                  <bdi>{move.trackName || 'Unnamed track'}</bdi>
                </strong>
                {': out of '}
                <bdi>{folderOf(move.fromName)}</bdi>
                {', to '}
                <bdi>{folderOf(move.toName)}</bdi>
                {move.chapterId ? '' : ' (not a chapter: it comes after one)'}
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </InsetCard>
  );
}
