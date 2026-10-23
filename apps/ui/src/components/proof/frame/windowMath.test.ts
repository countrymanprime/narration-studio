import { describe, expect, it } from 'vitest';
import {
  centreWindow,
  clock,
  EDITING_SCALE,
  followSecond,
  MIN_WINDOW,
  nudgeWindow,
  PROOF_SCALE,
  resizeWindow,
  stepLength,
  zoomSteps,
  zoomWindow,
  zoomWindowAt,
} from './windowMath';

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

  it('keeps the Proof scale as it was: 30 s is the shortest window, and an explicit PROOF_SCALE is the default', () => {
    expect(MIN_WINDOW).toBe(30);
    expect(PROOF_SCALE.min).toBe(30);
    expect(zoomSteps(760, PROOF_SCALE)).toEqual(zoomSteps(760));
    expect(resizeWindow({ start: 100, len: 60 }, 'end', 101, 760, PROOF_SCALE)).toEqual({ start: 100, len: 30 });
  });

  describe('the Editing scale', () => {
    it('steps 1 / 2 / 5 / 10 / 30 s and up, cut short by a short paragraph', () => {
      expect(EDITING_SCALE.min).toBe(1);
      expect(zoomSteps(760, EDITING_SCALE)).toEqual([1, 2, 5, 10, 30, 60, 120, 300, 760]);
      expect(zoomSteps(14, EDITING_SCALE)).toEqual([1, 2, 5, 10, 14]);
      expect(zoomSteps(0.8, EDITING_SCALE)).toEqual([0.8]);
      expect(zoomSteps(0, EDITING_SCALE)).toEqual([]);
      expect(stepLength(1, -1, 14, EDITING_SCALE)).toBeNull();
      expect(stepLength(14, 1, 14, EDITING_SCALE)).toBeNull();
      expect(stepLength(3, -1, 14, EDITING_SCALE)).toBe(2);
      expect(stepLength(3, 1, 14, EDITING_SCALE)).toBe(5);
    });

    it('zooms about the centre down to one second and not below', () => {
      expect(zoomWindow({ start: 0, len: 14 }, -1, 14, EDITING_SCALE)).toEqual({ start: 2, len: 10 });
      expect(zoomWindow({ start: 4, len: 2 }, -1, 14, EDITING_SCALE)).toEqual({ start: 4.5, len: 1 });
      expect(zoomWindow({ start: 4.5, len: 1 }, -1, 14, EDITING_SCALE)).toBeNull();
    });

    it('zooms about a point so the time under the pointer stays under it', () => {
      const next = zoomWindowAt({ start: 2, len: 10 }, -1, 14, 3, EDITING_SCALE)!;
      expect(next.len).toBe(5);
      // 3 s sat 10% of the way across the window and still does
      expect((3 - next.start) / next.len).toBeCloseTo(0.1, 6);
      expect(zoomWindowAt({ start: 0, len: 1 }, -1, 14, 0.5, EDITING_SCALE)).toBeNull();
    });

    it('keeps the zoomed-about window inside the paragraph', () => {
      expect(zoomWindowAt({ start: 0, len: 10 }, -1, 14, 0, EDITING_SCALE)).toEqual({ start: 0, len: 5 });
      expect(zoomWindowAt({ start: 4, len: 10 }, -1, 14, 14, EDITING_SCALE)).toEqual({ start: 9, len: 5 });
    });

    it('resizes an edge down to one second, follows a second and nudges a tenth of a window', () => {
      expect(resizeWindow({ start: 4, len: 5 }, 'end', 4.2, 14, EDITING_SCALE)).toEqual({ start: 4, len: 1 });
      expect(followSecond({ start: 0, len: 2 }, 6, 14, EDITING_SCALE)).toEqual({ start: 5, len: 2 });
      expect(nudgeWindow({ start: 4, len: 2 }, 1, 14, false, EDITING_SCALE)).toEqual({ start: 4.2, len: 2 });
    });
  });
});
