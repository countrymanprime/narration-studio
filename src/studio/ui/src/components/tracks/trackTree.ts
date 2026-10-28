/** The part of a track the tree reads: REAPER's folder depth in file order (see `Track.depth`). */
export type TreeTrack = { guid: string; index: number; name: string; depth: number; isFolder: boolean };

export type TreeNode<T extends TreeTrack = TreeTrack> = {
  /** The row's key: the track's GUID, or its place when the file gave none. */
  id: string;
  track: T;
  /** 1 at the top, as `aria-level` counts. */
  level: number;
  /** Position of the parent folder in the node list, -1 at the top. */
  parent: number;
  /** Direct children only. */
  childCount: number;
  /** 1-based place among its siblings, and how many siblings, for `aria-posinset` and `aria-setsize`. */
  posInSet: number;
  setSize: number;
};

export const SMALL_PROJECT = 30;

const trackId = (track: TreeTrack): string => track.guid || `#${track.index}`;
export const trackLabel = (track: TreeTrack): string => track.name || `Track ${track.index + 1}`;

/**
 * Turns the flat track list (file order, each track's folder depth) into tree nodes. A parent is the nearest earlier track that is shallower,
 * and a level is its parent's plus one, so a damaged depth jump still nests under a real folder and a flat project is one level.
 */
export function buildTrackTree<T extends TreeTrack>(tracks: readonly T[]): TreeNode<T>[] {
  const nodes: TreeNode<T>[] = [];
  const open: number[] = []; // positions of the folders still open above the current track
  for (const track of tracks) {
    while (open.length > 0 && tracks[open[open.length - 1]].depth >= track.depth) open.pop();
    const parent = open.length > 0 ? open[open.length - 1] : -1;
    nodes.push({ id: trackId(track), track, level: parent < 0 ? 1 : nodes[parent].level + 1, parent, childCount: 0, posInSet: 0, setSize: 0 });
    if (parent >= 0) nodes[parent].childCount++;
    if (track.isFolder) open.push(nodes.length - 1);
  }
  const seen = new Map<number, number>();
  for (const node of nodes) {
    const place = (seen.get(node.parent) ?? 0) + 1;
    seen.set(node.parent, place);
    node.posInSet = place;
  }
  for (const node of nodes) node.setSize = seen.get(node.parent) ?? 1;
  return nodes;
}

const ancestors = (nodes: readonly TreeNode[], at: number): number[] => {
  const out: number[] = [];
  for (let up = nodes[at].parent; up >= 0; up = nodes[up].parent) out.push(up);
  return out;
};

/** The rows to draw: every node whose folders above it are all open. */
export function visibleNodes<T extends TreeTrack>(nodes: readonly TreeNode<T>[], open: ReadonlySet<string>): TreeNode<T>[] {
  const shown: boolean[] = [];
  return nodes.filter((node, at) => {
    const visible = node.parent < 0 || (shown[node.parent] && open.has(nodes[node.parent].id));
    shown[at] = visible;
    return visible;
  });
}

/** "N of M linked" for the folder at `at`: M is every track below it that is not itself a folder. */
export function folderRollup(nodes: readonly TreeNode[], at: number, linked: ReadonlySet<string>): { linked: number; total: number } {
  let total = 0;
  let count = 0;
  for (let next = at + 1; next < nodes.length && nodes[next].level > nodes[at].level; next++) {
    if (nodes[next].track.isFolder) continue;
    total++;
    if (linked.has(nodes[next].id)) count++;
  }
  return { linked: count, total };
}

/** Where the folders start: all open up to 30 tracks, above that only the path to each linked track. Not saved. */
export function defaultOpen(nodes: readonly TreeNode[], linked: ReadonlySet<string>): Set<string> {
  const open = new Set<string>();
  nodes.forEach((node, at) => {
    if (nodes.length <= SMALL_PROJECT) {
      if (node.track.isFolder) open.add(node.id);
    } else if (linked.has(node.id)) {
      for (const up of ancestors(nodes, at)) open.add(nodes[up].id);
    }
  });
  return open;
}

/** The rows a search leaves: the tracks whose name has the text and the folders above them (all open), plus which ones matched. */
export function searchVisible<T extends TreeTrack>(nodes: readonly TreeNode<T>[], query: string): { rows: TreeNode<T>[]; matched: Set<string> } {
  const needle = query.trim().toLowerCase();
  if (!needle) return { rows: [...nodes], matched: new Set() };
  const keep = new Set<number>();
  const matched = new Set<string>();
  nodes.forEach((node, at) => {
    if (!trackLabel(node.track).toLowerCase().includes(needle)) return;
    matched.add(node.id);
    keep.add(at);
    for (const up of ancestors(nodes, at)) keep.add(up);
  });
  return { rows: nodes.filter((_, at) => keep.has(at)), matched };
}
