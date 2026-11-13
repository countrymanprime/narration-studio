import { describe, expect, it } from 'vitest';
import type { ChapterTrackLink, ManuscriptChapter, Track, TrackMapping } from '../../types';
import { chapterTrackRows } from '../engine/chapterTrackRows';
import { chapterTrackButtonLabel, chapterTrackButtonState, followLiveTracks, showableTrackGuid } from './chapterTrackButtonState';

const base: ChapterTrackLink = {
  chapterId: 'c-1',
  chapterTitle: 'Chapter 6',
  status: 'none',
  track: null,
  candidates: [],
  warnings: [],
  links: [],
  recordedEnd: null,
  members: [],
};

const track = { trackGuid: '{T}', trackName: 'CHAPTER SIX', trackIndex: 5, score: 1, source: 'confirmed' as const, region: null };

describe('chapterTrackButtonState', () => {
  it('reads a confirmed link with no warnings as linked', () => {
    const link: ChapterTrackLink = { ...base, status: 'confirmed', track };
    expect(chapterTrackButtonState(link)).toEqual({ kind: 'linked', trackName: 'CHAPTER SIX', trackGuid: '{T}' });
    expect(chapterTrackButtonLabel('Chapter 6', chapterTrackButtonState(link))).toBe('Track for Chapter 6: CHAPTER SIX, linked');
  });

  it('reads a confirmed link with a rename warning as renamed', () => {
    const link: ChapterTrackLink = { ...base, status: 'confirmed', track, warnings: ['confirmed-track-renamed'] };
    expect(chapterTrackButtonState(link)).toEqual({ kind: 'renamed', trackName: 'CHAPTER SIX', trackGuid: '{T}' });
  });

  it('reads a matched or uncertain, unconfirmed status as suggested', () => {
    for (const status of ['matched', 'uncertain'] as const) {
      const link: ChapterTrackLink = { ...base, status, track };
      expect(chapterTrackButtonState(link)).toEqual({ kind: 'suggested', trackName: 'CHAPTER SIX', trackGuid: '{T}' });
    }
    expect(chapterTrackButtonLabel('Chapter 6', chapterTrackButtonState({ ...base, status: 'matched', track }))).toBe(
      'Track for Chapter 6: suggested CHAPTER SIX, not confirmed',
    );
  });

  it('reads ambiguous status, or a confirmed-links-conflict warning, as ambiguous with a count', () => {
    const byStatus: ChapterTrackLink = { ...base, status: 'ambiguous', candidates: [track, { ...track, trackGuid: '{U}' }] };
    expect(chapterTrackButtonState(byStatus)).toEqual({ kind: 'ambiguous', count: 2 });
    const byWarning: ChapterTrackLink = {
      ...base,
      status: 'confirmed',
      track,
      warnings: ['confirmed-links-conflict'],
      links: [
        { trackGuid: '{T}', chapterId: 'c-1', chapterTitle: 'Chapter 6', confirmedAt: '2026-01-01T00:00:00Z' },
        { trackGuid: '{U}', chapterId: 'c-1', chapterTitle: 'Chapter 6', confirmedAt: '2026-01-01T00:00:00Z' },
      ],
    };
    expect(chapterTrackButtonState(byWarning)).toEqual({ kind: 'ambiguous', count: 2 });
  });

  it('reads a confirmed-track-missing warning as missing, even over a confirmed status', () => {
    const link: ChapterTrackLink = { ...base, status: 'confirmed', track, warnings: ['confirmed-track-missing'] };
    expect(chapterTrackButtonState(link)).toEqual({ kind: 'missing' });
    expect(chapterTrackButtonLabel('Chapter 6', { kind: 'missing' })).toBe('Track for Chapter 6: linked track is missing');
  });

  it('reads a none status with no candidates as not linked', () => {
    expect(chapterTrackButtonState(base)).toEqual({ kind: 'unlinked' });
    expect(chapterTrackButtonLabel('Chapter 6', { kind: 'unlinked' })).toBe('Track for Chapter 6: not linked');
  });
});

