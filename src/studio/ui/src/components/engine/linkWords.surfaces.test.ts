import { describe, expect, it } from 'vitest';
import type { VoiceTracksLayout } from '../../api/contracts/voiceTracks';
import type { ChapterTrackLink } from '../../types';
import { linkStateLabel, type ChapterLinkState } from '../chapterTracks/chapterLink';
import { noAudioText } from '../editing/page/noAudioText';
import { noRecordingWhy } from '../proof/checkcard/cardSelectors';
import { chapterCheckStatusText, type ChapterCheckStatus } from '../production/chapterCheckStatus';
import { chapterTrackButtonLabel, chapterTrackButtonState, noShowableTrackReason, type ChapterTrackButtonState } from '../production/chapterTrackButtonState';
import { chapter } from '../production/pipeline/pipelineFixtures';
import { buildPipelineRows } from '../production/pipeline/pipelineRows';
import { destinationFor } from './destination';

/**
 * Every surface that words a chapter's link state, over the four states and both layouts (#3363, #3271): a Voice folders project never reads
 * a flat word ("track"), and a flat project never reads "folder". Each row of `SURFACES` is one surface's wording function; a new surface adds
 * a row, so the guard does not depend on remembering it. The words a folder legitimately holds ("voice tracks", the "Narrator track") are
 * named in `ALLOWED`; a sentence about the DAW's own tracks (the audio engine panel's list) is not a link-state word and is not here.
 */
const ALLOWED = /voice tracks?|Narrator track/gi;

