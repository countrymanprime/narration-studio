import { describe, expect, it } from 'vitest';
import { noAudioText } from './noAudioText';

describe('noAudioText', () => {
  it('a plain track with nothing on it says the track is empty', () => {
    expect(noAudioText({ kind: 'empty' }, 'Chapter 1', 'REAPER').headline).toBe('Chapter 1’s track has no audio on it, so there is nothing to edit.');
  });
  it('a folder of voices with nothing on any voice says so, and where to record', () => {
    const text = noAudioText({ kind: 'empty', folder: true }, 'Chapter 1', 'REAPER');
    expect(text.headline).toBe('Chapter 1’s folder has no audio on any of its voice tracks, so there is nothing to edit.');
    expect(text.next).toBe('Record the chapter onto a voice track inside that folder in REAPER, then save the project.');
  });
  it('the built-in recorder has no folder to name', () => {
    expect(noAudioText({ kind: 'empty', folder: true }, 'Chapter 1', null).headline).toBe(
      'Nothing is recorded for Chapter 1 yet, so there is no audio to edit.',
    );
  });
  it('unsaved changes in the DAW say to save, not to record, in a headline short enough for Play’s hint', () => {
    const text = noAudioText({ kind: 'empty', folder: true, unsaved: true }, 'Chapter 1', 'REAPER');
    expect(text.headline).toBe('Chapter 1 has no saved audio, and REAPER has unsaved changes.');
    expect(text.headline.length).toBeLessThanOrEqual(80);
    expect(text.next).toBe('A recording may be waiting there. Save the project in REAPER, then read again.');
  });
  it('a link to a track the saved project lacks says the track is not in it, not that a recording is waiting', () => {
    const text = noAudioText({ kind: 'empty', unsaved: true, missing: true }, 'Chapter 1', 'REAPER');
    expect(text.headline).toBe('Chapter 1’s track is not in the saved project, and REAPER has unsaved changes.');
    expect(text.headline.length).toBeLessThanOrEqual(80);
    expect(text.next).toBe('It may have been added since the last save. Save the project in REAPER, then read again.');
  });
  it('a DAW that could not say whether it has unsaved changes is asked to be saved, never told to record again', () => {
    const text = noAudioText({ kind: 'empty', unsaved: 'unknown' }, 'Chapter 1', 'REAPER');
    expect(text.headline).toBe('Chapter 1 has no saved audio, and REAPER did not say if it has unsaved changes.');
    expect(text.next).toBe('Save the project in REAPER, then read again.');
  });
});
