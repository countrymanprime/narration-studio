// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryProfile, MultiPackageJob, MultiPackageResult } from '../../types';
import { toastTexts } from '../../overlay/toastTesting';
import { MultiPlatformExportPanel } from './MultiPlatformExportPanel';
import type { ExportJobs } from './useExportJobs';

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

const jobs = (results: MultiPackageResult[], running = false): ExportJobs =>
  ({
    multiPackageJob: { id: 'j', phase: running ? 'running' : 'success', message: running ? '' : 'Built 1 packages.', results } as unknown as MultiPackageJob,
    multiPackageRunning: running,
    multiPackageProblem: undefined,
    doneFiles: [],
    exportRunning: false,
    packageRunning: false,
    startMultiPackage: vi.fn(),
    cancelMultiPackage: vi.fn(),
  }) as unknown as ExportJobs;

describe('Multi-platform export', () => {
  it("puts each platform's result under its own checkbox, not in a second list of the same names (R4MS2-8, R3MS-14)", () => {
    const { container } = render(
      <MultiPlatformExportPanel
        profiles={[ACX, FINDAWAY]}
        jobs={jobs([result({}), result({ profile: 'findaway', platform: 'Findaway', phase: 'error', error: 'no room on the disk' })])}
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
    const { container } = render(<MultiPlatformExportPanel profiles={[ACX]} jobs={jobs([result({})])} />);
    const path = screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === 'C:\\Users\\Narrator\\Desktop\\Wonderland\\ACX');
    expect(path.querySelectorAll('wbr')).toHaveLength(5);
    expect(path.className).not.toContain('overflow-wrap:anywhere');
    expect(container.textContent).not.toContain('Building');
  });

  it('says a platform is building on its own row while the job runs', () => {
    render(<MultiPlatformExportPanel profiles={[ACX]} jobs={jobs([result({ phase: 'running' })], true)} />);
    expect(screen.getByText('Building…')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Building packages' })).toBeTruthy();
  });

  it('tells a failed build as a toast, not as a line that opens under the button (rule 7, #2632)', () => {
    const failed = { ...jobs([]), multiPackageProblem: 'a package is already being built' } as ExportJobs;
    const { container, rerender } = render(<MultiPlatformExportPanel profiles={[ACX, FINDAWAY]} jobs={jobs([])} />);
    const before = container.innerHTML;
    rerender(<MultiPlatformExportPanel profiles={[ACX, FINDAWAY]} jobs={failed} />);
    expect(toastTexts()).toEqual(['a package is already being built']);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('p')?.textContent ?? '').not.toContain('already being built');
    expect(container.innerHTML.length).toBeLessThanOrEqual(before.length);
  });

  it('tells a build that ended in error as a toast once, with no red line of its own', () => {
    const errored = jobs([]);
    errored.multiPackageJob = { ...errored.multiPackageJob!, phase: 'error', message: 'Nothing was built.' } as MultiPackageJob;
    const { container } = render(<MultiPlatformExportPanel profiles={[ACX]} jobs={errored} />);
    expect(toastTexts()).toEqual(['Nothing was built.']);
    expect(container.textContent).not.toContain('Nothing was built.');
  });
});
