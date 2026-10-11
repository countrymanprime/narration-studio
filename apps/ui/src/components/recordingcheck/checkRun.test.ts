import { describe, expect, it } from 'vitest';
import type { CoverageStartResult } from '../../api/contracts/coverage';
import { idleRun, runReducer, type RunAction, type RunState } from './checkRun';

const started = (runId: string): CoverageStartResult => ({ status: 'started', state: { runId, phase: 'running', percent: 0, message: '' } });
const apply = (state: RunState, ...actions: RunAction[]) => actions.reduce(runReducer, state);

describe('runReducer', () => {
  it('starts the first chapter, shows its percent, and starts the next only when the first ends', () => {
    let s = apply(idleRun, { type: 'begin', ids: ['a', 'b'] });
    expect(s).toMatchObject({ step: 'starting', index: 0 });
    s = apply(s, { type: 'answered', id: 'a', answer: started('r1') }, { type: 'progress', runId: 'r1', percent: 40 });
    expect(s).toMatchObject({ step: 'running', index: 0, percent: 40 });
    // A second answer for the same chapter, or one for the next, is not a second start.
    expect(apply(s, { type: 'answered', id: 'b', answer: started('r2') })).toBe(s);
    s = apply(s, { type: 'ended', runId: 'r1', phase: 'complete', message: '' });
    expect(s).toMatchObject({ step: 'starting', index: 1, finished: ['a'], percent: 0 });
  });
  it('carries on past a refusal with the host words, and finishes', () => {
    let s = apply(
      idleRun,
      { type: 'begin', ids: ['a', 'b'] },
      { type: 'answered', id: 'a', answer: { status: 'refused', reason: 'unmapped', message: 'Link a track first.' } },
    );
    expect(s).toMatchObject({ step: 'starting', index: 1, messages: { a: 'Link a track first.' } });
    s = apply(s, { type: 'answered', id: 'b', answer: started('r2') }, { type: 'ended', runId: 'r2', phase: 'complete', message: '' });
    expect(s).toMatchObject({ step: 'done', finished: ['b'] });
  });
  it('turns an asset_required answer into a message naming Settings', () => {
    const answer = { status: 'asset_required', model: { displayName: 'Whisper small' } } as unknown as CoverageStartResult;
    const s = apply(idleRun, { type: 'begin', ids: ['a'] }, { type: 'answered', id: 'a', answer });
    expect(s.messages.a).toContain('Download it in Settings');
    expect(s.step).toBe('done');
  });
  it('ignores progress and ends of another run, and stop keeps what finished', () => {
    let s = apply(
      idleRun,
      { type: 'begin', ids: ['a', 'b'] },
      { type: 'answered', id: 'a', answer: started('r1') },
      { type: 'ended', runId: 'r1', phase: 'complete', message: '' },
    );
    s = apply(s, { type: 'answered', id: 'b', answer: started('r2') });
    expect(apply(s, { type: 'progress', runId: 'r1', percent: 90 }).percent).toBe(0);
    s = apply(s, { type: 'stop' });
    expect(s).toMatchObject({ step: 'stopped', finished: ['a'] });
  });
  it('does nothing to begin on no chapters', () => {
    expect(apply(idleRun, { type: 'begin', ids: [] })).toBe(idleRun);
  });
});
