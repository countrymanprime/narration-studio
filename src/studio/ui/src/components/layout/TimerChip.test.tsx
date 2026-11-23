// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockApi } from '../../api/mockApi';
import { PRODUCTION_SCENARIOS } from '../../api/productionMock';
import type { ProductionBoard } from '../production/composeOverview';
import { composeOverview } from '../production/composeOverview';
import { TimerChip, elapsedClock, runningTimerOf } from './TimerChip';

afterEach(cleanup);

describe('elapsedClock', () => {
  const start = '2026-09-26T09:00:00Z';
  const at = (seconds: number) => Date.parse(start) + seconds * 1000;

  it('counts whole seconds since the start as h:mm:ss', () => {
    expect(elapsedClock(start, at(0))).toBe('0:00:00');
    expect(elapsedClock(start, at(42 * 60 + 7.9))).toBe('0:42:07');
    expect(elapsedClock(start, at(2 * 3600 + 14 * 60 + 8))).toBe('2:14:08');
    expect(elapsedClock(start, at(12 * 3600))).toBe('12:00:00');
  });

  it('never reads negative when the clock is a little behind the host', () => {
    expect(elapsedClock(start, at(-5))).toBe('0:00:00');
  });
});

describe('runningTimerOf', () => {
  // The board the Production page hands the chip: the shared chapter list (its titles) with the overview's numbers and running timer.
  const overview = async (seed?: keyof typeof PRODUCTION_SCENARIOS): Promise<ProductionBoard> => {
    const api = createMockApi({}, seed ? { production: PRODUCTION_SCENARIOS[seed] } : {});
    return composeOverview(await api.productionOverview(), (await api.manuscriptChapters()).chapters);
  };

  it('is null when no timer runs', async () => {
    expect(runningTimerOf(await overview())).toBeNull();
  });

  it("names the running session's chapter by its title, with its stage and start", async () => {
    const read = await overview('on-pace');
    expect(runningTimerOf(read)).toEqual({ startedAt: read.running!.startedAt, chapterTitle: 'Chapter 6', stage: 'recording' });
  });

  it('falls back to the chapter id when the chapter is not in the list', async () => {
    const read = await overview('on-pace');
    expect(runningTimerOf(composeOverview(read, []))?.chapterTitle).toBe('chapter-6');
  });
});

describe('TimerChip', () => {
  it('is a timer named for its chapter, stage and elapsed time, and shows the chapter beside the clock', () => {
    const startedAt = new Date(Date.now() - 42 * 60_000).toISOString();
    render(<TimerChip timer={{ startedAt, chapterTitle: 'Chapter 6', stage: 'recording' }} />);
    const timer = screen.getByRole('timer');
    expect(timer.getAttribute('aria-label')).toMatch(/^Timer running on Chapter 6, Recording: 0:42:0\d$/);
    expect(screen.getByRole('timer', { name: /^Timer running on Chapter 6, Recording: 0:42:0/ })).toBeTruthy();
    expect(timer.textContent).toMatch(/^0:42:0\d· timer on Chapter 6$/);
    // #3380: the chapter is clipped beside the clock, so it carries itself as a title.
    expect(screen.getByText('· timer on Chapter 6').getAttribute('title')).toBe('timer on Chapter 6');
  });
});
