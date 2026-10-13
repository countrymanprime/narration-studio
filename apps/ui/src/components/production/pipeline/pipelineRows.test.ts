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
    expect(cellName(row!.name, row!.cells.proof)).toBe('Chapter 2: Proof 6 of 9 notes cleared');
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
