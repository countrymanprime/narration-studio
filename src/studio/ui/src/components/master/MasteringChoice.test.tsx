// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { MasteringMockSeed } from '../../api/masteringMock';
import type { MasteringProviders } from '../../api/contracts/mastering';
import type { NarrationApi } from '../../types';
import { clearToasts, findToast, toastTexts } from '../../fixtures/toasts';
import { overlay } from '../../overlay/overlayService';
import { MASTERING_SAVE_NO_ANSWER, MasteringChain, useMasteringProviders } from './MasteringChain';
import { MASTER_REQUEST_WAIT_MS } from './masterRequests';

beforeEach(clearToasts);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Card({ locked = false }: { locked?: boolean }) {
  const mastering = useMasteringProviders();
  return (
    <>
      <button type="button" onClick={mastering.reload}>
        Read again
      </button>
      <MasteringChain
        providers={mastering.providers}
        problem={mastering.problem}
        saveProblem={mastering.saveProblem}
        saving={mastering.saving}
        locked={locked}
        onChoose={mastering.choose}
      />
    </>
  );
}

async function mount(seed: MasteringMockSeed = {}, props: { locked?: boolean } = {}, overrides: Partial<NarrationApi> = {}) {
  const api = createMockApi(overrides, { mastering: seed });
  const choose = vi.spyOn(api, 'masteringChooseProvider');
  const read = vi.spyOn(api, 'masteringProviders');
  render(
    <ApiProvider api={api}>
      <Card {...props} />
    </ApiProvider>,
  );
  if (seed.hasProject !== false) await screen.findByRole('radiogroup', { name: 'Master with' });
  return { api, choose, read };
}

const radio = (name: string | RegExp) => screen.getByRole('radio', { name });
const checked = () => screen.getAllByRole('radio').find((element) => element.getAttribute('aria-checked') === 'true');
const announced = () => overlay.getSnapshot().announcement;

describe("Master & QC's chain card: choosing the project's mastering row (#2739)", () => {
  it('draws no choice while the rows are read, then every row with the effective one chosen', async () => {
    let answer: ((state: MasteringProviders) => void) | undefined;
    const api = createMockApi();
    const real = api.masteringProviders;
    vi.spyOn(api, 'masteringProviders').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    render(
      <ApiProvider api={api}>
        <Card />
      </ApiProvider>,
    );
    expect(screen.queryByRole('radiogroup')).toBeNull();
    await act(async () => answer?.(await real()));
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(checked()).toBe(radio('Built-in chain (EQ, limiter, gain)'));
    expect(radio('Built-in chain (EQ, limiter, gain)')).toBeTruthy();
  });

  it('offers no choice without a project', async () => {
    await mount({ hasProject: false });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Mastering chain' })).toBeTruthy());
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it("an unavailable row is off, with the host's reason as its tooltip and the name of its tab stop", async () => {
    await mount({ unavailable: { audacity: "Audacity's effect macro is not available on this computer." } });
    const group = screen.getByRole('radiogroup', { name: 'Master with' });
    const reason = within(group).getByRole('group', { name: "Audacity's effect macro is not available on this computer." });
    expect(reason.getAttribute('tabindex')).toBe('0');
    const off = within(group)
      .getAllByRole('radio')
      .filter((element) => element.hasAttribute('data-disabled') || element.getAttribute('aria-disabled') === 'true');
    expect(off).toHaveLength(1);
  });

  it('a press saves; the choice moves only when the host answers, and the save is announced', async () => {
    let release: (() => void) | undefined;
    const { api, choose } = await mount();
    const real = api.masteringChooseProvider;
    choose.mockImplementationOnce(
      (name) =>
        new Promise((resolve) => {
          release = () => void real(name).then(resolve);
        }),
    );
    await userEvent.click(radio("Your DAW's FX chain"));
    expect(choose).toHaveBeenCalledWith('daw');
    // Not claimed yet: the built-in row is still the chosen one, and every row is held while the save waits.
    expect(radio('Built-in chain (EQ, limiter, gain)').getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByRole('radio').every((element) => element.hasAttribute('data-disabled'))).toBe(true);
    // A second press while the save waits sends nothing.
    await userEvent.click(radio("Audacity's effect macro"));
    expect(choose).toHaveBeenCalledTimes(1);
    await act(async () => release?.());
    await waitFor(() => expect(radio("Your DAW's FX chain").getAttribute('aria-checked')).toBe('true'));
    expect(announced()).toBe("Saved. This project masters with Your DAW's FX chain.");
    expect(screen.getAllByRole('radio').some((element) => element.hasAttribute('data-disabled'))).toBe(false);
  });

  it('a refusal is a toast in the host words, the rows are read again, and the choice stays where the host has it', async () => {
    const { choose, read } = await mount();
    choose.mockRejectedValueOnce(new Error('open a project before choosing how it is mastered'));
    const reads = read.mock.calls.length;
    await userEvent.click(radio("Your DAW's FX chain"));
    await findToast('The mastering chain was not saved: open a project before choosing how it is mastered');
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(reads));
    expect(radio('Built-in chain (EQ, limiter, gain)').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('when the host never answers, the save is freed after the bound with a toast, and the rows are read again', async () => {
    const { choose, read } = await mount();
    choose.mockImplementationOnce(() => new Promise(() => undefined));
    const reads = read.mock.calls.length;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await userEvent.click(radio("Your DAW's FX chain"));
    await act(async () => {
      vi.advanceTimersByTime(MASTER_REQUEST_WAIT_MS + 1);
    });
    await findToast(MASTERING_SAVE_NO_ANSWER);
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(reads));
    expect(screen.getAllByRole('radio').some((element) => element.hasAttribute('data-disabled'))).toBe(false);
  });

  it('a read that set off before a save and answers after it does not put the old choice back (stale answer)', async () => {
    const { api, read } = await mount();
    const real = api.masteringProviders;
    let late: ((state: MasteringProviders) => void) | undefined;
    const before = await real();
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          late = resolve;
        }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Read again' }));
    await userEvent.click(radio("Your DAW's FX chain"));
    await waitFor(() => expect(radio("Your DAW's FX chain").getAttribute('aria-checked')).toBe('true'));
    await act(async () => late?.(before));
    expect(radio("Your DAW's FX chain").getAttribute('aria-checked')).toBe('true');
  });

  it('every row is held while an export runs or starts', async () => {
    const { choose } = await mount({}, { locked: true });
    expect(screen.getAllByRole('radio').every((element) => element.hasAttribute('data-disabled'))).toBe(true);
    await userEvent.click(radio("Your DAW's FX chain"));
    expect(choose).not.toHaveBeenCalled();
    expect(toastTexts()).toEqual([]);
  });

  it("a stored choice that cannot run shows the default chosen, the host's notice, and the row it fell back from", async () => {
    await mount({ choice: 'audacity', unavailable: { audacity: "Audacity's effect macro is not available on this computer." } });
    expect(radio('Built-in chain (EQ, limiter, gain)').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('This project masters with the default');
  });
});
