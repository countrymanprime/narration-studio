// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { OverlayHost } from '../../overlay/OverlayHost';
import type { NarrationApi } from '../../types';
import { TooltipProvider } from '../primitives/Tooltip';
import { importedMessage, ProoferSheet } from './ProoferSheet';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderSheet(api: NarrationApi = createMockApi()) {
  render(
    <ApiProvider api={api}>
      <TooltipProvider>
        <ProoferSheet />
        <OverlayHost />
      </TooltipProvider>
    </ApiProvider>,
  );
  return api;
}

/** The sheet counts the pickups when it opens; the host runs one pickups run at a time, so a test waits for that count to settle. */
const countSettled = () => new Promise((resolve) => setTimeout(resolve, 400));

const chooseFile = (text: string) => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([text], 'sheet.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  fireEvent.change(input, { target: { files: [file] } });
};

describe('ProoferSheet', () => {
  it('imports a sheet and says how many pickups it added', async () => {
    const api = renderSheet();
    const imported = vi.spyOn(api, 'pickupsImport');
    await countSettled();
    chooseFile('start,note,tag\n12.5,Missed a word,ch1\n40,Mumbled,ch1\nnot a row\n');
    await waitFor(() => expect(imported).toHaveBeenCalledOnce());
    expect(await screen.findByText('Added 2 pickups from the proofer’s sheet; 1 row was skipped.', {}, { timeout: 3000 })).toBeTruthy();
  });

  it('says why the host refused the sheet', async () => {
    renderSheet();
    chooseFile('start,note,tag\nnot a row\n');
    expect(await screen.findByText(/no valid pickups were found/)).toBeTruthy();
  });

  it('exports the sheet, downloads it and says how many pickups went out', async () => {
    const api = renderSheet();
    const createUrl = vi.fn(() => 'blob:sheet');
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const exported = vi.spyOn(api, 'pickupsExport');
    await countSettled();
    fireEvent.click(screen.getByRole('button', { name: 'Export for proofer' }));
    await waitFor(() => expect(exported).toHaveBeenCalledOnce());
    expect(await screen.findByText(/^Exported \d+ pickups? for the proofer\.$/, {}, { timeout: 3000 })).toBeTruthy();
    expect(clicked).toHaveBeenCalledOnce();
    expect(createUrl).toHaveBeenCalledOnce();
  });

  it('downloads nothing for an export that finished before the page opened', async () => {
    const api = createMockApi();
    await api.pickupsExport();
    await countSettled();
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderSheet(api);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(clicked).not.toHaveBeenCalled();
  });

  it('names what was already there and what the DAW rejected', () => {
    expect(importedMessage({ added: 1, existing: 2, invalid: 1 }, 0)).toBe('Added 1 pickup from the proofer’s sheet; 2 were there already; 1 row was skipped.');
  });
});
