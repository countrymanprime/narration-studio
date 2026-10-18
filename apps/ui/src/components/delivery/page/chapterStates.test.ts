import { describe, expect, it } from 'vitest';
import type { MeasureFileResult } from '../../../types';
import { failingTwo, passing, profile, waiting } from '../../masterqc/files/testFiles';
import { firstFailure, firstNotReady } from './chapterStates';

const chapters = [1, 2, 3, 4].map((n) => ({ id: `c${n}`, title: `Chapter 0${n}`, index: n - 1 }));
const all = [passing('Chapter 01.wav'), passing('Chapter 02.wav'), passing('Chapter 03.wav'), passing('Chapter 04.wav')];
const withFile = (index: number, file: MeasureFileResult) => all.map((each, at) => (at === index ? file : each));

describe('firstNotReady', () => {
  it('names nothing when every chapter has a verdict, a failing one included', () => {
    expect(firstNotReady(chapters, all)).toBeUndefined();
    expect(firstNotReady(chapters, withFile(3, failingTwo('Chapter 04.wav')))).toBeUndefined();
  });

  it('names the first chapter with no file at all', () => {
    expect(firstNotReady(chapters, all.slice(0, 2))).toBe('Chapter 03: no measured file yet.');
    expect(firstNotReady(chapters, all.slice(2))).toBe('Chapter 01: no measured file yet.');
  });

  it('names nothing on a book nobody has measured, where the count beside Build already says so', () => {
    expect(firstNotReady(chapters, [])).toBeUndefined();
  });

  it('says why a chapter whose file is there is not ready: not measured yet, unreadable, partly unmeasurable, or nothing judged', () => {
    expect(firstNotReady(chapters, withFile(1, { ...passing('Chapter 02.wav'), status: 'pending', rules: [] }))).toBe(
      'Chapter 02: its file is not measured yet.',
    );
    expect(firstNotReady(chapters, withFile(1, { ...passing('Chapter 02.wav'), status: 'failed', rules: [] }))).toBe('Chapter 02: its file could not be read.');
    expect(firstNotReady(chapters, withFile(2, waiting('Chapter 03.wav')))).toBe('Chapter 03: its file is not measured yet.');
    const unjudged = { ...passing('Chapter 03.wav'), rules: passing('Chapter 03.wav').rules.map((rule) => ({ ...rule, status: 'not_checked' as const })) };
    expect(firstNotReady(chapters, withFile(2, unjudged))).toBe('Chapter 03: the app judged nothing about its file.');
    const silent = {
      ...passing('Chapter 03.wav'),
      rules: passing('Chapter 03.wav').rules.map((rule, at) => (at === 0 ? { ...rule, status: 'not_measurable' as const, value: null } : rule)),
    };
    expect(firstNotReady(chapters, withFile(2, silent))).toBe('Chapter 03: part of its file could not be measured.');
  });

  it('leaves a failing chapter to firstFailure, which names its rule, value and limit', () => {
    const files = withFile(3, failingTwo('Chapter 04.wav')).slice(0, 4);
    expect(firstFailure(chapters, files, profile)).toMatch(/^Chapter 04: noise floor/);
  });
});
