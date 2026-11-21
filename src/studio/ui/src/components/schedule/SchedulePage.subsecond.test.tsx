// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { installKit, mountSchedule } from './scheduleKit.test';

installKit();
afterEach(cleanup);

// #3869 (delta intent G2): the Schedule's recorded hours (the chart's "today" point) read audio under one second as 0 s, like every Production figure, and one second moves it.
describe('the Schedule’s recorded hours and audio under one second', () => {
  const todayY = async (recordedSeconds: number) => {
    await mountSchedule({
      wrap: (base) => ({
        productionOverview: async () => {
          const overview = await base.productionOverview();
          return {
            ...overview,
            chapters: overview.chapters.map((chapter, index) => (index === 0 ? { ...chapter, recordedSeconds } : { ...chapter, recordedSeconds: null })),
          };
        },
      }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Schedule' });
    let y = '';
    await waitFor(() => {
      y = document.querySelector('circle[data-marker="today"]')?.getAttribute('cy') ?? '';
      expect(y).not.toBe('');
    });
    cleanup();
    return y;
  };
  it('puts the point of 0.5 s and 0.99 s where 0 s puts it, and one second above it', async () => {
    const zero = await todayY(0);
    expect(await todayY(0.5)).toBe(zero);
    expect(await todayY(0.99)).toBe(zero);
    expect(await todayY(1)).not.toBe(zero);
  });
});
