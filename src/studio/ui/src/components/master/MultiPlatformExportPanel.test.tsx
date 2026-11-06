// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryProfile, MultiPackageJob, MultiPackageResult } from '../../types';
import { toastTexts } from '../../fixtures/toasts';
import { MultiPlatformExportPanel, type MultiPackageSource } from './MultiPlatformExportPanel';

afterEach(cleanup);

const profile = (id: string, platform: string): DeliveryProfile =>
  ({ id, platform, name: platform, builtIn: true, version: '2026-09', revision: 0, rules: [] }) as unknown as DeliveryProfile;
const ACX = profile('acx', 'ACX');
const FINDAWAY = profile('findaway', 'Findaway');

const result = (patch: Partial<MultiPackageResult>): MultiPackageResult => ({
  profile: 'acx@2026-09',
  platform: 'ACX',
  phase: 'success',
  message: '',
  outputDir: 'C:\\Users\\Narrator\\Desktop\\Wonderland\\ACX',
  files: [],
  checklist: [],
  ...patch,
});

const jobs = (results: MultiPackageResult[], running = false): MultiPackageSource => ({
  job: { id: 'j', phase: running ? 'running' : 'success', message: running ? '' : 'Built 1 packages.', results } as unknown as MultiPackageJob,
  running,
  starting: false,
  problem: undefined,
  encoded: 1,
  blocked: false,
  start: vi.fn(async () => undefined),
  cancel: vi.fn(),
});

describe('Multi-platform export', () => {
  it("puts each platform's result under its own checkbox, not in a second list of the same names (R4MS2-8, R3MS-14)", () => {
    const { container } = render(
      <MultiPlatformExportPanel
        profiles={[ACX, FINDAWAY]}
        multi={jobs([result({}), result({ profile: 'findaway', platform: 'Findaway', phase: 'error', error: 'no room on the disk' })])}
      />,
    );
    expect(screen.getAllByText('ACX')).toHaveLength(1);
    expect(screen.queryByRole('list', { name: 'Multi-platform export results' })).toBeNull();
    const [acx, findaway] = [...container.querySelectorAll('fieldset > div')] as HTMLElement[];
    expect(within(acx!).getByRole('checkbox', { name: 'ACX' })).toBeTruthy();
    expect(within(acx!).getByText('Built')).toBeTruthy();
    expect(within(findaway!).getByText('no room on the disk')).toBeTruthy();
    // The button comes after what it made.
    const build = screen.getByRole('button', { name: /^Build/ });
    expect(acx!.compareDocumentPosition(build) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('breaks a saved folder only after a separator (XMS-18)', () => {
    const { container } = render(<MultiPlatformExportPanel profiles={[ACX]} multi={jobs([result({})])} />);
    const path = screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === 'C:\\Users\\Narrator\\Desktop\\Wonderland\\ACX');
    expect(path.querySelectorAll('wbr')).toHaveLength(5);
    expect(path.className).not.toContain('overflow-wrap:anywhere');
    expect(container.textContent).not.toContain('Building');
  });

  it('says a platform is building on its own row while the job runs', () => {
    render(<MultiPlatformExportPanel profiles={[ACX]} multi={jobs([result({ phase: 'running' })], true)} />);
    expect(screen.getByText('Building…')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Building packages' })).toBeTruthy();
  });

  it('tells a failed build as a toast, not as a line that opens under the button (rule 7, #2632)', () => {
    const failed: MultiPackageSource = { ...jobs([]), problem: 'a package is already being built' };
    const { container, rerender } = render(<MultiPlatformExportPanel profiles={[ACX, FINDAWAY]} multi={jobs([])} />);
    const before = container.innerHTML;
    rerender(<MultiPlatformExportPanel profiles={[ACX, FINDAWAY]} multi={failed} />);
    expect(toastTexts()).toEqual(['a package is already being built']);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('p')?.textContent ?? '').not.toContain('already being built');
    expect(container.innerHTML.length).toBeLessThanOrEqual(before.length);
  });

  it('tells a build that ended in error as a toast once, with no red line of its own', () => {
    const errored = jobs([]);
    errored.job = { ...errored.job!, phase: 'error', message: 'Nothing was built.' } as MultiPackageJob;
    const { container } = render(<MultiPlatformExportPanel profiles={[ACX]} multi={errored} />);
    expect(toastTexts()).toEqual(['Nothing was built.']);
    expect(container.textContent).not.toContain('Nothing was built.');
  });

  it('is off with the reason beside it until a chapter is encoded, and says what is in the way after that (#2824)', () => {
    const { rerender } = render(<MultiPlatformExportPanel profiles={[ACX]} multi={{ ...jobs([]), encoded: 0 }} />);
    expect(screen.getByText('Master and encode a chapter first.')).toBeTruthy();
    // aria-disabled, not `disabled`: a Build that goes off the moment it is pressed must not drop the keyboard's focus (qa-breaker B5).
    expect(screen.getByRole('button', { name: /^Build/ }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: /^Build/ }).hasAttribute('disabled')).toBe(false);
    rerender(<MultiPlatformExportPanel profiles={[ACX]} multi={{ ...jobs([]), blocked: true }} />);
    expect(screen.getByText('Another build or export is using the files.')).toBeTruthy();
  });

  it('does not offer the platforms while nothing is encoded, so ticking one cannot promise a build that stays off (#2824 walkthrough)', () => {
    render(<MultiPlatformExportPanel profiles={[ACX]} multi={{ ...jobs([]), encoded: 0 }} />);
    expect(screen.getByRole('checkbox', { name: 'ACX' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Build 0 packages' })).toBeTruthy();
  });

  it('shows a cancelled job as cancelled: no row left on Building…, and no success colour on its message (qa-breaker B1, B2)', () => {
    const cancelled = jobs([result({ phase: 'running' }), result({ profile: 'findaway', platform: 'Findaway', phase: 'pending' })]);
    cancelled.job = { ...cancelled.job!, phase: 'cancelled', message: 'Cancelled. 0 of 2 packages were built.' } as unknown as MultiPackageJob;
    render(<MultiPlatformExportPanel profiles={[ACX, FINDAWAY]} multi={cancelled} />);
    expect(screen.queryByText('Building…')).toBeNull();
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
    const line = screen.getByText('Cancelled. 0 of 2 packages were built.');
    expect((line as HTMLElement).style.color).not.toBe('var(--ok-text)');
  });

  it('keeps the platforms being built checked when the page is opened again mid-build (qa-breaker B4)', () => {
    render(<MultiPlatformExportPanel profiles={[ACX, FINDAWAY]} multi={jobs([result({ phase: 'running' })], true)} />);
    expect(screen.getByRole('checkbox', { name: 'ACX' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: 'Findaway' }).getAttribute('aria-checked')).toBe('false');
  });

  it('lets a long unbroken platform name wrap inside the card (qa-breaker B6)', () => {
    const long = profile('x', 'X'.repeat(60));
    render(<MultiPlatformExportPanel profiles={[long]} multi={jobs([])} />);
    expect(screen.getByText('X'.repeat(60)).className).toContain('[overflow-wrap:anywhere]');
  });
});
