import { describe, expect, it } from 'vitest';
import type { WorkspaceItem } from '../../../api/contracts/workspace';
import type { PlaylistSegment } from '../../proof/playlist';
import { docAt, projectAt, projectEndAt, whyNotPlaced, type ClosedCut } from './clockMap';

const seg = (itemGuid: string, sourceStart: number, sourceEnd: number, elapsedStart: number): PlaylistSegment => ({
  itemGuid,
  sourceFile: `${itemGuid}.wav`,
  sourceStart,
  sourceEnd,
  elapsedStart,
  elapsedEnd: elapsedStart + (sourceEnd - sourceStart),
  overlapsPrevious: false,
});
const item = (itemGuid: string, position: number, sourceStart: number, length: number, playRate = 1, live = true): WorkspaceItem => ({
  index: 0,
  itemGuid,
  live,
  position,
  sourceStart,
  length,
  playRate,
});

const near = (actual: number | null, expected: number | null): void => {
  if (expected === null) expect(actual).toBeNull();
  else expect(actual).not.toBeNull();
  if (expected !== null && actual !== null) expect(actual).toBeCloseTo(expected, 6);
};

interface Row {
  name: string;
  playlist: PlaylistSegment[];
  items: WorkspaceItem[];
  cuts?: ClosedCut[];
  /** [document seconds, project seconds or null] */
  forward: Array<[number, number | null]>;
  /** [project seconds, document seconds or null] */
  backward: Array<[number, number | null]>;
}

const rows: Row[] = [
  {
    name: 'one untrimmed item at rate 1: the document clock is the item clock shifted by its position',
    playlist: [seg('a', 10, 30, 0)],
    items: [item('a', 100, 10, 20)],
    forward: [
      [0, 100],
      [5, 105],
      [19.999, 119.999],
      [20, null],
    ],
    backward: [
      [100, 0],
      [105, 5],
      [99.9, null],
      [120, null],
    ],
  },
  {
    name: 'two takes of different items, with a silent gap in the project between them',
    playlist: [seg('a', 0, 10, 0), seg('b', 50, 60, 10)],
    items: [item('a', 100, 0, 10), item('b', 200, 50, 10)],
    forward: [
      [3, 103],
      [10, 200],
      [12, 202],
    ],
    backward: [
      [103, 3],
      [202, 12],
      [150, null],
    ],
  },
  {
    name: 'a take laid over another: the item that starts later is the one that plays, in both directions',
    playlist: [seg('a', 0, 10, 0), seg('b', 0, 10, 10)],
    items: [item('a', 100, 0, 10), item('b', 104, 0, 4)],
    forward: [
      [2, 102],
      [12, 106],
    ],
    backward: [
      [102, 2],
      [106, 12],
      [103.99, 3.99],
    ],
  },
  {
    name: 'a trimmed item: source before its start offset or past its length has no project time',
    playlist: [seg('a', 4, 20, 0)],
    items: [item('a', 100, 10, 5)],
    forward: [
      [1, null],
      [5.999, null],
      [6, 100],
      [8, 102],
      [10.999, 104.999],
      [11, null],
    ],
    backward: [
      [100, 6],
      [104.5, 10.5],
      [105, null],
    ],
  },
  {
    name: 'a play rate of 2 reads two source seconds for each project second',
    playlist: [seg('a', 10, 18, 0)],
    items: [item('a', 100, 10, 4, 2)],
    forward: [
      [2, 101],
      [7.9, 103.95],
      [8, null],
    ],
    backward: [
      [101, 2],
      [103.95, 7.9],
      [104, null],
    ],
  },
  {
    name: 'a play rate of 0.5 reads half a source second for each project second',
    playlist: [seg('a', 0, 5, 0)],
    items: [item('a', 50, 0, 10, 0.5)],
    forward: [
      [2, 54],
      [4.9, 59.8],
    ],
    backward: [
      [54, 2],
      [59.8, 4.9],
    ],
  },
  {
    name: 'an item that is not live, or has no place read, maps nowhere',
    playlist: [seg('a', 0, 10, 0), seg('b', 0, 10, 10)],
    items: [item('a', 100, 0, 10, 1, false), { index: 1, itemGuid: 'b', live: true }],
    forward: [
      [2, null],
      [12, null],
    ],
    backward: [[102, null]],
  },
  {
    name: 'a cut that closes its gap: the document skips the cut and so does the project',
    // Source 14 to 16 of item a was cut; the audio after it moved up two seconds, so document 5 is source 7 into the item and project 105.
    playlist: [seg('a', 10, 28, 0)],
    items: [item('a', 100, 10, 18)],
    cuts: [{ itemGuid: 'a', from: 14, to: 16 }],
    forward: [
      [3, 103],
      [3.999, 103.999],
      [4, 104],
      [5, 105],
      [17.5, 117.5],
    ],
    backward: [
      [103, 3],
      [105, 5],
      [117.5, 17.5],
    ],
  },
  {
    name: 'two cuts in one item, one of them at the very start of the segment',
    playlist: [seg('a', 0, 10, 0)],
    items: [item('a', 100, 0, 10)],
    cuts: [
      { itemGuid: 'a', from: 0, to: 1 },
      { itemGuid: 'a', from: 5, to: 7 },
    ],
    forward: [
      [0, 100],
      [3.9, 103.9],
      [4, 104],
    ],
    backward: [
      [100, 0],
      [104, 4],
    ],
  },
  {
    name: 'a cut of another item changes nothing here',
    playlist: [seg('a', 0, 10, 0)],
    items: [item('a', 100, 0, 10)],
    cuts: [{ itemGuid: 'z', from: 2, to: 4 }],
    forward: [[5, 105]],
    backward: [[105, 5]],
  },
  {
    name: 'a play rate of 2 with a cut: the cut leaves the project in project seconds',
    playlist: [seg('a', 0, 16, 0)],
    items: [item('a', 100, 0, 6, 2)],
    cuts: [{ itemGuid: 'a', from: 4, to: 8 }],
    forward: [
      [2, 101],
      [4, 102],
      [6, 103],
    ],
    backward: [
      [101, 2],
      [102, 4],
      [103, 6],
    ],
  },
];

