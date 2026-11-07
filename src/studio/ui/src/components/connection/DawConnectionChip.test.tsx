// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS } from '../../fixtures/daw';
import type { NarrationApi } from '../../types';
import { TooltipProvider } from '../primitives/Tooltip';
import { DawConnectionChip } from './DawConnectionChip';
import { LinkDawFileContext } from './linkDawFile';
import { resetOpenOnce } from './useOpenOnce';

beforeEach(resetOpenOnce);
afterEach(cleanup);

const off = () => structuredClone(DAW_SETUPS['reaper-off']);
const on = () => structuredClone(DAW_SETUPS['reaper']);

function mount(api: Partial<NarrationApi> = {}, chips = 1, link?: () => Promise<{ kind: 'linked' }>) {
  const body = (
    <TooltipProvider>
      {Array.from({ length: chips }, (_, index) => (
        <DawConnectionChip key={index} id={`chip-${index}`} graceMs={0} stillWorks={(name) => `Takes can be read. Changes wait until ${name} is running.`} />
      ))}
    </TooltipProvider>
  );
  render(<ApiProvider api={createMockApi(api)}>{link ? <LinkDawFileContext.Provider value={link}>{body}</LinkDawFileContext.Provider> : body}</ApiProvider>);
}

describe('DawConnectionChip (#2823)', () => {
  it('draws nothing while the DAW answers', async () => {
    mount({ dawCapabilities: async () => on() });
    await waitFor(() => expect(screen.queryByRole('button', { name: /not connected/ })).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('draws the chip and opens the not-connected dialog by itself once, when the DAW does not answer', async () => {
    mount({ dawCapabilities: async () => off() });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'REAPER is not connected' })).toBeTruthy();
    expect(within(dialog).getByText(/Changes wait until REAPER is running/)).toBeTruthy();
    // The page behind a modal dialog is hidden from the reader, so the chip is counted by its label.
    expect(screen.getAllByRole('button', { name: /REAPER not connected\. Show details/, hidden: true })).toHaveLength(1);
  });

  it('is reopened from the chip after the narrator closes the dialog', async () => {
    const user = userEvent.setup();
    mount({ dawCapabilities: async () => off() });
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: /REAPER not connected\. Show details/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('is one chip and one connection state on every page: a Check again on one is the read the other shows', async () => {
    const user = userEvent.setup();
    let answering = false;
    const dawCapabilities = vi.fn(async () => (answering ? on() : off()));
    mount({ dawCapabilities }, 2);
    const chips = await screen.findAllByRole('button', { name: /REAPER not connected\. Show details/ });
    expect(chips).toHaveLength(2);
    answering = true;
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /REAPER not connected/ })).toHaveLength(0));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('links the project file from the dialog, and every chip follows without a reload', async () => {
    const user = userEvent.setup();
    let linked = false;
    const dawChoice = async () =>
      ({
        hasProject: true,
        daw: 'REAPER',
        state: linked ? 'linked' : 'not_linked',
        linkedFile: linked ? 'Alice.rpp' : null,
        foundFiles: [],
        options: [],
      }) as never;
    const dawCapabilities = vi.fn(async () => (linked ? on() : off()));
    const link = vi.fn(async () => {
      linked = true;
      return { kind: 'linked' as const };
    });
    mount({ dawChoice, dawCapabilities }, 2, link);
    await user.click(await screen.findByRole('button', { name: 'Link project file…' }));
    await waitFor(() => expect(link).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /REAPER not connected/ })).toHaveLength(0));
  });
});
