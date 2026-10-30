import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Finding } from '../../api/contracts/findings';
import { createJournal } from '../journal/createJournal';
import { reviewFinding, type ReviewPort } from './reviewFinding';

const finding = (status: string, note = '', version = 'v1') => ({ id: 'f1', evidence_version: version, review: { status, note } }) as unknown as Finding;

function setup(refuse = false) {
  let stored = finding('unreviewed');
  const calls: unknown[] = [];
  const port: ReviewPort = {
    findingsReview: async (request) => {
      calls.push(request);
      if (refuse) throw new Error('the evidence changed');
      stored = finding(request.status ?? 'unreviewed', request.note, `v${calls.length + 1}`);
      return stored;
    },
  };
  const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
  return { port, journal, calls, before: finding('unreviewed', 'earlier') };
}

describe('review-finding-is-one-journal-entry', () => {
  it('records one entry touching the finding, and Undo restores the earlier status and note against the new evidence version', async () => {
    const s = setup();
    const done = await reviewFinding(
      s.journal,
      s.port,
      s.before,
      { id: 'f1', evidenceVersion: 'v1', status: 'dismissed', note: '' },
      { label: 'Fine', touches: ['pickups'] },
    );
    expect(done.ok).toBe(true);
    const [row] = await s.journal.entries();
    expect(row).toMatchObject({ label: 'Fine', touches: ['proof/finding/f1', 'pickups'], undoable: true });
    expect((await s.journal.undo(row!.id)).ok).toBe(true);
    expect(s.calls[1]).toEqual({ id: 'f1', evidenceVersion: 'v2', status: 'unreviewed', note: 'earlier' });
  });

  it('a refusal journals nothing and carries the host sentence', async () => {
    const s = setup(true);
    const seen: unknown[] = [];
    const done = await reviewFinding(
      s.journal,
      s.port,
      s.before,
      { id: 'f1', evidenceVersion: 'v1', status: 'accepted', note: '' },
      { label: 'Pickup', onFailure: (e) => seen.push(e) },
    );
    expect(done.ok).toBe(false);
    expect(!done.ok && done.refusal.reason).toContain('the evidence changed');
    expect(seen).toHaveLength(1);
    expect(await s.journal.entries()).toEqual([]);
  });
});

/** Writers that still call the host directly, each owed its own journal entry (audit cluster 17); the list only shrinks. */
const UNJOURNALLED = [
  'components/booth/suspected/SuspectedLines.tsx',
  'components/booth/suspected/useSuspectedPickups.ts',
  'components/editing/flags/decideLinked.ts',
  'components/proof/checkcard/CheckCard.tsx',
];

/** The Inspector's own port call (the journalled api is injected into it) and Proof's no-op decision, which is no decision. */
const PASS_THROUGH = ['components/proof/ProofPage.tsx', 'components/proof/inspector/useShownEvidence.ts'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name) ? [path] : [];
  });
}

describe('no-page-decides-a-finding-outside-the-command', () => {
  it('only the command, the Inspector pass-through and the unjournalled list call findingsReview', () => {
    const root = join(__dirname, '../..');
    const calling = sources(join(root, 'components'))
      .filter((path) => /\.findingsReview\(/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(root.length + 1).replaceAll('\\', '/'))
      .sort();
    expect(calling.filter((path) => ![...PASS_THROUGH, ...UNJOURNALLED].includes(path))).toEqual([]);
  });
});
