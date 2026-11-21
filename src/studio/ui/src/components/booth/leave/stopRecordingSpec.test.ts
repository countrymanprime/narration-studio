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

  it('a take REAPER started: leaving says to stop it in REAPER; another chapter is not leaving the Booth (A1)', () => {
    expect(stopRecordingSpec('REAPER', false, false, 'Script')).toMatchObject({ title: 'Leave the Booth?', confirmLabel: 'Leave', cancelLabel: 'Stay' });
    const chapter = stopRecordingSpec('REAPER', false, false, 'Booth');
    expect(chapter).toMatchObject({ title: 'Open another chapter?', confirmLabel: 'Open', cancelLabel: 'Stay' });
    expect(chapter.body).toBe(
      'REAPER is recording and keeps recording after you open another chapter. The app did not start this take, so it will not stop it; stop it in REAPER.',
    );
  });

  it('a take REAPER started whose end is not confirmed is not said to be recording (QA A3)', () => {
    expect(stopRecordingSpec('REAPER', false, false, 'Script', true).body).toBe(
      'REAPER may still be recording, and keeps recording after you leave if it is. The app did not start this take, so it will not stop it; stop it in REAPER.',
    );
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

  it('a chapter question asked while a take is only starting says it opens, in its title too', () => {
    expect(stopRecordingSpec('REAPER', true, true, 'Booth').title).toBe('Open while a take is starting?');
    expect(stopRecordingSpec('REAPER', true, true, 'Script').title).toBe('Leave while a take is starting?');
  });

  it('with no picker on the page the focus to hand back is null, not an error: the dialog then falls to <main>', () => {
    document.querySelectorAll('[data-chapter-picker]').forEach((el) => el.remove());
    expect(() => stopRecordingSpec('REAPER', true, false, 'Booth').returnFocus?.()).not.toThrow();
    expect(stopRecordingSpec('REAPER', true, false, 'Booth').returnFocus?.()).toBeNull();
  });

  it('every other exit keeps Stop and leave and has no focus to hand back', () => {
    for (const unconfirmed of [false, true]) {
      const spec = stopRecordingSpec('REAPER', true, false, 'Script', unconfirmed);
      expect(spec.confirmLabel).toBe('Stop and leave');
      expect(spec.returnFocus).toBeUndefined();
    }
  });
});