describe('clock-map', () => {
  for (const row of rows) {
    it(`${row.name}: document to project`, () => {
      for (const [doc, project] of row.forward) near(projectAt({ playlist: row.playlist, items: row.items, cuts: row.cuts }, doc), project);
    });
    it(`${row.name}: project to document`, () => {
      for (const [project, doc] of row.backward) near(docAt({ playlist: row.playlist, items: row.items, cuts: row.cuts }, project), doc);
    });
  }

  it('is its own inverse wherever the document has a project time and nothing else plays over it', () => {
    // A take laid over another shadows it: the shadowed words have a project time, but what plays there is the other take.
    for (const row of rows.filter((r) => !r.name.includes('laid over'))) {
      const map = { playlist: row.playlist, items: row.items, cuts: row.cuts };
      for (let doc = 0; doc < 40; doc += 0.37) {
        const project = projectAt(map, doc);
        if (project === null) continue;
        const back = docAt(map, project);
        expect(back, `${row.name} at ${doc}`).not.toBeNull();
        expect(back as number).toBeCloseTo(doc, 6);
      }
    }
  });

  it.each([NaN, Infinity, -Infinity, -1, -0.0001])('maps %s nowhere, in either direction', (bad) => {
    const map = { playlist: [seg('a', 0, 10, 0)], items: [item('a', 100, 0, 10)] };
    expect(projectAt(map, bad)).toBeNull();
    expect(docAt(map, bad)).toBeNull();
  });

  it('maps nothing with an empty playlist or no items', () => {
    expect(projectAt({ playlist: [], items: [item('a', 0, 0, 10)] }, 1)).toBeNull();
    expect(docAt({ playlist: [seg('a', 0, 10, 0)], items: [] }, 1)).toBeNull();
  });

  it('treats a play rate of 0 as 1, as the bridge does', () => {
    const map = { playlist: [seg('a', 0, 10, 0)], items: [item('a', 100, 0, 10, 0)] };
    near(projectAt(map, 3), 103);
    near(docAt(map, 103), 3);
  });
});

