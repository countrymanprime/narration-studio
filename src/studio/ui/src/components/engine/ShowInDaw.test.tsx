// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../fixtures/daw';
import { overlay } from '../../overlay/overlayService';
import { createMockDawClient } from '../../ports/daw';
import { PortOverrides } from '../../ports/usePort';
import { TooltipProvider } from '../primitives/Tooltip';
import { ShowInDawButton, type ShowInDawTarget } from './ShowInDaw';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(target: ShowInDawTarget, setupId: DawSetupId = 'reaper', props: { disabled?: boolean } = {}) {
  const api = createMockApi();
  const goTo = vi.spyOn(api, 'workspaceGoTo').mockResolvedValue({ outcome: 'navigated', projectTime: 74 });
  const findingGoTo = vi.spyOn(api, 'findingsGoTo').mockResolvedValue({ outcome: 'navigated', projectTime: 221 });
  const select = vi.spyOn(api, 'trackSelectInReaper').mockResolvedValue({ outcome: 'selected' } as never);
  const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => '' as never);
  const daw = createMockDawClient(DAW_SETUPS[setupId], { chapterIds: [], candidateIds: [], findingIds: [] });
  render(
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw }}>
        <TooltipProvider>
          <ShowInDawButton target={target} {...props} />
        </TooltipProvider>
      </PortOverrides>
    </ApiProvider>,
  );
  return { goTo, findingGoTo, select, toast };
}

const button = (name: string | RegExp) => screen.findByRole('button', { name });
const isOff = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled;

describe('ShowInDawButton (#2826): one button, one label, one host call per kind of target', () => {
  it('names the DAW the setup names, whatever the page', async () => {
    setup({ kind: 'finding', id: 'f1' });
    expect(await button('Show in REAPER')).toBeTruthy();
  });

  it('follows the engine: Audacity says Show in Audacity', async () => {
    setup({ kind: 'finding', id: 'f1' }, 'audacity');
    expect(await button('Show in Audacity')).toBeTruthy();
  });

  it('a passage goes through workspaceGoTo with its first word, and says where it moved', async () => {
    const t = setup({ kind: 'passage', chapterId: 'c1', token: 42 });
    await userEvent.click(await button('Show in REAPER'));
    expect(t.goTo).toHaveBeenCalledWith('c1', 42);
    await waitFor(() => expect(t.toast).toHaveBeenCalledWith('Moved to 1:14 in REAPER.'));
  });

  it('a finding and a pickup go through findingsGoTo with the finding', async () => {
    const t = setup({ kind: 'pickup', findingId: 'f9' });
    await userEvent.click(await button('Show in REAPER'));
    expect(t.findingGoTo).toHaveBeenCalledWith('f9');
    await waitFor(() => expect(t.toast).toHaveBeenCalledWith('Moved to 3:41 in REAPER.'));
  });

  it('a chapter selects its linked track', async () => {
    const t = setup({ kind: 'chapter', trackGuid: '{T1}' });
    await userEvent.click(await button('Show in REAPER'));
    expect(t.select).toHaveBeenCalledWith('{T1}');
    await waitFor(() => expect(t.toast).toHaveBeenCalledWith('Selected in REAPER.'));
  });

  it('a refusal is the host’s sentence, as an error toast', async () => {
    const t = setup({ kind: 'finding', id: 'f1' });
    t.findingGoTo.mockResolvedValue({ outcome: 'refused', message: 'REAPER has another project open.' } as never);
    await userEvent.click(await button('Show in REAPER'));
    await waitFor(() => expect(t.toast).toHaveBeenCalledWith('REAPER has another project open.', { tone: 'error' }));
  });

  it('a host that throws says the DAW was not asked', async () => {
    const t = setup({ kind: 'finding', id: 'f1' });
    t.findingGoTo.mockRejectedValue(new Error('boom'));
    await userEvent.click(await button('Show in REAPER'));
    await waitFor(() => expect(t.toast).toHaveBeenCalledWith(expect.stringMatching(/^The DAW was not asked: /), { tone: 'error' }));
  });

  it('a pickup with no note has no recording to show: off, with the sentence', async () => {
    const t = setup({ kind: 'pickup', findingId: undefined });
    const b = await button('Show in REAPER');
    expect(isOff(b)).toBe(true);
    await userEvent.click(b);
    expect(t.findingGoTo).not.toHaveBeenCalled();
    await userEvent.hover(b);
    expect(await screen.findByText('This line has no recording to show.')).toBeTruthy();
  });

  it('a chapter with no linked track is off', async () => {
    const t = setup({ kind: 'chapter', trackGuid: undefined });
    expect(isOff(await button('Show in REAPER'))).toBe(true);
    expect(t.select).not.toHaveBeenCalled();
  });

  it('a DAW that cannot navigate is off with its own sentence', async () => {
    const t = setup({ kind: 'finding', id: 'f1' }, 'reaper-off');
    const b = await button(/^Show in /);
    expect(isOff(b)).toBe(true);
    await userEvent.click(b);
    expect(t.findingGoTo).not.toHaveBeenCalled();
  });

  it('a caller can switch it off (a note whose evidence changed)', async () => {
    setup({ kind: 'finding', id: 'f1' }, 'reaper', { disabled: true });
    expect(isOff(await button('Show in REAPER'))).toBe(true);
  });
});
