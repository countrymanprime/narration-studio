import { describe, expect, it } from 'vitest';
import { WPH } from '../../schedule/estimates';
import { buildPipelineRows, cellName, currentColumn, NOT_MEASURED, NOT_STARTED_PREP, UNDER_WAY } from './pipelineRows';
import { chapter, MID_BOOK, MID_BOOK_SOURCES } from './pipelineFixtures';

const rowsOf = (...args: Parameters<typeof buildPipelineRows>) => buildPipelineRows(...args);

describe('one-row-per-chapter-with-stage-cells', () => {
  it('makes a row for every chapter, in order', () => {
    expect(rowsOf(MID_BOOK).map((r) => r.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
  });

  it('draws a tick for a stage that is done, a dash for one not started', () => {
    const [done, , , , fresh] = rowsOf(MID_BOOK, MID_BOOK_SOURCES);
    expect(done!.cells.record).toMatchObject({ kind: 'done', text: '✓' });
    expect(done!.cells.edit).toMatchObject({ kind: 'done', text: '✓' });
    expect(done!.cells.proof).toMatchObject({ kind: 'done', text: '✓' });
    expect(fresh!.cells.record).toMatchObject({ kind: 'none', text: '—' });
  });

  it('draws a record percent only from a measured length against the finished length', () => {
    const [recorded] = rowsOf([chapter('c1', { status: 'recording', wordCount: WPH, recordedSeconds: 1800 })]);
    expect(recorded!.cells.record).toMatchObject({ kind: 'progress', text: '50%' });
    const [unmeasured] = rowsOf([chapter('c1', { status: 'recording', recordedSeconds: null })]);
    expect(unmeasured!.cells.record.text).not.toMatch(/%/);
    expect(unmeasured!.cells.record.state).toBe('in progress');
  });

  it('never fills Edit with a percent: it has no measured fraction', () => {
    const [editing] = rowsOf([chapter('c1', { status: 'editing' })]);
    expect(editing!.cells.edit).toMatchObject({ kind: 'progress', state: 'in progress' });
    expect(editing!.cells.edit.text).not.toMatch(/%/);
  });

  it('reads a cell with no chapter-level source as not measured yet', () => {
    const [row] = rowsOf([chapter('c1', { status: 'finalized' })]);
    for (const column of ['prep', 'master', 'qc'] as const) {
      expect(row!.cells[column]).toMatchObject({ text: '—', tip: NOT_MEASURED });
    }
  });
});

describe('prep-cell-reads-the-prep-record', () => {
  it('draws prepped as a tick, in progress as a half disc and not started as an empty circle, never a dash (the mock)', () => {
    const rows = rowsOf([chapter('a'), chapter('b'), chapter('c')], { prep: { a: 'prepped', b: 'progress', c: 'none' } });
    expect(rows[0]!.cells.prep).toMatchObject({ kind: 'done', text: '✓', tip: 'Prepped' });
    expect(rows[1]!.cells.prep).toMatchObject({ kind: 'progress', text: UNDER_WAY, tip: 'Prep in progress' });
    expect(rows[2]!.cells.prep).toMatchObject({ kind: 'none', text: NOT_STARTED_PREP, state: 'not started', tip: 'Prep not started' });
  });
});

describe('cells-go-to-their-stage-and-chapter', () => {
  it('names the page each cell goes to', () => {
    const [row] = rowsOf(MID_BOOK);
    expect(Object.fromEntries(Object.entries(row!.cells).map(([column, c]) => [column, c.target]))).toEqual({
      prep: 'script',
      record: 'booth',
      edit: 'editing',
      proof: 'proof',
      pickups: 'pickups',
      master: 'master',
      qc: 'master',
    });
  });

  it('names a cell "<chapter>: <stage> <state>"', () => {
    const [row] = rowsOf([chapter('c1', { status: 'editing' })]);
    expect(cellName(row!.name, row!.cells.edit)).toBe('Chapter 1: Edit in progress');
  });
});

describe('proof-cell-counts-cleared-notes', () => {
  it('reads "N of M notes cleared" as the tip and the name', () => {
    const [row] = rowsOf([chapter('c2', { status: 'proofing' })], { proof: { c2: { cleared: 6, total: 9 } } });
    expect(row!.cells.proof.tip).toBe('6 of 9 notes cleared');
    expect(cellName(row!.name, row!.cells.proof)).toBe('Chapter 2: Proof 66%, 6 of 9 notes cleared');
  });

  it('reads Proofed for a finalized chapter with no notes, Not started for another', () => {
    const [proofed] = rowsOf([chapter('c1', { status: 'finalized' })]);
    expect(proofed!.cells.proof.tip).toBe('Proofed');
    const [fresh] = rowsOf([chapter('c1', { status: 'proofing' })]);
    expect(fresh!.cells.proof.tip).toBe('Not started');
  });
});

describe('proof-master-and-qc-cells-read-the-chapters-data', () => {
  it("derives the proof, master and QC cells from the chapter's data", () => {
    const chapters = [
      chapter('c1', { status: 'proofing' }),
      chapter('c2', { status: 'finalized' }),
      chapter('c3', { status: 'finalized' }),
      chapter('c4', { status: 'finalized' }),
    ];
    const rows = rowsOf(chapters, {
      proof: { c1: { cleared: 5, total: 10 } },
      master: { c2: { mastered: true, qc: 'PASS' }, c3: { mastered: true, qc: 'FAIL' }, c4: { mastered: false, qc: null } },
    });
    const [c1, c2, c3, c4] = rows;
    expect(c1!.cells.proof).toMatchObject({ kind: 'progress', text: '50%', tip: '5 of 10 notes cleared' });
    expect(c1!.cells.master.state).toBe('not measured yet');
    expect(c1!.cells.qc.tip).toBe(NOT_MEASURED);
    expect(c2!.cells.master).toMatchObject({ kind: 'done', tip: 'Mastered' });
    expect(c2!.cells.qc).toMatchObject({ kind: 'done', text: 'PASS' });
    expect(c3!.cells.qc).toMatchObject({ kind: 'open', text: 'FAIL', state: 'fails: FAIL' });
    expect(c4!.cells.master).toMatchObject({ kind: 'none', tip: 'Not mastered' });
    expect(c4!.cells.qc).toMatchObject({ kind: 'none', tip: 'Not checked' });
  });
});

describe('pickups-cell-waits-for-a-full-recording', () => {
  it('is a dash that goes nowhere until the chapter is recorded to the end', () => {
    const [row] = rowsOf([chapter('c1', { status: 'recording' })], { pickups: { c1: 3 } });
    expect(row!.cells.pickups).toMatchObject({ text: '—', go: false });
  });

  it('then shows the open count, and a done 0 for none (the mock)', () => {
    const rows = rowsOf([chapter('c1', { status: 'editing' }), chapter('c2', { status: 'editing' })], { pickups: { c1: 3, c2: 0 } });
    expect(rows[0]!.cells.pickups).toMatchObject({ kind: 'open', text: '3', tip: '3 open pickups' });
    expect(rows[1]!.cells.pickups).toMatchObject({ kind: 'done', text: '0', tip: 'No open pickups' });
  });

  it('says the count is project-wide when no per-chapter source answers', () => {
    const [row] = rowsOf([chapter('c1', { status: 'editing' })]);
    expect(row!.cells.pickups).toMatchObject({ text: '—', tip: 'Pickups are counted for the whole project' });
  });
});

describe('record-cell-shows-status-without-a-click', () => {
  it('carries the check freshness in the tip', () => {
    const [row] = rowsOf([chapter('c4', { status: 'recording' })], { checks: { c4: { kind: 'stale', reason: 'item_added', changedAt: null } } });
    expect(row!.cells.record.tip).toContain('Recording check: Out of date');
  });

  it.each([
    [{ kind: 'checking', percent: 40 } as const, 'Checking 40%'],
    [{ kind: 'never', changedAt: null } as const, 'Never checked'],
    [{ kind: 'needs_track', count: 2 } as const, 'Needs a track'],
  ])('says %j', (check, text) => {
    const [row] = rowsOf([chapter('c4', { status: 'recording' })], { checks: { c4: check } });
    expect(row!.cells.record.tip).toContain(text);
  });
});

describe('currentColumn', () => {
  it('puts the chip on the stage the chapter is in', () => {
    expect(['not_started', 'recording', 'editing', 'proofing', 'finalized'].map((s) => currentColumn(s as never))).toEqual([
      'prep',
      'record',
      'edit',
      'proof',
      'qc',
    ]);
  });

  it('moves to Pickups while a proofing chapter has open pickups', () => {
    expect(currentColumn('proofing', 2)).toBe('pickups');
  });
});

describe('each-row-shows-what-is-recorded-next-to-the-estimate', () => {
  // The owner's book: 16 chapters linked to their tracks, audio on every one (17 h in the headline), every status still "not started".
  // The rows showed only the estimate, and the Record cell a dash, so nothing on the row said anything was recorded.
  const linked = Array.from({ length: 16 }, (_, i) => chapter(`c${i + 1}`, { recordedSeconds: 3825 }));

  it('shows the recorded length of every linked chapter, never a blank, whatever its status', () => {
    const rows = rowsOf(linked);
    expect(rows).toHaveLength(16);
    for (const row of rows) {
      expect(row.recorded).toMatchObject({ kind: 'measured', text: '1:04' });
      expect(row.recorded.label).toBe(`${row.name}: 1:04 recorded of about 1:00 estimated`);
      expect(row.estimate).toBe('1:00');
      // The audio is there, so Record is under way even though the chapter's stage still says not started.
      expect(row.cells.record).toMatchObject({ kind: 'progress', text: '99%' });
      expect(row.cells.record.tip).toContain('stage is still Not started');
    }
  });

  it('tells linked with nothing recorded from not linked, no readable project, two tracks, a missing track and not read', () => {
    const rows = rowsOf([
      chapter('a', { recordedSeconds: 0 }),
      chapter('b', { recordedUnavailable: 'unlinked' }),
      chapter('c', { recordedUnavailable: 'no_project' }),
      chapter('d', { recordedUnavailable: 'multiple_tracks' }),
      chapter('e', { recordedUnavailable: 'track_missing' }),
      chapter('f'),
    ]);
    expect(rows.map((r) => [r.recorded.kind, r.recorded.text])).toEqual([
      ['none', 'None yet'],
      ['none', 'Not linked'],
      ['none', 'No project'],
      ['none', '2+ tracks'],
      ['none', 'Track gone'],
      ['none', 'Not read'],
    ]);
    for (const row of rows) expect(row.recorded.text).not.toMatch(/^0:00$/);
    expect(rows[0]!.cells.record).toMatchObject({ kind: 'none', state: 'not started' });
  });

  it('says in its tip and name how far the chapter is recorded (#2251): through which paragraph, to the end, or about for the track’s length', () => {
    const through = { paragraphId: 'p-12', paragraph: 12, word: 3, percent: 38, complete: false, source: 'booth', confident: true } as const;
    const [part, whole, about, unnumbered, unlinked] = rowsOf([
      chapter('c1', { recordedSeconds: 1500, recordedThrough: through }),
      chapter('c2', { recordedSeconds: 3600, recordedThrough: { ...through, paragraph: 40, percent: 100, complete: true, source: 'proof' } }),
      chapter('c3', { recordedSeconds: 1080, recordedThrough: { ...through, percent: 30, source: 'daw', confident: false } }),
      chapter('c4', { recordedSeconds: 1500, recordedThrough: { ...through, paragraph: undefined } }),
      chapter('c5', { recordedUnavailable: 'unlinked', recordedThrough: through }),
    ]);
    expect(part!.recorded.label).toBe('Chapter 1: 0:25 recorded of about 1:00 estimated, recorded through paragraph 12 (38%)');
    expect(part!.recorded.tip).toBe(
      '0:25 recorded of about 1:00 estimated · on the linked track in the saved project, before editing · Recorded through ¶ 12 (38%)',
    );
    expect(whole!.recorded.tip).toContain(' · Recorded to the end');
    expect(whole!.recorded.label).toBe('Chapter 2: 1:00 recorded of about 1:00 estimated, recorded to the end');
    expect(about!.recorded.label).toContain('recorded through about paragraph 12 (~30%)');
    expect(about!.recorded.tip).toContain('Recorded through about ¶ 12 (~30%, from the track’s length)');
    // A host without the paragraph number says the share alone, never a made-up ¶.
    expect(unnumbered!.recorded.label).toMatch(/, recorded through 38%$/);
    // Proof and the Booth's takes say how far a chapter is recorded even when no track is linked to measure.
    expect(unlinked!.recorded).toMatchObject({ kind: 'none', text: 'Not linked' });
    expect(unlinked!.recorded.label).toBe('Chapter 5: recorded not linked, recorded through paragraph 12 (38%)');
  });

  it('draws the Record percent from how far the chapter is recorded, so the board and the Booth agree', () => {
    const through = { paragraphId: 'p-12', paragraph: 12, word: 3, percent: 38, complete: false, source: 'booth', confident: true } as const;
    const [part, whole, none] = rowsOf([
      chapter('c1', { status: 'recording', recordedSeconds: 2700, recordedThrough: through }),
      chapter('c2', { status: 'recording', recordedSeconds: 3600, recordedThrough: { ...through, percent: 100, complete: true } }),
      chapter('c3', { status: 'recording', recordedSeconds: 1800 }),
    ]);
    expect(part!.cells.record).toMatchObject({ kind: 'progress', text: '38%', state: '38% recorded' });
    expect(part!.cells.record.tip).toContain('Recorded through ¶ 12 (38%)');
    expect(whole!.cells.record).toMatchObject({ kind: 'progress', text: '100%', state: '100% recorded' });
    expect(whole!.cells.record.tip).toContain('Recorded to the end');
    expect(none!.cells.record).toMatchObject({ kind: 'progress', text: '50%' });
  });

  it('never shows under a minute of audio as 0:00, and shows a dash for a chapter with no words to estimate from', () => {
    const [short] = rowsOf([chapter('c1', { recordedSeconds: 20, wordCount: 0 })]);
    expect(short!.recorded.text).toBe('<0:01');
    expect(short!.estimate).toBe('—');
    expect(short!.recorded.label).toBe('Chapter 1: <0:01 recorded, no estimate');
  });
});
