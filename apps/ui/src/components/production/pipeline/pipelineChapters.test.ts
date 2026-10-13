import { describe, expect, it } from 'vitest';
import type { ProductionChapter } from '../../../api/contracts/production';
import type { CreditsEntry } from '../../credits/creditsEntries';
import { buildPipelineRows } from './pipelineRows';
import { pipelineChapters } from './pipelineChapters';

const chapter = (id: string, patch: Partial<ProductionChapter> = {}): ProductionChapter => ({
  id,
  title: id,
  contentKind: 'narration',
  status: 'not_started',
  wordCount: 100,
  recordedSeconds: null,
  hoursLogged: 0,
  pfh: null,
  readiness: null,
  ...patch,
});
const entry = (kind: 'opening' | 'closing', patch: Partial<CreditsEntry> = {}): CreditsEntry => ({
  kind,
  id: `credits-${kind}`,
  name: kind === 'opening' ? 'Opening credits' : 'Closing credits',
  prep: 'prepped',
  status: 'recording',
  words: 40,
  ...patch,
});

describe('pipelineChapters', () => {
  it('puts the opening credits first and the closing credits last', () => {
    const ids = pipelineChapters([chapter('c1'), chapter('c2')], { opening: entry('opening'), closing: entry('closing') }).map((c) => c.id);
    expect(ids).toEqual(['credits-opening', 'c1', 'c2', 'credits-closing']);
  });

  it("lists the manuscript's own opening-credits chapter in place of the opening entry, and leaves out what is not narration", () => {
    const own = chapter('own', { contentKind: 'opening' });
    const ids = pipelineChapters([own, chapter('c1'), chapter('ref', { contentKind: 'reference' })], { closing: entry('closing') }).map((c) => c.id);
    expect(ids).toEqual(['own', 'c1', 'credits-closing']);
  });

  it('draws a credits row through the one pipeline format with its own stage, length and Prepped dot', () => {
    const [row] = buildPipelineRows(pipelineChapters([], { opening: entry('opening', { status: 'editing', recordedSeconds: 31 }) }), {
      prep: { 'credits-opening': 'prepped' },
    });
    expect(row.name).toBe('Opening credits');
    expect(row.cells.prep.kind).toBe('done');
    expect(row.cells.record.kind).toBe('done');
    expect(row.cells.edit.kind).toBe('progress');
    expect(row.cells.master.state).toBe('not measured yet');
  });
});
