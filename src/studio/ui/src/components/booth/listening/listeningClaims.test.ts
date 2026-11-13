import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimListening, forgetListeningClaims, STALE_MS, joinListening, ownsListening, releaseListening, unclaimListening } from './listeningClaims';

beforeEach(forgetListeningClaims);

afterEach(() => vi.useRealTimers());

describe('who owns the host listening session', () => {
  it('a claim whose start never answered is stale after STALE_MS: a press that finds a session some other way does not take it over', () => {
    vi.useFakeTimers();
    claimListening();
    vi.advanceTimersByTime(STALE_MS + 1);
    expect(joinListening()).toBeNull();
  });
  it('the press that started it owns it and lets it go once', () => {
    const press = claimListening();
    expect(releaseListening(press)).toBe(true);
    expect(releaseListening(press)).toBe(false);
  });
  it('a cancelled press whose session a later press joined stops nothing; the joiner now owns it', () => {
    const first = claimListening();
    const second = joinListening();
    expect(releaseListening(first)).toBe(false);
    expect(ownsListening(second)).toBe(true);
    expect(releaseListening(second)).toBe(true);
  });
  it('a session no press began (the narrator started it) is not taken by a press that finds it', () => {
    const joiner = joinListening();
    expect(joiner).toBeNull();
    expect(releaseListening(joiner)).toBe(false);
  });
  it('a start the host refused hands the session back to who owned it', () => {
    const first = claimListening();
    const refused = claimListening();
    unclaimListening(refused);
    expect(releaseListening(first)).toBe(true);
  });
  it('claims A, B and C: B refused changes nothing, C refused hands the session back to A, whose late answer then lets it go', () => {
    const a = claimListening();
    const b = claimListening();
    const c = claimListening();
    unclaimListening(b);
    expect(ownsListening(c)).toBe(true);
    unclaimListening(c);
    expect(ownsListening(a)).toBe(true);
    expect(releaseListening(a)).toBe(true);
  });
  it('a claim that was refused after a newer one took its place is gone, not the owner again', () => {
    const a = claimListening();
    const b = claimListening();
    unclaimListening(a);
    expect(releaseListening(a)).toBe(false);
    expect(releaseListening(b)).toBe(true);
  });
  it('a cold read started after a cancelled press cannot be stopped by that press', () => {
    const press = claimListening();
    const cold = claimListening();
    expect(releaseListening(press)).toBe(false);
    expect(ownsListening(cold)).toBe(true);
  });
  it('a cold read claim ended under a newer adopted claim that then fails leaves no owner behind', () => {
    const cold = claimListening();
    const adopted = claimListening();
    // The cold read's end cannot release it (it is not the newest), so it is removed by itself.
    if (!releaseListening(cold)) unclaimListening(cold);
    unclaimListening(adopted);
    expect(joinListening()).toBeNull();
  });
  it('a session that ended some other way has no owner', () => {
    const press = claimListening();
    forgetListeningClaims();
    expect(releaseListening(press)).toBe(false);
    expect(joinListening()).toBeNull();
  });
});

// The class guard (#3320): the page asks the host to start or stop the one listening session only through a claim. A bare `session.stop()` in a press,
// or a `session.start(` in one that never claimed, is what stopped the next press's listening.
const PAGE = readFileSync(join(__dirname, '../page/useBoothPage.ts'), 'utf8');
const body = (from: string, to: string): string => {
  const start = PAGE.indexOf(from);
  expect(start, `${from} is not in useBoothPage.ts any more: update this guard`).toBeGreaterThan(-1);
  return PAGE.slice(start, PAGE.indexOf(to, start));
};

describe('every listening start and stop of a press or cold read is owned by a claim', () => {
  const PRESS_PATHS: ReadonlyArray<readonly [name: string, from: string, to: string]> = [
    ['beginOnce', 'const beginOnce', '\n  // The press under way'],
    // The cold read's start path: the narrator's own toggle-off above it stops the cold read they can see, which is not a continuation.
    ['toggleColdRead start', 'coldReadStarting.current = true;', '\n  // Another chapter is another text'],
  ];
  for (const [name, from, to] of PRESS_PATHS) {
    const text = body(from, to);
    it(`${name} claims before it starts a session`, () => {
      expect(text).toMatch(/session\.start\(/);
      expect(text).toMatch(/claimListening\(\)/);
      expect(text.indexOf('claimListening()')).toBeLessThan(text.indexOf('session.start('));
    });
    it(`${name} stops the session only through a released claim`, () => {
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        if (!/session\.stop\(\)/.test(line) || line.trimStart().startsWith('//')) return;
        expect(lines.slice(Math.max(0, index - 1), index + 1).join('\n'), `${name}: a stop that is not owned: ${line.trim()}`).toMatch(/releaseListening\(/);
      });
    });
  }
});
