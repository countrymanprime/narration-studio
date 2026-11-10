import { useEffect, useState } from 'react';
import { Button } from '../primitives/Button';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { IconButton } from '../primitives/IconButton';
import { StatusBadge } from '../primitives/StatusBadge';
import type { ChapterFolders } from '../../api/contracts/chapterTrackMap';
import { plural } from '../../plural';
import { trackName } from '../tracks/trackName';

// A name in the title and the summary is cut to this many characters: a REAPER track name can be any length (qa-breaker B4).
const NAME_MAX = 60;
const short = (name: string) => (name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name);
const folderOf = (name: string) => (name ? `${short(name)}’s folder` : 'the top level');

/** The sentence that says which chapters sit inside which folders. */
function nestingSentence(check: ChapterFolders): string {
  const chapters = check.moves.filter((move) => move.chapterId);
  const folders = [...new Set(chapters.map((move) => move.fromName))];
  const named = chapters.map((move) => short(move.trackName));
  const who = named.length <= 2 ? named.join(' and ') : `${named.slice(0, 2).join(', ')} and ${named.length - 2} more`;
  return `In REAPER, ${who} ${named.length === 1 ? 'sits' : 'sit'} inside ${folders.map(folderOf).join(' and ')}, so ${
    named.length === 1 ? 'it is' : 'they are'
  } read as ${folders.length === 1 ? 'its voices' : 'their voices'}.`;
}

/**
 * The Chapter links panel's header actions for the DAW's folder check (#2838). When a linked chapter's track sits inside another linked
 * chapter's folder: a warning badge that counts them and "Move them out…", whose confirmation lists every track the move changes before
 * anything is written. The confirmation keeps the list it opened with, and confirming sends exactly that list, so a newer check never
 * rewrites what the narrator is reading or confirms what they did not see (the DAW answers stale if the project changed); it closes when
 * the check stops finding a nesting. When the check was refused or failed: a badge that says the folders were not checked, with why, and
 * Check again. In the header, so nothing in the panel moves when these come or go (frontend-primitives rule 7).
 */
export function NestedChaptersNotice({
  check,
  repairing,
  onRepair,
  onCheckAgain,
}: {
  check: ChapterFolders | null;
  repairing: boolean;
  onRepair: (opened: ChapterFolders) => void;
  onCheckAgain: () => void;
}) {
  const [opened, setOpened] = useState<ChapterFolders | null>(null);
  const nested = check?.outcome === 'nested';
  // A check that no longer finds a nesting closes the confirmation; it never opens again by itself (qa-breaker B2).
  useEffect(() => {
    if (!nested) setOpened(null);
  }, [nested]);

  if (check?.outcome === 'refused') {
    return (
      <span className="flex items-center justify-end gap-2" title={check.message}>
        <StatusBadge tone="neutral" label="Folders not checked" />
        <IconButton action="retry" label="Check the folders again" onClick={onCheckAgain} />
        <span className="sr-only">{check.message}</span>
      </span>
    );
  }
  if (!check || !nested) return null;
  const chapters = check.moves.filter((move) => move.chapterId);

  const shown = opened ?? check;
  const shownChapters = shown.moves.filter((move) => move.chapterId);
  const shownFolders = [...new Set(shownChapters.map((move) => short(move.fromName)))];
  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      <StatusBadge tone="warning" label={`${plural(chapters.length, 'chapter')} nested`} />
      <Button variant="secondary" size="sm" pending={repairing} title={nestingSentence(check)} onClick={() => setOpened(check)}>
        Move them out…
      </Button>
      {opened && (
        <ConfirmDialog
          title={`Move ${shownChapters.length === 1 ? 'a chapter' : plural(shownChapters.length, 'chapter')} out of ${shownFolders.join(' and ')}?`}
          body={`${nestingSentence(shown)} Only the folder setting of the track just before each chapter changes in REAPER, and one Undo in REAPER takes it back.`}
          confirmLabel="Move them out"
          pending={repairing}
          confirm={() => {
            setOpened(null);
            onRepair(shown);
          }}
          cancel={() => setOpened(null)}
        >
          <ul className="space-y-1 text-sm break-words" aria-label="Tracks that move">
            {shown.moves.map((move) => (
              <li key={move.trackGuid} className="line-clamp-3">
                <strong>
                  <bdi>{trackName(short(move.trackName))}</bdi>
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
