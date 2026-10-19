// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { ProductionPlan, ProductionReportInclude, ProductionReportPreview } from '../../../api/contracts/production';
import { createMockApi } from '../../../api/mockApi';
import { overlay } from '../../../overlay/overlayService';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import { openReportDialog } from './openReportDialog';
import { ReportDialog } from './ReportDialog';

afterEach(cleanup);

const PLAN: ProductionPlan = { deadline: '2026-11-01', contractedAmount: 250, payment: 'per_finished_hour', milestones: [] };
const DEFAULTS: ProductionReportInclude = { words: true, stages: true, milestones: true, pickups: true, delivery: true, money: false };
const previewOf = (include: ProductionReportInclude): ProductionReportPreview => ({
  html: `<h1>Status</h1>${include.money ? '<p>Contracted amount 250.00</p>' : ''}${include.words ? '<p>Words</p>' : ''}`,
  json: include.money ? '{"amount":250}\n' : '{}\n',
  folder: 'narration-utils/production/reports',
  stem: 'production-status-1',
  contractedAmountIncluded: include.money,
  include,
});

function mount(overrides: Record<string, unknown> = {}, plan: ProductionPlan = PLAN) {
  const preview = vi.fn(async (include: ProductionReportInclude) => previewOf(include));
  const write = vi.fn(async (include: ProductionReportInclude) => ({
    folder: 'narration-utils/production/reports',
    htmlFile: 'production-status-1.html',
    jsonFile: 'production-status-1.json',
    contractedAmountIncluded: include.money,
    include,
  }));
  const onClose = vi.fn();
  const api = createMockApi({ productionPlan: async () => plan, productionStatusReportPreview: preview, productionStatusReport: write, ...overrides });
  render(
    <ApiProvider api={api}>
      <ReportDialog projectName="Dune" asOf="21 Sep 2026" onClose={onClose} />
    </ApiProvider>,
  );
  return { preview, write, onClose };
}

