// @vitest-environment node
// Audit cluster 12 (docs/research/ui-function-audit.md): who speaks a quoted line is one journalled command. Script, the Story Bible's cue list and the
// Booth all attribute through `attributeCue`: one "Confirmed a speaker" entry, reversed by Undo, and no screen calls the host's correction by itself.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createJournal } from '../journal/createJournal';
import { attributeCue, UNKNOWN_SPEAKER } from './attributeCue';

describe('attributeCue', () => {
  const journal = () => createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });

  it('is one journal entry that Undo reverses to the earlier speaker', async () => {
    const guideCorrectCue = vi.fn(async () => undefined);
    const j = journal();
    const done = await attributeCue(j, { guideCorrectCue } as never, { id: 'cue-1', speaker_entity_id: 'alice' }, 'hatter');
    expect(done.ok).toBe(true);
    expect(guideCorrectCue).toHaveBeenLastCalledWith('cue-1', 'hatter');
    expect((await j.entries()).map((entry) => entry.label)).toEqual(['Confirmed a speaker']);
    await j.undoLast();
    expect(guideCorrectCue).toHaveBeenLastCalledWith('cue-1', 'alice');
  });

  it('gives back "unknown" when the line had no speaker', async () => {
    const guideCorrectCue = vi.fn(async () => undefined);
    const j = journal();
    await attributeCue(j, { guideCorrectCue } as never, { id: 'cue-2', speaker_entity_id: null }, 'hatter');
    await j.undoLast();
    expect(guideCorrectCue).toHaveBeenLastCalledWith('cue-2', UNKNOWN_SPEAKER);
  });

  it('says the host sentence and journals nothing when the host refuses', async () => {
    const guideCorrectCue = vi.fn(async () => Promise.reject(new Error('That line is gone.')));
    const j = journal();
    const done = await attributeCue(j, { guideCorrectCue } as never, { id: 'cue-3' }, 'hatter');
    expect(done.ok).toBe(false);
    expect(!done.ok && done.refusal.reason).toContain('That line is gone.');
    expect(await j.entries()).toEqual([]);
  });
});

describe('one attribution command', () => {
  const SRC = join(__dirname, '..', '..');
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
    });

  it("no screen calls the host's guideCorrectCue by itself", () => {
    const offenders = sources(SRC)
      .map((path) => relative(SRC, path).split(sep).join('/'))
      .filter((path) => !path.startsWith('api/') && !path.startsWith('interactionFeedback') && path !== 'studio/commands/attributeCue.ts')
      .filter((path) => /\.guideCorrectCue\(/.test(readFileSync(join(SRC, path), 'utf8')));
    expect(offenders, 'attribute through attributeCue(journal, ...) so the change is one undoable entry').toEqual([]);
  });
});
