// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryProfile, MeasureFileResult, NarrationApi } from '../../../types';
import { MasterPage } from './MasterPage';
import { ALL_PASS, PageHost, TWO_FAIL, acx, apiOf, failingTwo, jobOf, noRules, passing } from './testPage';

afterEach(cleanup);

const mount = (files: readonly MeasureFileResult[], profile: DeliveryProfile = acx, overrides: Partial<NarrationApi> = {}, onOpenDelivery = vi.fn()) => {
  const api = apiOf(jobOf(files, profile), profile, overrides);
  render(
    <PageHost api={api}>
      <MasterPage onOpenDelivery={onOpenDelivery} openSettings={vi.fn()} />
    </PageHost>,
  );
  return { api, onOpenDelivery };
};
const package_ = () => screen.getByRole('complementary', { name: /Delivery package/ });
const chart = () => screen.getByRole('img', { name: /RMS by file/ });

describe('Master & QC page body', () => {
  it('shows-book-consistency-and-the-package-checks-drawn-from-the-profile', async () => {
    mount(ALL_PASS);
    expect(await screen.findByText(/Spread \d+\.\d dB across 2 files/)).toBeTruthy();
    expect(chart().querySelectorAll('line')).toHaveLength(2);
    expect(chart().querySelector('rect')).toBeTruthy();
    const list = within(package_());
    expect(list.getByText('Chapters are one file each')).toBeTruthy();
    expect(list.getByText('Every file under 120 min')).toBeTruthy();
    expect(list.getByText('mono or stereo · 44.1 kHz · 192 kbps+ CBR')).toBeTruthy();
  });

  it('counts-failing-and-not-ready-from-the-files', async () => {
    mount(TWO_FAIL);
    const aside = within(await screen.findByRole('complementary', { name: /Delivery package/ }));
    expect(aside.getByText('1 failing and 1 not ready.')).toBeTruthy();
    expect(aside.getByText('Chapter 04.wav fails 2 checks')).toBeTruthy();
    expect(aside.getByText('1 chapter not ready')).toBeTruthy();
    cleanup();
    mount(ALL_PASS);
    expect(await screen.findByText('0 failing and 0 not ready.')).toBeTruthy();
    expect(screen.queryByText(/not ready$/)).toBeNull();
  });

  it('the-active-profile-decides: a tighter limit flips a pass to a fail in the chart and the package list together', async () => {
    const tight: DeliveryProfile = {
      ...acx,
      rules: acx.rules.map((r) => (r.id === 'acx.file_length' ? { ...r, max: 60 } : r)),
    };
    const long = { ...passing('Chapter 01.wav'), report: { ...passing().report!, duration_seconds: 90 * 60 } };
    mount([long], tight);
    expect(await screen.findByText('Every file under 1 min')).toBeTruthy();
    expect(within(package_()).getByText('✕')).toBeTruthy();
    cleanup();
    mount([long], acx);
    expect(await screen.findByText('Every file under 120 min')).toBeTruthy();
    expect(within(package_()).queryByText('✕')).toBeNull();
    // The chart marks a file the profile's RMS rule missed in the danger colour.
    cleanup();
    mount([failingRms()]);
    await screen.findByRole('img', { name: /RMS by file/ });
    expect(chart().querySelector('line')!.getAttribute('stroke')).toBe('var(--danger-text)');
  });

  it('the-profile-pill-and-open-delivery-go-to-delivery', async () => {
    const { onOpenDelivery } = mount(ALL_PASS);
    await userEvent.click(await screen.findByRole('button', { name: 'ACX' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open Delivery' }));
    expect(onOpenDelivery).toHaveBeenCalledTimes(2);
  });

  it('the-kept-panels-mount-unchanged-below', async () => {
    mount(ALL_PASS);
    for (const title of ['Mastering chain', 'Diagnostics', 'Multi-platform export']) {
      expect(await screen.findByRole('heading', { name: new RegExp(title) })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: /report/i })).toBeTruthy();
  });

  it('the-run-controls-are-kept-above-the-table: Check files picks, measures and shows progress with Cancel', async () => {
    const running = { ...jobOf([]), phase: 'running' as const, percent: 40, message: 'Reading Chapter 01.wav' };
    const analyze = vi.fn().mockResolvedValue(running);
    const { api } = mount([], acx, {
      measurePickFiles: async () => ({ paths: ['C:/a.wav'] }),
      measureAnalyze: analyze,
      measureState: vi.fn().mockResolvedValue(jobOf([])),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Check files…' }));
    await waitFor(() => expect(analyze).toHaveBeenCalledWith(['C:/a.wav']));
    expect(await screen.findByText('Reading Chapter 01.wav')).toBeTruthy();
    const cancel = vi.spyOn(api, 'measureCancel');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalled();
  });

  it('a-profile-that-lacks-a-rule-shows-no-row-for-it', async () => {
    mount(ALL_PASS, noRules);
    await screen.findByRole('complementary', { name: /Delivery package · Other/ });
    const list = within(package_());
    expect(list.queryByText(/Every file under/)).toBeNull();
    expect(list.queryByText(/kbps/)).toBeNull();
    expect(list.queryByText('Chapters are one file each')).toBeNull();
    expect(chart().querySelector('rect')).toBeNull();
  });

  it('daw-wording-from-capabilities: no component under masterqc names a DAW', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const sources = walk(join(__dirname, '..')).filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f));
    expect(sources.length).toBeGreaterThan(5);
    expect(sources.filter((f) => readFileSync(f, 'utf8').includes('REAPER'))).toEqual([]);
  });
});

function failingRms(): MeasureFileResult {
  const file = failingTwo('Chapter 09.wav');
  return {
    ...file,
    rules: file.rules.map((r) => (r.ruleId === 'acx.rms' ? { ...r, status: 'not_met' as const, value: -30 } : r)),
    report: { ...file.report!, rms_dbfs: -30 },
  };
}