// A play ends past the last word of a paragraph (the tail of its sound), which is past the playlist segment that ends on the word: the DAW is told
// the project second the play ends at, so `projectEndAt` carries the end on from the segment's last second at the item's rate.
describe('projectEndAt', () => {
  const items = [item('a', 100, 10, 8, 2)];
  const playlist = [seg('a', 10, 14, 0)];

  it('is the project second a play that ends inside a segment ends at', () => {
    near(projectEndAt({ playlist, items }, 2), projectAt({ playlist, items }, 2));
  });
  it("is the project second of the segment's end for a play that ends exactly on it", () => {
    // 4 document seconds at twice the speed are 2 project seconds.
    near(projectEndAt({ playlist, items }, 4), 102);
  });
  it("carries on past the end of the last segment at the item's rate (the tail of the last word)", () => {
    near(projectEndAt({ playlist, items }, 4.4), 102.2);
  });
  it('carries on past a segment into the room before the next one, never into the next', () => {
    // A gap of one document second between the two paragraphs: 4.3 is 0.3 s into it.
    const two = [seg('a', 10, 14, 0), seg('a', 16, 18, 5)];
    near(projectEndAt({ playlist: two, items }, 4.3), 102.15);
  });
  it('gives up beyond a second past the end, where nothing is known to play', () => {
    expect(projectEndAt({ playlist, items }, 6)).toBeNull();
  });
  it('maps nothing for an item the project does not hold live, or a time that is not usable', () => {
    expect(projectEndAt({ playlist, items: [item('a', 100, 10, 8, 2, false)] }, 4)).toBeNull();
    expect(projectEndAt({ playlist, items }, -1)).toBeNull();
    expect(projectEndAt({ playlist, items }, Number.NaN)).toBeNull();
    expect(projectEndAt({ playlist: [], items }, 4)).toBeNull();
  });
});

describe('whyNotPlaced', () => {
  const playlist = [seg('a', 0, 10, 0)];
  const why = (items: WorkspaceItem[], t = 5): string => whyNotPlaced({ playlist, items }, t, 'REAPER');
  it('is never asked for an item at project second 0', () => {
    expect(projectAt({ playlist, items: [item('a', 0, 0, 10)] }, 5)).toBe(5);
  });
  it('names a second with no recording', () => expect(why([item('a', 0, 0, 10)], 50)).toMatch(/no recorded audio at that time/));
  it('names an item the project does not hold at all', () => expect(why([])).toMatch(/not in REAPER's saved project/));
  it('names an item the saved project no longer has', () => expect(why([item('a', 0, 0, 10, 1, false)])).toMatch(/not in REAPER's saved project any more/));
  it('names an item whose place was not read', () => {
    const unread: WorkspaceItem = { index: 0, itemGuid: 'a', live: true, length: 10 };
    expect(why([unread])).toMatch(/has not read where the audio item sits/);
  });
  it('names an item trimmed short of the part', () => expect(why([item('a', 100, 0, 3)])).toMatch(/trimmed, split or moved/));
});

// The owner's chapter: one 2-minute track, its first item 60 s long from project second 0 and its second from 60 s. Every section resolves to its item,
// the first minute included (the host once sent the first item without a position, which left that minute "not in REAPER's project").
describe('a two-minute track of two items, 0 s and 60 s', () => {
  const playlist = [seg('a', 0, 60, 0), seg('b', 0, 60, 60)];
  const items = [item('a', 0, 0, 60), item('b', 60, 0, 60)];
  it.each([5, 30, 59, 61, 90])('places the section at %s s', (t) => {
    near(projectAt({ playlist, items }, t), t);
    expect(whyNotPlaced({ playlist, items }, t, 'REAPER')).toBeTruthy();
  });
  it('ends a play inside the first item where the app planned it', () => {
    near(projectEndAt({ playlist, items }, 30), 30);
  });
});
