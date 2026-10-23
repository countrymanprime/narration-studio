import { describe, expect, it } from 'vitest';
import type { CoverageStartResult } from '../../api/contracts/coverage';
import { idleRun, runReducer, type RunAction, type RunState } from './checkRun';

const started = (runId: string): CoverageStartResult => ({ status: 'started', state: { runId, phase: 'running', percent: 0, message: '' } });
const apply = (state: RunState, ...actions: RunAction[]) => actions.reduce(runReducer, state);
const refused = (message: string): CoverageStartResult => ({ status: 'refused', reason: 'unmapped', message });

describe('runReducer one at a time', () => {
  it('starts the first chapter, shows its percent, and starts the next only when the first ends', () => {
    let s = apply(idleRun, { type: 'begin', ids: ['a', 'b'] });
    expect(s).toMatchObject({ step: 'running', next: 1, active: { a: { phase: 'starting' } } });
    s = apply(s, { type: 'answered', id: 'a', answer: started('r1') }, { type: 'progress', runId: 'r1', percent: 40 });
    expect(s.active).toEqual({ a: { phase: 'running', runId: 'r1', percent: 40 } });
    // A second answer for the same chapter, or one for a chapter not started, is not a second start.
    expect(apply(s, { type: 'answered', id: 'b', answer: started('r2') })).toBe(s);
    s = apply(s, { type: 'ended', runId: 'r1', phase: 'complete', message: '' });
    expect(s).toMatchObject({ next: 2, finished: ['a'], active: { b: { phase: 'starting', percent: 0 } } });
  });

  it('carries on past a refusal with the host words, and finishes', () => {
    let s = apply(idleRun, { type: 'begin', ids: ['a', 'b'] }, { type: 'answered', id: 'a', answer: refused('Link a track first.') });
    expect(s).toMatchObject({ next: 2, messages: { a: 'Link a track first.' }, active: { b: { phase: 'starting' } } });
    s = apply(s, { type: 'answered', id: 'b', answer: started('r2') }, { type: 'ended', runId: 'r2', phase: 'complete', message: '' });
    expect(s).toMatchObject({ step: 'done', finished: ['b'], active: {} });
  });

  it('turns an asset_required answer into a message naming Settings', () => {
    const answer = { status: 'asset_required', model: { displayName: 'Whisper small' } } as unknown as CoverageStartResult;
    const s = apply(idleRun, { type: 'begin', ids: ['a'] }, { type: 'answered', id: 'a', answer });
    expect(s.messages.a).toContain('Download it in Settings');
    expect(s.step).toBe('done');
  });

  it('records a failed or cancelled end as the host words and does not count it finished', () => {
    const s = apply(
      idleRun,
      { type: 'begin', ids: ['a'] },
      { type: 'answered', id: 'a', answer: started('r1') },
      { type: 'ended', runId: 'r1', phase: 'failed', message: 'Sidecar stopped.' },
    );
    expect(s).toMatchObject({ step: 'done', finished: [], messages: { a: 'Sidecar stopped.' } });
  });

  it('ignores progress and ends of another run, and stop keeps what finished', () => {
    let s = apply(
      idleRun,
      { type: 'begin', ids: ['a', 'b'] },
      { type: 'answered', id: 'a', answer: started('r1') },
      { type: 'ended', runId: 'r1', phase: 'complete', message: '' },
    );
    s = apply(s, { type: 'answered', id: 'b', answer: started('r2') });
    expect(apply(s, { type: 'progress', runId: 'r1', percent: 90 })).toBe(s);
    s = apply(s, { type: 'stop' });
    expect(s).toMatchObject({ step: 'stopped', finished: ['a'], active: {} });
    expect(apply(s, { type: 'ended', runId: 'r2', phase: 'complete', message: '' })).toBe(s);
  });

  it('does nothing to begin on no chapters', () => {
    expect(apply(idleRun, { type: 'begin', ids: [] })).toBe(idleRun);
  });

  it('keeps an end that arrives before its start was answered', () => {
    const s = apply(
      idleRun,
      { type: 'begin', ids: ['a', 'b'] },
      { type: 'ended', runId: 'r1', phase: 'complete', message: '' },
      { type: 'answered', id: 'a', answer: started('r1') },
    );
    expect(s).toMatchObject({ finished: ['a'], early: {}, active: { b: { phase: 'starting' } } });
  });

  it('drops an end for a run when no start is waiting', () => {
    const s = apply(idleRun, { type: 'begin', ids: ['a'] }, { type: 'answered', id: 'a', answer: started('r1') });
    expect(apply(s, { type: 'ended', runId: 'other', phase: 'complete', message: '' })).toBe(s);
  });
});

describe('runReducer several at a time', () => {
  it('hands out up to the limit at once and the next as each ends', () => {
    let s = apply(idleRun, { type: 'begin', ids: ['a', 'b', 'c'], limit: 2 });
    expect(Object.keys(s.active)).toEqual(['a', 'b']);
    s = apply(s, { type: 'answered', id: 'a', answer: started('r1') }, { type: 'answered', id: 'b', answer: started('r2') });
    s = apply(s, { type: 'progress', runId: 'r2', percent: 55 }, { type: 'progress', runId: 'r1', percent: 10 });
    expect(s.active).toMatchObject({ a: { percent: 10 }, b: { percent: 55 } });
    // The second finishes first: the third takes its place while the first goes on.
    s = apply(s, { type: 'ended', runId: 'r2', phase: 'complete', message: '' });
    expect(Object.keys(s.active).sort()).toEqual(['a', 'c']);
    expect(s.finished).toEqual(['b']);
    s = apply(
      s,
      { type: 'answered', id: 'c', answer: started('r3') },
      { type: 'ended', runId: 'r1', phase: 'complete', message: '' },
      { type: 'ended', runId: 'r3', phase: 'complete', message: '' },
    );
    expect(s).toMatchObject({ step: 'done', finished: ['b', 'a', 'c'] });
  });

  it('a limit above the chapters, or below one, is clamped', () => {
    expect(Object.keys(apply(idleRun, { type: 'begin', ids: ['a', 'b'], limit: 9 }).active)).toEqual(['a', 'b']);
    expect(Object.keys(apply(idleRun, { type: 'begin', ids: ['a', 'b'], limit: 0 }).active)).toEqual(['a']);
  });

  it('a refusal of one chapter leaves the others going and starts the next', () => {
    let s = apply(idleRun, { type: 'begin', ids: ['a', 'b', 'c'], limit: 2 }, { type: 'answered', id: 'a', answer: started('r1') });
    s = apply(s, { type: 'answered', id: 'b', answer: refused('Busy.') });
    expect(s.messages).toEqual({ b: 'Busy.' });
    expect(Object.keys(s.active).sort()).toEqual(['a', 'c']);
  });

  it('stop ends every chapter in progress', () => {
    const s = apply(idleRun, { type: 'begin', ids: ['a', 'b'], limit: 2 }, { type: 'answered', id: 'a', answer: started('r1') }, { type: 'stop' });
    expect(s).toMatchObject({ step: 'stopped', active: {} });
  });
});
