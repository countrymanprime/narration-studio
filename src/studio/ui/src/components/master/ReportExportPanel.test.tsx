// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { NarrationApi } from '../../types';
import { ReportExportPanel } from './ReportExportPanel';
import { brand } from '../../brand.gen';

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
      folder: `C:/p/${brand.identity.projectFolder}/delivery`,
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

  it('stays off while a job runs, and says why beside it', () => {
    mount({ busy: true, measured: true });
    const button = screen.getByRole('button', { name: 'Export report' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-describedby') && document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Wait for the running check to end.',
    );
  });

  // R4TB-4, R4MS1-11, R4MS2-3: the button, its reason and its option sit together at the foot of the card, not the button alone in the header.
  it('keeps the button with its reason and its option, the option off with it', () => {
    mount({ measured: false });
    const button = screen.getByRole('button', { name: 'Export report' });
    const reason = screen.getByText(/^Check some files first/);
    expect(button.parentElement).toBe(reason.parentElement);
    expect(button.getAttribute('aria-describedby')).toBe(reason.id);
    expect(button.closest('[class*="border-b"]')).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Include each file/ }).hasAttribute('data-disabled')).toBe(true);
    // R4MS2-2: the folder is one unbroken name.
    expect(screen.getByText(`${brand.identity.projectFolder}/delivery`).className).toContain('whitespace-nowrap');
  });
});
