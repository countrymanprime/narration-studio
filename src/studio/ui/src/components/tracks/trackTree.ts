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
