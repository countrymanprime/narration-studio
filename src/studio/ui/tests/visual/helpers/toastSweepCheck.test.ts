import { describe, expect, it } from 'vitest';
import { bareNames, problems } from './toastSweepCheck';

// The sweep's own judgement (toast-rtl-sweep.spec.ts): what it calls wrong must be wrong, and what the builders write must pass. Arabic written as escapes.
const NAME = '\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644 \u0627\u0644\u0637\u0648\u064A\u0644 \u062C\u062F\u0627';
const OTHER = '\u0628\u0631\u0643\u0629 \u0627\u0644\u062F\u0645\u0648\u0639 \u0627\u0644\u0643\u0628\u064A\u0631\u0629';
const FSI = '\u2068';
const LRI = '\u2066';
const PDI = '\u2069';

describe('bareNames', () => {
  it('finds a name written outside an isolate', () => {
    expect(bareNames(`${NAME} restored.`, [NAME])).toEqual([NAME]);
    expect(bareNames(`Chapter ${NAME}: 3 takes.`, [NAME])).toEqual([NAME]);
  });

  it('lets a name stand inside a first-strong or a left-to-right isolate', () => {
    expect(bareNames(`${FSI}${NAME}${PDI} restored.`, [NAME])).toEqual([]);
    expect(bareNames(`The old copy stays in ${LRI}C:\\${NAME}${PDI}.`, [NAME])).toEqual([]);
  });

  it('judges each occurrence: one isolated and one bare is one bare', () => {
    expect(bareNames(`${FSI}${NAME}${PDI} and ${NAME}`, [NAME])).toEqual([NAME]);
  });

  it('judges each name it is given, and an English sentence holds none', () => {
    expect(bareNames(`${FSI}${NAME}${PDI} and ${OTHER}`, [NAME, OTHER])).toEqual([OTHER]);
    expect(bareNames('Chapter 4 moved to Editing.', [NAME, OTHER])).toEqual([]);
  });

  it('counts an isolate that was closed as closed', () => {
    expect(bareNames(`${FSI}x${PDI} ${NAME}`, [NAME])).toEqual([NAME]);
  });
});

describe('problems', () => {
  it('passes an English sentence that isolates its name and is drawn left to right', () => {
    expect(problems([{ text: `${FSI}${NAME}${PDI} restored.`, direction: 'ltr' }], [NAME])).toEqual([]);
  });

  it('fails a toast drawn right to left while its own words are English', () => {
    expect(problems([{ text: `${FSI}${NAME}${PDI} restored.`, direction: 'rtl' }], [NAME])).toHaveLength(1);
  });

  it('lets a message that is mostly right to left be drawn right to left', () => {
    const text =
      '\u062A\u0639\u0630\u0631 \u0639\u0644\u0649 REAPER \u062D\u0641\u0638 \u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644 \u062C\u062F\u0627.';
    expect(problems([{ text, direction: 'rtl' }], [])).toEqual([]);
  });

  it('fails a name outside an isolate, even in a sentence drawn left to right', () => {
    const found = problems([{ text: `${NAME} restored.`, direction: 'ltr' }], [NAME]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('outside an isolate');
  });

  it('reports a toast once for each way it is wrong', () => {
    const text = `The chapter was removed from the recording and the old copy stays in the project folder: ${NAME}.`;
    expect(problems([{ text, direction: 'rtl' }], [NAME])).toHaveLength(2);
  });
});
