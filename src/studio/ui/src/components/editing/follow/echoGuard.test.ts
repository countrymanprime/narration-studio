import { describe, expect, it } from 'vitest';
import { ECHO_TOLERANCE, ECHO_WINDOW_MS, EchoGuard } from './echoGuard';

function guard() {
  let now = 1000;
  const g = new EchoGuard(() => now);
  return { g, tick: (ms: number) => (now += ms) };
}

describe('echo-guard', () => {
  it('hears the first cursor the DAW reports as a move, so the page can adopt it', () => {
    expect(guard().g.heard(12)).toBe('moved');
  });

  it('does not take the cursor it set for a move in the DAW', () => {
    const { g } = guard();
    g.heard(5);
    g.write(20);
    expect(g.heard(20)).toBe('echo');
  });

  it('takes an echo within the tolerance and no further', () => {
    const { g } = guard();
    g.heard(5);
    g.write(20);
    expect(g.heard(20 + ECHO_TOLERANCE / 2)).toBe('echo');
    g.write(30);
    expect(g.heard(30 + ECHO_TOLERANCE * 3)).toBe('moved');
  });

  it('hears a cursor that has not changed as nothing, so a stale reading cannot undo the write', () => {
    const { g } = guard();
    g.heard(5);
    g.write(20);
    expect(g.heard(5)).toBe('unchanged');
    expect(g.heard(5.0002)).toBe('unchanged');
    expect(g.heard(20)).toBe('echo');
  });

  it('hears the echo once: the same place reported again later is nothing, and a return to it is a move', () => {
    const { g } = guard();
    g.heard(5);
    g.write(20);
    expect(g.heard(20)).toBe('echo');
    expect(g.heard(20)).toBe('unchanged');
    g.heard(40);
    expect(g.heard(20)).toBe('moved');
  });

  it('takes an echo that comes after the window for a move', () => {
    const { g, tick } = guard();
    g.heard(5);
    g.write(20);
    tick(ECHO_WINDOW_MS + 1);
    expect(g.heard(20)).toBe('moved');
  });

  it('does not lose a move the narrator made in the DAW while a write was on its way', () => {
    const { g } = guard();
    g.heard(5);
    g.write(20);
    expect(g.heard(77)).toBe('moved');
    // The write lands afterwards: that is where the DAW is now, so the page follows it rather than staying on the narrator's place.
    expect(g.heard(20)).toBe('moved');
  });

  it('takes the echo of an earlier write when a newer one has been sent, then the newer one', () => {
    const { g } = guard();
    g.heard(5);
    const first = g.write(20);
    const second = g.write(30);
    expect(second).toBe(first + 1);
    expect(g.heard(20)).toBe('echo');
    expect(g.heard(30)).toBe('echo');
  });

  it('forgets a write that failed, so its place is a move if the narrator goes there', () => {
    const { g } = guard();
    g.heard(5);
    const gen = g.write(20);
    g.settled(gen, false);
    expect(g.heard(20)).toBe('moved');
  });

  it('keeps a write that succeeded, and ignores the outcome of one a newer write has replaced', () => {
    const { g } = guard();
    g.heard(5);
    const first = g.write(20);
    const second = g.write(30);
    g.settled(first, false);
    g.settled(second, true);
    expect(g.heard(30)).toBe('echo');
  });

  it('counts a generation for each write', () => {
    const { g } = guard();
    const a = g.write(1);
    const b = g.write(2);
    expect(b).toBe(a + 1);
    expect(g.generation).toBe(b);
  });

  it('starts again after reset: nothing pending, nothing heard', () => {
    const { g } = guard();
    g.heard(5);
    g.write(20);
    g.reset();
    expect(g.heard(20)).toBe('moved');
    expect(g.heard(20)).toBe('unchanged');
  });

  it('takes a cursor that is not a number for nothing', () => {
    const { g } = guard();
    expect(g.heard(NaN)).toBe('unchanged');
    expect(g.heard(Infinity)).toBe('unchanged');
    expect(g.heard(-1)).toBe('unchanged');
  });
});
