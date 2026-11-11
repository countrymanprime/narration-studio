import { describe, expect, it } from 'vitest';
import { recheckSentence } from './ChapterLinksTable';
import type { Track } from '../../types';

const track = (guid: string, name: string, depth = 0, isFolder = false): Track =>
  ({ guid, index: 0, name, color: '', muted: false, soloed: false, depth, isFolder, items: [] }) as Track;

// What a Confirm on an unchanged link says it found (#3275).
describe('recheckSentence', () => {
  it('says nothing changed for a single track', () => {
    expect(recheckSentence('Chapter 1', 'Ch 1', [track('a', 'Ch 1')], 'a')).toBe('Chapter 1 is linked to “Ch 1” (a single track). Nothing changed.');
  });
  it('counts what a folder holds: voices in a Voice folders project, tracks in any other', () => {
    const folder = [track('f', 'Ch 1', 0, true), track('n', 'Narrator', 1)];
    expect(recheckSentence('Chapter 1', 'Ch 1', folder, 'f', true)).toContain('(a folder of 1 voice). Nothing changed.');
    expect(recheckSentence('Chapter 1', 'Ch 1', [...folder, track('w', 'White Rabbit', 1)], 'f', true)).toContain('(a folder of 2 voices)');
    expect(recheckSentence('Chapter 1', 'Ch 1', folder, 'f')).toContain('(a folder of 1 track). Nothing changed.');
  });
  it('says the track was renamed', () => {
    expect(recheckSentence('Chapter 1', 'Old', [track('a', 'New ‮evil')], 'a')).toBe(
      'The track for Chapter 1 was renamed from “Old” to “New ‮evil” (a single track).',
    );
  });
  it('only says Nothing changed when a read of REAPER answered', () => {
    const tracks = [track('a', 'Ch 1')];
    expect(recheckSentence('Chapter 1', 'Ch 1', tracks, 'a', false, 'live')).toBe('Chapter 1 is linked to “Ch 1” (a single track). Nothing changed.');
    expect(recheckSentence('Chapter 1', 'Ch 1', tracks, 'a', false, 'saved')).toBe(
      'Chapter 1 is linked to “Ch 1” (a single track), as the saved project has it.',
    );
    expect(recheckSentence('Chapter 1', 'Ch 1', tracks, 'a', false, 'held')).toBe('Chapter 1 is linked to “Ch 1” (a single track).');
  });
  it('names a blank track name as every page does and cuts a very long one', () => {
    // The one name every page gives a track with no name: "Track N" with its place in the project (the first track here is Track 1).
    expect(recheckSentence('Chapter 1', '', [track('a', '')], 'a')).toBe('Chapter 1 is linked to “Track 1” (a single track). Nothing changed.');
    const long = 'x'.repeat(10_000);
    const said = recheckSentence('Chapter 1', long, [track('a', long)], 'a');
    expect(said.length).toBeLessThan(200);
    expect(said).toContain('…');
  });
  it('says a track the project no longer has is gone', () => {
    expect(recheckSentence('Chapter 1', 'Old', [track('b', 'Other')], 'a')).toContain('no longer in the project');
  });
});