describe('ReportDialog', () => {
  it('preview-is-what-the-host-answers', async () => {
    const { preview } = mount();
    const frame = (await screen.findByTitle('Preview of the report')) as HTMLIFrameElement;
    expect(preview).toHaveBeenCalledWith(DEFAULTS);
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('<h1>Status</h1>');
    expect(screen.getByText('Dune · as of 21 Sep 2026')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(document.querySelector('pre')?.textContent).toBe('{}\n');
    expect(screen.queryByTitle('Preview of the report')).toBeNull();
  });

  it('amount-is-opt-in-and-refreshes-the-preview', async () => {
    const { preview } = mount();
    const box = await screen.findByRole('checkbox', { name: 'Contracted amount and effective rate' });
    expect(box.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(box);
    await waitFor(() => expect(preview).toHaveBeenLastCalledWith({ ...DEFAULTS, money: true }));
    await waitFor(() => expect((screen.getByTitle('Preview of the report') as HTMLIFrameElement).getAttribute('srcdoc')).toContain('Contracted amount 250.00'));
    await userEvent.click(box);
    await waitFor(() => expect(preview).toHaveBeenLastCalledWith(DEFAULTS));
    await waitFor(() => expect((screen.getByTitle('Preview of the report') as HTMLIFrameElement).getAttribute('srcdoc')).not.toContain('250.00'));
  });

  it('a-section-checkbox-per-section-and-unticking-follows-the-preview', async () => {
    const { preview, write } = mount();
    await screen.findByTitle('Preview of the report');
    for (const name of ['Words and finished audio', 'Hours by stage', 'Deadline and milestones', 'Chapters held back', 'Chapter readiness']) {
      expect(screen.getByRole('checkbox', { name }).getAttribute('aria-checked')).toBe('true');
    }
    await userEvent.click(screen.getByRole('checkbox', { name: 'Words and finished audio' }));
    await waitFor(() => expect(preview).toHaveBeenLastCalledWith({ ...DEFAULTS, words: false }));
    await waitFor(() => expect((screen.getByTitle('Preview of the report') as HTMLIFrameElement).getAttribute('srcdoc')).not.toContain('Words'));
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(write).toHaveBeenCalledWith({ ...DEFAULTS, words: false }));
  });

  it.each([
    ['royalty share', { ...PLAN, payment: 'royalty_share' as const, contractedAmount: null }],
    ['none', { ...PLAN, payment: 'none' as const, contractedAmount: null }],
    ['no amount', { ...PLAN, contractedAmount: null }],
  ])('checkbox-only-for-a-per-hour-contract: %s', async (_name, plan) => {
    const { preview } = mount({}, plan);
    await screen.findByTitle('Preview of the report');
    expect(screen.queryByRole('checkbox', { name: /contracted amount/i })).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledWith(DEFAULTS);
  });

  it('format-switch-changes-the-pane-and-the-path', async () => {
    mount();
    const path = await screen.findByText('narration-utils/production/reports/production-status-1.html');
    expect(path.tagName).toBe('CODE');
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(screen.getByText('narration-utils/production/reports/production-status-1.json').tagName).toBe('CODE');
  });

  it('export-writes-and-says-where, then closes on the second press', async () => {
    const { write, onClose } = mount();
    await screen.findByTitle('Preview of the report');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write).toHaveBeenCalledWith(DEFAULTS);
    await waitFor(() =>
      expect(document.body.textContent).toContain('Wrote production-status-1.html and production-status-1.json to narration-utils/production/reports.'),
    );
    expect(screen.getByText('The contracted amount and effective rate are left out.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('export-failure is an alert in the host words and the dialog stays open', async () => {
    const { onClose } = mount({
      productionStatusReport: async () => {
        throw new Error('The folder is read-only.');
      },
    });
    await screen.findByTitle('Preview of the report');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The folder is read-only.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
  });

  it('export-is-disabled-while-the-preview-loads-or-failed', async () => {
    const { write } = mount({
      productionStatusReportPreview: async () => {
        throw new Error('Open a project first.');
      },
    });
    expect((await screen.findByRole('alert')).textContent).toContain('Open a project first.');
    const exportButton = screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement;
    expect(exportButton.disabled).toBe(true);
    await userEvent.click(exportButton);
    expect(write).not.toHaveBeenCalled();
  });

  it('export-is-disabled-while-loading', () => {
    mount({ productionStatusReportPreview: () => new Promise(() => undefined) });
    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('openReportDialog', () => {
  it('closes on a press outside the dialog: a preview with no input of its own (issue 1706)', async () => {
    const api = createMockApi({ productionPlan: async () => PLAN, productionStatusReportPreview: async (include) => previewOf(include) });
    render(
      <ApiProvider api={api}>
        <OverlayProvider>
          <button type="button" onClick={() => openReportDialog({ projectName: 'Dune', asOf: '21 Sep 2026' })}>
            Open report
          </button>
        </OverlayProvider>
      </ApiProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open report' }));
    await screen.findByRole('dialog', { name: 'Export status report' });
    await userEvent.click(document.querySelector('[data-dialog-backdrop]') as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('dialog-behaviour: opens through the overlay with the title, Escape closes and focus returns to the opener', async () => {
    const api = createMockApi({ productionPlan: async () => PLAN, productionStatusReportPreview: async (include) => previewOf(include) });
    render(
      <ApiProvider api={api}>
        <OverlayProvider>
          <button type="button" onClick={() => openReportDialog({ projectName: 'Dune', asOf: '21 Sep 2026' })}>
            Open report
          </button>
        </OverlayProvider>
      </ApiProvider>,
    );
    const opener = screen.getByRole('button', { name: 'Open report' });
    await userEvent.click(opener);
    expect(await screen.findByRole('dialog', { name: 'Export status report' })).toBeTruthy();
    await screen.findByTitle('Preview of the report');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(overlay.getSnapshot().dialogs).toHaveLength(0);
  });
});
