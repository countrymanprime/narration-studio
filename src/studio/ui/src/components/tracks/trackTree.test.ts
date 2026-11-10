import { describe, expect, it } from 'vitest';
import { buildTrackTree, type TreeTrack } from './trackTree';

const t = (name: string, depth: number, isFolder = false): TreeTrack => ({ guid: `g-${name}`, index: 0, name, depth, isFolder });

// Book > (Part 1 > (Ch 1, Ch 2), Empty > Spare), Appendix; Intro first. The hand-made folders fixture's shape.
const TRACKS = [t('Intro', 0), t('Book', 0, true), t('Part 1', 1, true), t('Ch 1', 2), t('Ch 2', 2), t('Empty', 1, true), t('Spare', 2), t('Appendix', 0)].map(
  (track, index) => ({ ...track, index }),
);

describe('buildTrackTree', () => {
  const nodes = buildTrackTree(TRACKS);
  it('derives levels, parents and direct child counts from depth and order', () => {
    expect(nodes.map((n) => [n.track.name, n.level, n.parent, n.childCount])).toEqual([
      ['Intro', 1, -1, 0],
      ['Book', 1, -1, 2],
      ['Part 1', 2, 1, 2],
      ['Ch 1', 3, 2, 0],
      ['Ch 2', 3, 2, 0],
      ['Empty', 2, 1, 1],
      ['Spare', 3, 5, 0],
      ['Appendix', 1, -1, 0],
    ]);
  });
  it('numbers siblings for aria-posinset and aria-setsize', () => {
    expect(nodes.map((n) => [n.posInSet, n.setSize])).toEqual([
      [1, 3],
      [2, 3],
      [1, 2],
      [1, 2],
      [2, 2],
      [2, 2],
      [1, 1],
      [3, 3],
    ]);
  });
  it('treats a flat project as one level', () => {
    expect(buildTrackTree([t('a', 0), t('b', 0)]).every((n) => n.level === 1 && n.parent === -1)).toBe(true);
  });
  it('closes a depth jump of more than one level under the nearest shallower folder', () => {
    const jump = buildTrackTree([t('F', 0, true), t('deep', 2)]);
    expect(jump[1]).toMatchObject({ level: 2, parent: 0 });
  });
});
