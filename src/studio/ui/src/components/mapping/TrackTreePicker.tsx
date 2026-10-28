import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { Popover } from '../primitives/Popover';
import { SearchField } from '../primitives/SearchField';
import { TooltipTarget } from '../primitives/Tooltip';
import { treeKeyHandler } from '../primitives/treeKeys';
import { IndentGuides, TREE_INDENT, TrackMark, TreeCaret } from '../tracks/TreeRowParts';
import { buildTrackTree, SMALL_PROJECT, trackLabel, type TreeNode, type TreeTrack } from '../tracks/trackTree';
import type { TrackChoice } from './trackChoices';

type Entry = TreeTrack & { choice: TrackChoice };
type Row = { key: string; node: TreeNode<Entry>; level: number; posInSet: number; setSize: number; path?: string };

const NO_AUDIO = 'A folder with no audio of its own can’t be linked';

/** The tracks above a node, outermost first: "Narration / Chapters". */
const pathOf = (nodes: readonly TreeNode<Entry>[], at: number): string => {
  const names: string[] = [];
  for (let up = nodes[at].parent; up >= 0; up = nodes[up].parent) names.unshift(trackLabel(nodes[up].track));
  return names.join(' / ');
};

/**
 * The track picker for a project with REAPER folders: the Tracks card's tree in a popover, so a chapter is linked to a track in its folder. The
 * matcher's best match heads it, a search flattens the list to its matches with each one's folder path, a track another chapter holds says so,
 * and a folder with no audio of its own is shown but not choosable. The trigger names the pick with its path. A project with no folders keeps the
 * native select (`TrackSelect` chooses).
 */
