import { useMemo, useState } from 'react';
import { TreeSelect, type TreeSelectRow, type TreeSelectSection } from '../primitives/TreeSelect';
import { TrackMark } from '../tracks/TreeRowParts';
import { buildTrackTree, SMALL_PROJECT, trackLabel, type TreeNode, type TreeTrack } from '../tracks/trackTree';
import type { TrackChoice } from './trackChoices';

type Entry = TreeTrack & { choice: TrackChoice };

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
 * native select (`TrackSelect` chooses). The widget is the `TreeSelect` primitive; this turns tracks into its rows and owns the search text and
 * which folders are open.
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
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Set<string>>();

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
  const toRow = (
    node: TreeNode<Entry>,
    at: number,
    place: Pick<TreeSelectRow, 'key' | 'level' | 'posInSet' | 'setSize'> & Partial<TreeSelectRow>,
  ): TreeSelectRow => {
    const entry = node.track.choice;
    const blocked = node.track.isFolder && entry.hasAudio === false;
    const path = place.key.startsWith('t-') ? '' : pathOf(nodes, at);
    return {
      id: node.id,
      label: trackLabel(node.track),
      mark: <TrackMark color={entry.color ?? ''} folder={node.track.isFolder} open={!shut.has(node.id)} />,
      note: [path, entry.heldBy ? `linked to ${entry.heldBy}` : ''].filter(Boolean).join(' · ') || undefined,
      disabledReason: blocked ? NO_AUDIO : undefined,
      disabledNote: blocked ? 'No audio of its own' : undefined,
      ...place,
    };
  };

  const sections: TreeSelectSection[] = [];
  if (searching) {
    const matches: TreeSelectRow[] = [];
    nodes.forEach((node, at) => {
      if (trackLabel(node.track).toLowerCase().includes(needle))
        matches.push(toRow(node, at, { key: `s-${node.id}`, level: 1, posInSet: matches.length + 1, setSize: 0, flat: true }));
    });
    sections.push({ rows: matches.map((row) => ({ ...row, setSize: matches.length })) });
  } else {
    const rows: TreeSelectRow[] = [];
    const hidden: boolean[] = [];
    nodes.forEach((node, at) => {
      const shown = node.parent < 0 || (hidden[node.parent] === false && !shut.has(nodes[node.parent].id));
      hidden[at] = !shown;
      if (shown)
        rows.push(
          toRow(node, at, {
            key: `t-${node.id}`,
            level: node.level,
            posInSet: node.posInSet,
            setSize: node.setSize,
            folder: node.track.isFolder ? { open: !shut.has(node.id) } : undefined,
          }),
        );
    });
    const bestAt = best ? nodes.findIndex((node) => node.id === best.guid) : -1;
    if (bestAt >= 0)
      // The best match is one row with its path, as a search result is; it is not a folder, so its caret is a blank.
      sections.push(
        { heading: 'Best match', rows: [toRow(nodes[bestAt], bestAt, { key: `b-${best?.guid}`, level: 1, posInSet: 1, setSize: 1 })] },
        { heading: 'Other tracks', rows },
      );
    else sections.push({ rows });
  }

  const toggle = (id: string, wanted: boolean) => {
    const next = new Set(shut);
    if (wanted) next.delete(id);
    else next.add(id);
    setClosed(next);
  };

  return (
    <TreeSelect
      label={label}
      value={value}
      shown={chosen >= 0 ? { path: pathOf(nodes, chosen) || undefined, name: trackLabel(nodes[chosen].track) } : undefined}
      placeholder="Choose a track"
      searchLabel="Search tracks"
      query={query}
      onQueryChange={setQuery}
      sections={sections}
      emptyText={(text) => `No track matches “${text}”`}
      onPick={onChange}
      onToggle={toggle}
      fullWidth={fullWidth}
    />
  );
}