describe('showableTrackGuid (#3168)', () => {
  it('is the track only for a confirmed link to a track that is there', () => {
    expect(showableTrackGuid({ ...base, status: 'confirmed', track })).toBe('{T}');
    expect(showableTrackGuid({ ...base, status: 'confirmed', track, warnings: ['confirmed-track-renamed'] })).toBe('{T}');
  });
  it('is nothing for a missing track, a suggestion, an ambiguous match, no link or no chapter', () => {
    const mapping = { trackGuid: '{T}' } as ChapterTrackLink['links'][number];
    expect(showableTrackGuid({ ...base, status: 'confirmed', track, links: [mapping], warnings: ['confirmed-track-missing'] })).toBeUndefined();
    expect(showableTrackGuid({ ...base, status: 'matched', track })).toBeUndefined();
    expect(showableTrackGuid({ ...base, status: 'ambiguous', track, links: [mapping] })).toBeUndefined();
    expect(showableTrackGuid(base)).toBeUndefined();
    expect(showableTrackGuid(undefined)).toBeUndefined();
  });
});

describe('followLiveTracks', () => {
  const confirmed: ChapterTrackLink = {
    ...base,
    status: 'confirmed',
    track,
    links: [{ trackGuid: '{T}', chapterId: 'c-1', chapterTitle: 'Chapter 6', confirmedAt: '2026-01-01T00:00:00Z' }],
  };

  it('leaves a link alone when the tracks are not known yet or it is not a confirmed link', () => {
    expect(followLiveTracks(confirmed, undefined)).toBe(confirmed);
    const suggested = { ...confirmed, status: 'matched' as const };
    expect(followLiveTracks(suggested, [])).toBe(suggested);
  });

  it('marks a confirmed link missing when the live list has no such track, once', () => {
    const gone = followLiveTracks(confirmed, [{ guid: '{Other}', name: 'Other' }]);
    expect(chapterTrackButtonState(gone).kind).toBe('missing');
    expect(followLiveTracks(gone, []).warnings.filter((w) => w === 'confirmed-track-missing')).toHaveLength(1);
  });

  it('calls several links several, whichever of their tracks is there', () => {
    const two = { ...confirmed, links: [...confirmed.links, { ...confirmed.links[0], trackGuid: '{U}' }], warnings: ['confirmed-track-missing' as const] };
    const allGone = followLiveTracks(two, []);
    expect(chapterTrackButtonState(allGone).kind).toBe('ambiguous');
    expect(allGone.warnings).not.toContain('confirmed-track-missing');
  });

  it('draws a track that is there under the name it has now', () => {
    const renamed = followLiveTracks(confirmed, [{ guid: '{T}', name: 'New Name' }]);
    expect(renamed.track?.trackName).toBe('New Name');
    expect(followLiveTracks(confirmed, [{ guid: '{T}', name: 'CHAPTER SIX' }])).toBe(confirmed);
  });
});

// The class guard of #3415: the Engine row, the Booth, the DAW tools and the Link chapters dialog read a chapter's link through `chapterTrackRows`; the
// board, its row menu and the chapter track panel read it through `followLiveTracks`. Whatever REAPER's track list does, the two must say the same:
// the same Missing state and the same name.
describe('every surface says the same about a track renamed or deleted in REAPER (#3415)', () => {
  const link: ChapterTrackLink = {
    ...base,
    status: 'confirmed',
    track,
    links: [{ trackGuid: '{T}', chapterId: 'c-1', chapterTitle: 'Chapter 6', confirmedAt: '2026-01-01T00:00:00Z' }],
  };
  const chapter = { id: 'c-1', title: 'Chapter 6', subtitle: '', kind: 'narration' } as unknown as ManuscriptChapter;
  const mappings = link.links as unknown as TrackMapping[];
  const live = (tracks: { guid: string; name: string }[]) => tracks.map((t, index) => ({ ...t, index, items: [] }) as unknown as Track);

  const scenarios: [string, { guid: string; name: string }[]][] = [
    ['unchanged', [{ guid: '{T}', name: 'CHAPTER SIX' }]],
    ['renamed', [{ guid: '{T}', name: 'Renamed in REAPER' }]],
    ['deleted', [{ guid: '{Other}', name: 'Other' }]],
    ['all tracks deleted', []],
  ];

  it.each(scenarios)('%s', (_name, tracks) => {
    const [row] = chapterTrackRows([chapter], live(tracks), mappings);
    const followed = chapterTrackButtonState(followLiveTracks(link, tracks));
    expect(followed.kind === 'missing').toBe(row.state === 'missing');
    if (followed.kind === 'linked' || followed.kind === 'renamed') expect(followed.trackName).toBe(row.trackName);
    // Show in REAPER is on exactly when the Engine row says Linked.
    expect(showableTrackGuid(followLiveTracks(link, tracks)) !== undefined).toBe(row.state === 'linked');
  });
});