export function TrackTreePicker({
  label,
  choices,
  value,
  onChange,
  fullWidth = false,
}: {
  label: string;
  choices: readonly TrackChoice[];
  value: string;
  onChange: (guid: string) => void;
  fullWidth?: boolean;
}) {
  const listId = useId();
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Set<string>>();
  const [active, setActive] = useState('');

  const nodes = useMemo(
    () =>
      buildTrackTree<Entry>(
        [...choices]
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          .map((choice) => ({
            guid: choice.guid,
            index: choice.index ?? 0,
            name: choice.name,
            depth: choice.depth ?? 0,
            isFolder: choice.isFolder ?? false,
            choice,
          })),
      ),
    [choices],
  );
  const best = choices.find((choice) => choice.best);
  const chosen = nodes.findIndex((node) => node.id === value);
  const folderIds = nodes.filter((node) => node.track.isFolder).map((node) => node.id);
  // The folders start open up to 30 tracks; above that only the way to the chosen and the best track is open.
  const defaultClosed = useMemo(() => {
    if (nodes.length <= SMALL_PROJECT) return new Set<string>();
    const wanted = new Set<string>();
    nodes.forEach((node, at) => {
      if (node.id !== value && node.id !== best?.guid) return;
      for (let up = nodes[at].parent; up >= 0; up = nodes[up].parent) wanted.add(nodes[up].id);
    });
    return new Set(folderIds.filter((id) => !wanted.has(id)));
  }, [nodes, value, best?.guid, folderIds]);
  const shut = closed ?? defaultClosed;

  const searching = query.trim() !== '';
  const needle = query.trim().toLowerCase();
  const rows: Row[] = [];
  if (searching) {
    nodes.forEach((node, at) => {
      if (trackLabel(node.track).toLowerCase().includes(needle))
        rows.push({ key: `s-${node.id}`, node, level: 1, posInSet: rows.length + 1, setSize: 0, path: pathOf(nodes, at) });
    });
    rows.forEach((row) => (row.setSize = rows.length));
  } else {
    const hidden: boolean[] = [];
    nodes.forEach((node) => {
      const shown = node.parent < 0 || (hidden[node.parent] === false && !shut.has(nodes[node.parent].id));
      hidden[nodes.indexOf(node)] = !shown;
      if (shown) rows.push({ key: `t-${node.id}`, node, level: node.level, posInSet: node.posInSet, setSize: node.setSize });
    });
  }
  const bestAt = !searching && best ? nodes.findIndex((node) => node.id === best.guid) : -1;
  const bestRow: Row | undefined =
    bestAt >= 0 ? { key: `b-${best?.guid}`, node: nodes[bestAt], level: 1, posInSet: 1, setSize: 1, path: pathOf(nodes, bestAt) } : undefined;
  const tabStop = [bestRow, ...rows].some((row) => row?.key === active) ? active : (bestRow ?? rows[0])?.key;

  const selectable = (node: TreeNode<Entry>) => !(node.track.isFolder && node.track.choice.hasAudio === false);
  const pick = (node: TreeNode<Entry>) => {
    onChange(node.id);
    setOpen(false);
  };
  const toggle = (id: string, wanted: boolean) => {
    const next = new Set(shut);
    if (wanted) next.delete(id);
    else next.add(id);
    setClosed(next);
  };
  const byKey = new Map([...(bestRow ? [bestRow] : []), ...rows].map((row) => [row.key, row]));
  const keys = treeKeyHandler(
    (key, wanted) => {
      const row = byKey.get(key);
      if (row) toggle(row.node.id, wanted);
    },
    (key) => {
      const row = byKey.get(key);
      if (!row) return;
      if (selectable(row.node)) pick(row.node);
      else toggle(row.node.id, shut.has(row.node.id));
    },
  );
  const fromSearch = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      popup.current?.querySelector<HTMLElement>('[data-tree-row]')?.focus();
    }
  };

  const renderRow = (row: Row) => {
    const { node } = row;
    const entry = node.track.choice;
    const folder = node.track.isFolder && !searching && row.key.startsWith('t-');
    const isOpen = !shut.has(node.id);
    const blocked = !selectable(node);
    const selected = node.id === value;
    const note = blocked ? 'No audio of its own' : entry.heldBy ? `linked to ${entry.heldBy}` : row.path;
    return (
      <li
        key={row.key}
        role="treeitem"
        id={`${listId}-${row.key}`}
        data-tree-row={row.key}
        data-level={row.level}
        aria-level={row.level}
        aria-posinset={row.posInSet}
        aria-setsize={row.setSize}
        aria-expanded={folder ? isOpen : undefined}
        aria-selected={selected}
        aria-disabled={blocked || undefined}
        tabIndex={row.key === tabStop ? 0 : -1}
        onFocus={() => setActive(row.key)}
        onClick={() => (blocked ? toggle(node.id, !isOpen) : pick(node))}
        className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md pr-2 text-sm hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)] aria-disabled:cursor-default aria-selected:bg-[var(--row-selected)] ${blocked ? 'text-[var(--text-muted)]' : ''}`}
      >
        {!searching && <IndentGuides level={row.level} />}
        {!searching && (
          <span onClick={(event) => event.stopPropagation()} className="contents">
            <TreeCaret folderName={folder ? trackLabel(node.track) : undefined} open={isOpen} onToggle={() => toggle(node.id, !isOpen)} />
          </span>
        )}
        <TrackMark color={node.track.choice.color ?? ''} folder={node.track.isFolder} open={isOpen} />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {blocked ? (
            <TooltipTarget text={NO_AUDIO} inline>
              <span>{trackLabel(node.track)}</span>
            </TooltipTarget>
          ) : (
            trackLabel(node.track)
          )}
        </span>
        {note && <span className="max-w-[45%] flex-none text-right text-xs [overflow-wrap:anywhere] text-[var(--text-muted)]">{note}</span>}
        {selected && <FontAwesomeIcon icon={faCheck} className="flex-none text-xs" aria-hidden="true" />}
      </li>
    );
  };

  const shownName = chosen >= 0 ? trackLabel(nodes[chosen].track) : '';
  const shownPath = chosen >= 0 ? pathOf(nodes, chosen) : '';
  const trigger = (
    <button
      type="button"
      // The name starts with what the control is for and holds the text it shows, so the visible words are part of the name.
      aria-label={`${label}: ${chosen >= 0 ? (shownPath ? `${shownPath} / ` : '') + shownName : 'Choose a track'}`}
      className={`box-border flex h-[var(--control-height)] min-w-0 items-center gap-1 rounded-[var(--control-radius)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-left text-[0.88rem] text-[var(--text)] ${fullWidth ? 'w-full' : ''}`}
    >
      <span className="min-w-0 flex-1 truncate">
        {chosen >= 0 ? (
          <>
            {shownPath && <span className="text-[var(--text-muted)]">{shownPath} / </span>}
            {shownName}
          </>
        ) : (
          <span className="text-[var(--text-muted)]">Choose a track</span>
        )}
      </span>
      <FontAwesomeIcon icon={faChevronDown} className="flex-none text-xs text-[var(--text-muted)]" aria-hidden="true" />
    </button>
  );

  return (
    <Popover trigger={trigger} label={label} align="start" open={open} onOpenChange={setOpen}>
      <div ref={popup} className={`space-y-2 ${TREE_INDENT}`} onKeyDown={keys}>
        <SearchField label="Search tracks" placeholder="Search tracks" value={query} onChange={setQuery} onKeyDown={fromSearch} leadingIcon autoFocus />
        <div className="max-h-[min(50vh,20rem)] overflow-auto overscroll-contain">
          {bestRow && (
            <>
              <div className="px-1 pb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Best match</div>
              <ul role="tree" aria-label="Best match">
                {renderRow(bestRow)}
              </ul>
              <div className="px-1 pt-2 pb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Other tracks</div>
            </>
          )}
          {rows.length > 0 ? (
            <ul role="tree" aria-label={bestRow ? 'Other tracks' : label}>
              {rows.map(renderRow)}
            </ul>
          ) : (
            <p className="px-1 py-3 text-center text-sm text-[var(--text-muted)]">No track matches “{query.trim()}”</p>
          )}
        </div>
      </div>
    </Popover>
  );
}
