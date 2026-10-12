// The Delivery page's "Before you build" rows: one per chapter, judged by the host's per-file results (MeasureFileResult, ADR 0170, never
// recomputed against retyped numbers). A chapter's file is the measured file whose name carries its title or its number ("Chapter 04.wav");
// a chapter with no file, or a file the host did not judge, is "Not mastered". A row names its chapter with `chapterName` (ADR 0191), so it
// reads in the manuscript's own heading style ("CHAPTER IV. — The Rabbit Sends in a Little Bill"), as Script's list does.
import { chapterName } from '../../../chapterName';
import type { ManuscriptChapter, MeasureFileResult } from '../../../types';
import { fileOf } from '../../master/chapterFile';
import { fileVerdict } from '../../master/fileVerdict';

export type ChapterState = { id: string; name: string; kind: 'ok' | 'bad' | 'wait'; text: string };

export function chapterStates(chapters: readonly ManuscriptChapter[], files: readonly MeasureFileResult[]): ChapterState[] {
  return chapters.map((chapter) => {
    const base = { id: chapter.id, name: chapterName(chapter) };
    const file = fileOf(chapter, files);
    const verdict = file ? fileVerdict(file) : 'none';
    if (!file || verdict === 'none') return { ...base, kind: 'wait', text: 'Not mastered' };
    if (verdict === 'pass') return { ...base, kind: 'ok', text: 'Pass' };
    const failing = file.rules.filter((rule) => rule.status === 'not_met').length;
    return { ...base, kind: 'bad', text: `Fails ${failing} ${failing === 1 ? 'check' : 'checks'}` };
  });
}

/** What the build button says it is waiting on: "2 failing, 1 not ready", or that every chapter passes. */
export function readiness(states: readonly ChapterState[]): { ready: boolean; text: string } {
  const bad = states.filter((state) => state.kind === 'bad').length;
  const wait = states.filter((state) => state.kind === 'wait').length;
  return bad + wait === 0 && states.length > 0 ? { ready: true, text: 'Every chapter passes.' } : { ready: false, text: `${bad} failing, ${wait} not ready` };
}
