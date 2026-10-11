import { describe, expect, it } from 'vitest';
import { centreWindow, clock, followSecond, MIN_WINDOW, nudgeWindow, resizeWindow, stepLength, zoomSteps, zoomWindow } from './windowMath';

describe('windowMath', () => {
  it('steps 30 / 60 / 120 / 300 s then the whole chapter, and clamps to a short chapter', () => {
    expect(zoomSteps(760)).toEqual([30, 60, 120, 300, 760]);
    expect(zoomSteps(90)).toEqual([30, 60, 90]);
    expect(zoomSteps(20)).toEqual([20]);
    expect(stepLength(30, -1, 760)).toBeNull();
    expect(stepLength(760, 1, 760)).toBeNull();
    expect(stepLength(100, 1, 760)).toBe(120);
    expect(stepLength(100, -1, 760)).toBe(60);
  });

  it('zooms about the centre and stays inside the chapter', () => {
    expect(zoomWindow({ start: 100, len: 60 }, 1, 760)).toEqual({ start: 70, len: 120 });
    expect(zoomWindow({ start: 0, len: 60 }, 1, 760)).toEqual({ start: 0, len: 120 });
    expect(zoomWindow({ start: 0, len: 30 }, -1, 760)).toBeNull();
  });

  it('centres, follows and nudges', () => {
    expect(centreWindow({ start: 0, len: 60 }, 300, 760)).toEqual({ start: 270, len: 60 });
    expect(centreWindow({ start: 0, len: 60 }, 5, 760)).toEqual({ start: 0, len: 60 });
    const inside = { start: 100, len: 60 };
    expect(followSecond(inside, 120, 760)).toBe(inside);
    expect(followSecond(inside, 400, 760)).toEqual({ start: 370, len: 60 });
    expect(nudgeWindow({ start: 100, len: 60 }, 1, 760)).toEqual({ start: 106, len: 60 });
    expect(nudgeWindow({ start: 700, len: 60 }, 1, 760, true)).toEqual({ start: 700, len: 60 });
  });

  it('resizes an edge but never below MIN_WINDOW or past the chapter', () => {
    const w = { start: 100, len: 60 };
    expect(resizeWindow(w, 'start', 150, 760)).toEqual({ start: 130, len: 30 });
    expect(resizeWindow(w, 'start', -20, 760)).toEqual({ start: 0, len: 160 });
    expect(resizeWindow(w, 'end', 105, 760)).toEqual({ start: 100, len: MIN_WINDOW });
    expect(resizeWindow(w, 'end', 9999, 760)).toEqual({ start: 100, len: 660 });
  });

  it('formats the clock', () => {
    expect(clock(125)).toBe('02:05');
    expect(clock(3725)).toBe('1:02:05');
  });
});
