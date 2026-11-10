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
  it('counts the voices of a folder, one and many', () => {
    const folder = [track('f', 'Ch 1', 0, true), track('n', 'Narrator', 1)];
    expect(recheckSentence('Chapter 1', 'Ch 1', folder, 'f')).toContain('(1 voice). Nothing changed.');
    expect(recheckSentence('Chapter 1', 'Ch 1', [...folder, track('w', 'White Rabbit', 1)], 'f')).toContain('(2 voices)');
  });
  it('says the track was renamed', () => {
    expect(recheckSentence('Chapter 1', 'Old', [track('a', 'New ‮evil')], 'a')).toBe(
      "Updated: Chapter 1's track was “Old” and is now “New ‮evil” (a single track).",
    );
  });
  it('says a track the project no longer has is gone', () => {
    expect(recheckSentence('Chapter 1', 'Old', [track('b', 'Other')], 'a')).toContain('no longer in the project');
  });
});
