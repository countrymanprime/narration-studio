// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { NarrationApi } from '../../types';
import { ReportExportPanel } from './ReportExportPanel';

afterEach(cleanup);

function mount(props: { busy?: boolean; measured: boolean }, overrides: Partial<NarrationApi> = {}) {
  const api = createMockApi(overrides);
  render(
    <ApiProvider api={api}>
      <ReportExportPanel busy={props.busy ?? false} measured={props.measured} />
    </ApiProvider>,
  );
}

describe('the report export', () => {
  // Issue 1715: the button was live with nothing measured and answered "The report was not written: nothing has been measured".
  it('says what it needs and does not offer an export that can only be refused, while nothing is measured', async () => {
    const deliveryExportReport = vi.fn();
    mount({ measured: false }, { deliveryExportReport });
    const button = screen.getByRole('button', { name: 'Export report' });
    expect(button).toHaveProperty('disabled', true);
    expect(screen.getByText(/Check some files first/)).toBeTruthy();
    await userEvent.click(button);
    expect(deliveryExportReport).not.toHaveBeenCalled();
  });

  it('writes the report once files are measured', async () => {
    const deliveryExportReport = vi.fn(async () => ({
      folder: 'C:/p/narration-utils/delivery',
      htmlFile: 'report.html',
      jsonFile: 'report.json',
      files: 1,
      findings: 2,
      openFindings: 1,
      pathsIncluded: false,
    }));
    mount({ measured: true }, { deliveryExportReport });
    await userEvent.click(screen.getByRole('button', { name: 'Export report' }));
    expect(await screen.findByText(/Wrote/)).toBeTruthy();
    expect(screen.queryByText(/Check some files first/)).toBeNull();
  });

  it('stays off while a job runs', () => {
    mount({ busy: true, measured: true });
    expect(screen.getByRole('button', { name: 'Export report' })).toHaveProperty('disabled', true);
  });
});
