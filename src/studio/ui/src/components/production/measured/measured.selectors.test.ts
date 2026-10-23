// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOT_MEASURED, planStart, recordedSeries, roomToneLabel, sessionMinutes, weekFigures } from './measured.selectors';

const no = { ok: false, reason: 'No takes.' } as const;
const ok = <T>(value: T) => ({ ok: true, value }) as const;
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('measured selectors', () => {
  it('room-tone-label-says-the-reading-or-the-reason', () => {
    expect(roomToneLabel(ok(-64.1))).toBe('Room −64.1 dB');
    expect(roomToneLabel(ok(-49))).toBe('Room −49.0 dB');
    expect(roomToneLabel(no)).toBe('Room not measured yet');
    expect(NOT_MEASURED).toBe('not measured yet');
  });

  it('recorded-series-is-cumulative-by-day-from-the-plan-start', () => {
    const log = ok([
      { at: '2026-08-31T10:00', seconds: 999 },
      { at: '2026-09-01T09:00', seconds: 1800 },
      { at: '2026-09-01T15:00', seconds: 1800 },
      { at: '2026-09-03T09:00', seconds: 3600 },
    ]);
    expect(recordedSeries(log, d(2026, 9, 1))).toEqual(
      ok([
        [0, 0],
        [0, 1],
        [2, 2],
      ]),
    );
    expect(recordedSeries(ok([]), d(2026, 9, 1))).toEqual(ok([[0, 0]]));
    expect(recordedSeries(no, d(2026, 9, 1))).toBe(no);
  });

  const log = ok([
    { at: '2026-09-10T10:00', seconds: 100 },
    { at: '2026-09-20T10:00', seconds: 200 },
    { at: '2026-09-26T23:59', seconds: 300 },
    { at: '2026-09-27T00:00', seconds: 400 },
  ]);
  it('week-figures-use-the-last-seven-days-and-the-weekly-target', () => {
    const f = weekFigures(log, d(2026, 9, 26), d(2026, 9, 1), d(2026, 10, 1), 30);
    expect(f.week).toEqual(ok(500));
    expect(f.last24h).toEqual(ok(300));
    // 30 finished hours over 30 days, times seven
    expect(f.target).toBe((30 * 3600 * 7) / 30);
    expect(weekFigures(log, d(2026, 9, 26), d(2026, 9, 1), d(2026, 9, 1), 1).target).toBeNull();
    expect(weekFigures(log, d(2026, 9, 26), d(2026, 9, 1), d(2026, 8, 1), 1).target).toBeNull();
  });

  it('week-figures-never-invent-a-number', () => {
    expect(weekFigures(no, d(2026, 9, 26), d(2026, 9, 1), d(2026, 10, 1), 1)).toMatchObject({ week: no, last24h: no });
    expect(weekFigures(no, d(2026, 9, 26), d(2026, 9, 1), null, 1)).toEqual({ week: no, target: null, last24h: no });
    const dir = __dirname;
    for (const name of readdirSync(dir).filter((n) => /\.ts$/.test(n) && !/\.test\./.test(n))) {
      const code = readFileSync(join(dir, name), 'utf8')
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/'[^']*'|`[^`]*`/g, '""');
      const numbers = (code.match(/(?<![\w.])\d[\d_.]*/g) ?? []).filter((n) => !['0', '1', '60', '3600', '7', '86400000', '86_400_000'].includes(n));
      expect(numbers, name).toEqual([]);
    }
  });

  it('session-minutes-rounds-and-floors-at-one', () => {
    expect(sessionMinutes(ok(200))).toEqual(ok(3));
    expect(sessionMinutes(ok(10))).toEqual(ok(1));
    expect(sessionMinutes(ok(0))).toEqual(ok(0));
    expect(sessionMinutes(no)).toBe(no);
  });

  it('plan-start-is-the-first-of-the-month-work-began-in', () => {
    expect(planStart(d(2026, 9, 26))).toEqual(d(2026, 9, 1));
    expect(planStart(d(2026, 12, 31))).toEqual(d(2026, 12, 1));
    expect(planStart(d(2028, 2, 29))).toEqual(d(2028, 2, 1));
    expect(planStart(d(2028, 3, 1))).toEqual(d(2028, 3, 1));
  });

  it('no-component-is-drawn', () => {
    expect(readdirSync(__dirname).filter((n) => /\.tsx$/.test(n) && !/\.(test|stories)\.tsx$/.test(n))).toEqual([]);
  });
});
