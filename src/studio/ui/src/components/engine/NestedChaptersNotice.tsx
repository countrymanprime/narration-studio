import { useState } from 'react';
import { Button } from '../primitives/Button';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { StatusBadge } from '../primitives/StatusBadge';
import type { ChapterFolders } from '../../api/contracts/chapterTrackMap';

const folderOf = (name: string) => (name ? `${name}’s folder` : 'the top level');

/**
 * The Chapter links panel's header actions when a linked chapter's track sits inside another linked chapter's folder in REAPER (#2838):
 * a warning badge that counts them and "Move them out…", whose confirmation says which chapters and folders, and lists every track the
 * move changes, before anything is written. In the header, so nothing in the panel moves when it comes or goes (frontend-primitives
 * rule 7). Drawn only for a nesting the DAW reported; nothing shows while the check has no answer.
 */
export function NestedChaptersNotice({ check, repairing, onRepair }: { check: ChapterFolders | null; repairing: boolean; onRepair: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (check?.outcome !== 'nested') return null;
  const chapters = check.moves.filter((move) => move.chapterId);
  const folders = [...new Set(chapters.map((move) => move.fromName))];
  const named = chapters.map((move) => move.trackName);
  const who = named.length <= 2 ? named.join(' and ') : `${named.slice(0, 2).join(', ')} and ${named.length - 2} more`;
  const sentence = `In REAPER, ${who} ${named.length === 1 ? 'sits' : 'sit'} inside ${folders.map(folderOf).join(' and ')}, so ${
    named.length === 1 ? 'it is' : 'they are'
  } read as ${folders.length === 1 ? 'its voices' : 'their voices'}.`;

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      <StatusBadge tone="warning" label={`${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'} nested`} />
      <Button variant="secondary" size="sm" pending={repairing} title={sentence} onClick={() => setConfirming(true)}>
        Move them out…
      </Button>
      {confirming && (
        <ConfirmDialog
          title={`Move ${chapters.length === 1 ? 'a chapter' : `${chapters.length} chapters`} out of ${folders.join(' and ')}?`}
          body={`${sentence} Only the folder setting of the track just before each chapter changes in REAPER, and one Undo in REAPER takes it back.`}
          confirmLabel="Move them out"
          pending={repairing}
          confirm={() => {
            setConfirming(false);
            onRepair();
          }}
          cancel={() => setConfirming(false)}
        >
          <ul className="space-y-1 text-sm" aria-label="Tracks that move">
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
    </span>
  );
}
