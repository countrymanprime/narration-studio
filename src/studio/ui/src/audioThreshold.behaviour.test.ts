import { describe, expect, it } from 'vitest';
import type { ManuscriptChapter } from './api/contracts/manuscript';
import type { ProductionChapter } from './api/contracts/production';
import { recordedStart } from './components/booth/companion/companionResume';
import { hasRecording, recordedLabel } from './components/proof/checkcard/cardSelectors';
import { bookFigures } from './components/production/overview/overviewFigures';
import { rankNextUp } from './components/production/pipeline/nextUpRanking';
import { buildPipelineRows } from './components/production/pipeline/pipelineRows';
import { chapterLengthsOf } from './recordedThrough';
import { ownRate } from './components/production/target/pace.selectors';
import { audioToCheck, recordedChapters } from './components/recordingcheck/checkSelection';
import { MIN_OWN_RATE_CHAPTERS } from './components/schedule/estimates';
import {
  chapterRecordedDetail,
  recordedAtDetail,
  recordedAtOf,
  recordedAudioHours,
  recordedPercent,
  recordedShare,
  recordedThroughLabel,
} from './recordedThrough';

// #3869: audio under one second is no audio on ANY page. `audioThreshold.test.ts` scans sources by name; this is the behavioural twin: every figure of a chapter with under a second of
// audio equals the same figure at 0 s, across the pipeline row (Rec. figure, Record cell, tips, names), the book totals and the plan hours, the narrator's own rate, Next up, the
// Booth chip and lists, the Companion's notice, Editing and Proof and the recording check. The Chapter track panel and the Companion's "This chapter" print the clock of the length
// (0:00 either way) and are not compared; a negative length reads "None yet" and host 50% with under a second reads 50% beside "None yet", as at 0 s.
const PARAGRAPHS = [
  { id: 'p1', text: 'one two three four five six seven eight nine ten' },
  { id: 'p2', text: 'alpha beta gamma delta' },
];
const through = (percent: number, complete = false, confident = true) =>
  ({ paragraphId: 'p1', paragraph: 1, word: 2, percent, complete, source: confident ? 'booth' : 'daw', confident }) as const;
const HOSTS = [
  undefined,
  through(0),
  through(1),
  through(50),
  through(99),
  through(100),
  through(100, true),
  through(0, false, false),
  through(100, true, false),
];
const STAGES = ['not_started', 'recording', 'editing', 'proofing', 'finalized'] as const;
const SUB = [0.001, 0.5, 0.99, 0.999999];
const WPH = 9000;

function figures(status: (typeof STAGES)[number], host: ReturnType<typeof through> | undefined, seconds: number, words: number, layout: 'flat' | 'folders') {
  const production = {
    id: 'c',
    title: 'Chapter 4',
    contentKind: 'narration',
    status,
    wordCount: words,
    recordedSeconds: seconds,
    recordedThrough: host,
    hoursLogged: 0,
    pfh: null,
    readiness: null,
  } as unknown as ProductionChapter;
  const manuscript = {
    id: 'c',
    title: 'Chapter 4',
    index: 1,
    status,
    wordCount: words,
    recordedSeconds: seconds,
    recordedThrough: host,
  } as unknown as ManuscriptChapter;
  const row = buildPipelineRows([production], { layout })[0]!;
  const at = recordedAtOf(manuscript);
  const percent = recordedPercent(production, WPH);
  const share = recordedShare(production, WPH);
  const next = rankNextUp({ recording: { chapterId: 'c', stage: status, name: 'n', words, share, percent }, pickups: null, failing: null });
  const start = recordedStart({ chapter: manuscript, paragraphs: PARAGRAPHS, spans: undefined, recorded: at } as never);
  return {
    row: { cells: row.cells, recorded: row.recorded, current: row.current },
    percent,
    share,
    next,
    book: bookFigures([production], WPH),
    planHours: recordedAudioHours([production]),
    chip: recordedThroughLabel(at, PARAGRAPHS),
    list: chapterRecordedDetail(manuscript),
    menu: recordedAtDetail(at),
    companion: start && { percent: start.percent },
    offered: [recordedChapters([manuscript]).length, recordedChapters([manuscript], ['c']).length],
    proof: [hasRecording(seconds), recordedLabel(seconds)],
    toCheck: audioToCheck([manuscript], new Set(['c'])),
  };
}

describe('every figure of a chapter under a second equals its figure at 0 s', () => {
  for (const layout of ['flat', 'folders'] as const) {
    for (const status of STAGES) {
      it(`${layout}, ${status}: all hosts, words 9000, 0 and 3`, () => {
        for (const host of HOSTS) {
          for (const words of [9000, 0, 3]) {
            const zero = figures(status, host, 0, words, layout);
            for (const seconds of SUB) {
              const got = figures(status, host, seconds, words, layout);
              for (const key of Object.keys(zero) as Array<keyof typeof zero>) {
                expect(got[key], `${key}: host ${JSON.stringify(host)}, ${words} words, ${seconds} s`).toEqual(zero[key]);
              }
            }
          }
        }
      });
    }
  }

  it('the narrator’s own rate does not count a chapter under a second', () => {
    const chapters = [1, 2, 3].map((n) => ({ id: String(n), tag: `Chapter ${n}`, words: 2000 }));
    const ownFor = (third: number) => {
      const rows = [800, 800, third].map((recordedSeconds, index) => ({ id: String(index + 1), recordedSeconds }));
      return ownRate(chapters, chapterLengthsOf(rows), MIN_OWN_RATE_CHAPTERS);
    };
    const zero = ownFor(0);
    for (const seconds of SUB) expect(ownFor(seconds), `${seconds} s`).toEqual(zero);
  });

  // The other half of the rule: from one second there IS audio, so no figure reads none, for every host value (a host 0% included).
  it('from one second no figure reads none', () => {
    for (const layout of ['flat', 'folders'] as const) {
      for (const status of STAGES) {
        for (const host of HOSTS) {
          for (const seconds of [1, 12, 59.9]) {
            const got = figures(status, host, seconds, 9000, layout);
            const where = `${layout}, ${status}, host ${JSON.stringify(host)}, ${seconds} s`;
            expect(got.row.recorded.kind, where).toBe('measured');
            expect(got.share, where).toBeGreaterThan(0);
            expect(got.book.recordedHours, where).toBeGreaterThan(0);
            expect(got.planHours, where).toBeGreaterThan(0);
            expect(got.proof[0], where).toBe(true);
            expect(got.offered[0], where).toBe(1);
            if (got.percent !== null) expect(got.percent, where).toBeGreaterThanOrEqual(1);
            if (status === 'not_started' || status === 'recording') expect(got.next.length, where).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});
