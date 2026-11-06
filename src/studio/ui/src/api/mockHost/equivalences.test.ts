// The mock TranscriptAddEquivalence answers as src/studio/desktop/internal/transcript/service.go does (#2736).
import { describe, expect, it } from 'vitest';
import { inspectorFinding } from '../../components/proof/inspector/testFinding';
import type { Finding } from '../../types';
import { createEquivalenceMock } from './equivalences';

const note = (expected: string, recorded: string): Finding => inspectorFinding({ id: 'n1', manuscript: { expected, recorded }, evidence: { kind: 'MISREAD' } });
const mockFor = (finding: Finding) =>
  createEquivalenceMock(async (id) => {
    if (id !== finding.id) throw new Error('This note is no longer in the project.');
    return finding;
  });
const REFUSAL = 'Only a note where one word was read as one other word can be treated as the same word in later checks.';

describe('the mock equivalence add', () => {
  it('adds a pair once, then says it is already there in either order or case', async () => {
    const mock = mockFor(note('Dinah', 'Dina'));
    await expect(mock.transcriptAddEquivalence('n1')).resolves.toBe('Added equivalence: Dinah = Dina');
    await expect(mock.transcriptAddEquivalence('n1')).resolves.toBe('Already treated as the same: Dinah = Dina');
  });

  it('refuses an id that names no note in the words the host uses', async () => {
    await expect(mockFor(note('Dinah', 'Dina')).transcriptAddEquivalence('gone')).rejects.toThrow(REFUSAL);
  });

  // qa B2 and B4 on #2807: the words the host refuses, refused here too, so the mock and the host never disagree.
  it.each([
    ['a comma', 'a,b', 'ab'],
    ['a #', 'ab', 'a#b'],
    ['a no-break space', 'x\u00a0y', 'xy'],
    ['a next-line control', 'x\u0085y', 'xy'],
    ['a byte-order mark', '\ufeffDinah', 'Dina'],
    ['the same word in another case', 'Dinah', 'dinah'],
  ])('refuses %s as the host does', async (_name, expected, recorded) => {
    await expect(mockFor(note(expected, recorded)).transcriptAddEquivalence('n1')).rejects.toThrow(REFUSAL);
  });
});
