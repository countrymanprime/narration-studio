// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CHAPTER_OPEN_ANYWAY, CHAPTER_STOP_LABEL, stopRecordingSpec } from './stopRecordingSpec';

// #3555 / #3550: the words of the question a narrator reads when leaving the Booth during a take.
describe('stopRecordingSpec', () => {
  it('says the take is saved when it stops a take that records', () => {
    expect(stopRecordingSpec('REAPER', true, false, 'Script').body).toBe('REAPER is recording. Leaving the Booth for Script stops it and saves the take.');
    expect(stopRecordingSpec('REAPER', true).body).toBe('REAPER is recording. Leaving the Booth stops it and saves the take.');
  });

  it("claims no save when the end is not known: the quiet DAW's question only says it tries", () => {
    expect(stopRecordingSpec('REAPER', true, false, 'Script', true).body).toBe('REAPER may still be recording. Leaving tries to stop the take.');
  });

  it('names no page when the move does not know its page (Back, Forward)', () => {
    expect(stopRecordingSpec('REAPER', true, false, undefined).title).toBe('Stop recording?');
    expect(stopRecordingSpec('REAPER', true, false, undefined, true).title).toBe('Leave the Booth?');
  });

  it('a chapter question opens a chapter: its stop says so, and staying hands focus back to the picker', () => {
    for (const unconfirmed of [false, true]) {
      const spec = stopRecordingSpec('REAPER', true, false, 'Booth', unconfirmed);
      expect(spec.confirmLabel).toBe(CHAPTER_STOP_LABEL);
      expect(CHAPTER_STOP_LABEL).toBe('Stop and open');
      expect(CHAPTER_OPEN_ANYWAY).toBe('Open anyway');
      const picker = document.createElement('button');
      picker.setAttribute('data-chapter-picker', '');
      document.body.append(picker);
      expect(spec.returnFocus?.()).toBe(picker);
      picker.remove();
    }
  });

  it('every other exit keeps Stop and leave and has no focus to hand back', () => {
    for (const unconfirmed of [false, true]) {
      const spec = stopRecordingSpec('REAPER', true, false, 'Script', unconfirmed);
      expect(spec.confirmLabel).toBe('Stop and leave');
      expect(spec.returnFocus).toBeUndefined();
    }
  });
});