const link: ChapterTrackLink = {
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
const mapping = { trackGuid: '{T}' } as ChapterTrackLink['links'][number];

/** One link per state the panel and the menu tell apart. */
const LINKS: Record<string, ChapterTrackLink> = {
  unlinked: link,
  suggested: { ...link, status: 'matched', track },
  candidates: { ...link, status: 'ambiguous', candidates: [track, track] },
  several: { ...link, status: 'confirmed', track, links: [mapping, { ...mapping, trackGuid: '{U}' }], warnings: ['confirmed-links-conflict'] },
  missing: { ...link, status: 'confirmed', track, links: [mapping], warnings: ['confirmed-track-missing'] },
};

const BUTTON_STATES: ChapterTrackButtonState[] = [
  { kind: 'linked', trackName: 'CHAPTER SIX', trackGuid: '{T}' },
  { kind: 'renamed', trackName: 'CHAPTER SIX', trackGuid: '{T}' },
  { kind: 'suggested', trackName: 'CHAPTER SIX', trackGuid: '{T}' },
  { kind: 'ambiguous', count: 2 },
  { kind: 'missing' },
  { kind: 'unlinked' },
];

const CHECKS: ChapterCheckStatus[] = [
  { kind: 'needs_track', count: 3 },
  { kind: 'suggested', trackName: 'CHAPTER SIX' },
  { kind: 'missing' },
  { kind: 'unlinked' },
];

const STATES: ChapterLinkState[] = ['unlinked', 'linked', 'missing', 'several'];

/** Every string one surface says in a layout, with a name for the failure message. */
const SURFACES: Record<string, (layout: VoiceTracksLayout) => string[]> = {
  'linkStateLabel (the one label function)': (layout) => STATES.map((state) => linkStateLabel(state, layout === 'folders')),
  'destinationFor: titles, chips, footers, the Booth prompts': (layout) => {
    const d = destinationFor(layout);
    return [
      d.notLinkedTitle('Chapter 1'),
      d.severalTitle('Chapter 1'),
      d.missingTitle('Chapter 1'),
      d.notLinkedChip,
      d.severalChip,
      d.missingChip,
      d.linkButton,
      d.pickerLabel('Chapter 1'),
      d.recordWaits('Chapter 1'),
      d.recordWaitsMissing('Chapter 1'),
      d.recordWaitsSeveral('Chapter 1'),
      d.footerMissing('Chapter 1'),
      d.footerNoLink('Chapter 1'),
      d.linkedToast('Chapter 1'),
      d.chipNoTrack.words,
      d.chipNoTrack.sentence,
      d.chipMissing.words,
      d.chipMissing.sentence,
      d.chipSeveral.words,
      d.chipSeveral.sentence,
      d.editingUnlinked('Chapter 1', 'REAPER'),
    ];
  },
  'Production: Show in REAPER reasons (menu and panel)': (layout) => Object.values(LINKS).map((one) => noShowableTrackReason(one, layout)),
  'Production: the chapter track button names': (layout) => BUTTON_STATES.map((state) => chapterTrackButtonLabel('Chapter 6', state, layout)),
  'Production: the recording check status': (layout) =>
    CHECKS.flatMap((status) => Object.values(chapterCheckStatusText('Chapter 6', status, undefined, layout)).filter((v): v is string => !!v)),
  'Production board: the Rec. cell for each reason a length is unavailable': (layout) =>
    (['unlinked', 'multiple_tracks', 'track_missing'] as const).flatMap((recordedUnavailable) => {
      const [row] = buildPipelineRows([chapter('c1', { recordedUnavailable }), chapter('c2', { status: 'editing', recordedUnavailable: 'unlinked' })], {
        layout,
      });
      return [row!.recorded.text, row!.recorded.label, row!.recorded.tip];
    }),
  'Proof: why the check card has no recording to check': (layout) =>
    (['unlinked', 'multiple_tracks', 'track_missing', 'no_project'] as const).map((reason) => noRecordingWhy(reason, layout).text),
  'Pickups: why the original cannot be played': (layout) => Object.values(destinationFor(layout).noOriginal),
  'Engine: the pickers and the table header': (layout) => [destinationFor(layout).pickerLabel('Chapter 1'), destinationFor(layout).Noun],
  'Editing: the no-audio notice for an unlinked or missing chapter': (layout) =>
    [
      noAudioText({ kind: 'unlinked' }, 'Chapter 1', 'REAPER', layout),
      noAudioText({ kind: 'missing' }, 'Chapter 1', 'REAPER', layout),
      noAudioText({ kind: 'empty', unsaved: true, missing: true }, 'Chapter 1', 'REAPER', layout),
    ].flatMap((text) => [text.headline, text.next]),
};

/** What a string says once the words a folder legitimately holds are set aside. */
const withoutAllowed = (text: string): string => text.replace(ALLOWED, '');

describe('the link-state words of every surface, by layout', () => {
  for (const [surface, wordsFor] of Object.entries(SURFACES)) {
    it(`${surface}: a Voice folders project reads no flat track word`, () => {
      const said = wordsFor('folders').map(withoutAllowed);
      expect(said.filter((text) => /\btracks?\b/i.test(text))).toEqual([]);
    });
    it(`${surface}: a flat project reads no folder word`, () => {
      const said = wordsFor('flat');
      expect(said.filter((text) => /\bfolders?\b/i.test(text))).toEqual([]);
    });
    it(`${surface}: says something in both layouts`, () => {
      expect(wordsFor('flat').length).toBeGreaterThan(0);
      expect(wordsFor('folders').length).toBe(wordsFor('flat').length);
    });
  }

  it('the states it walks are the ones the panel and the menu tell apart', () => {
    expect(Object.keys(LINKS)).toEqual(['unlinked', 'suggested', 'candidates', 'several', 'missing']);
    expect(Object.entries(LINKS).map(([, one]) => chapterTrackButtonState(one).kind)).toEqual(['unlinked', 'suggested', 'ambiguous', 'ambiguous', 'missing']);
  });

  it('a missing link is named a folder, and several links several folders, in a Voice folders project', () => {
    expect(linkStateLabel('missing', true)).toBe('Folder missing');
    expect(linkStateLabel('several', true)).toBe('Several folders');
    expect(linkStateLabel('missing', false)).toBe('Track missing');
    expect(linkStateLabel('several', false)).toBe('Several tracks');
  });
});
