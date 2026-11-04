// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { announceRateBasis } from '../../schedule/useEffectiveWph';
import { CUSTOM_CHANGED, type ProbeContext } from '../data/customChanged';
import { ROWS } from '../registry/rows';
import { search } from '../registry/search';
import { SettingsHostProvider, type SettingsHost } from '../row/SettingsHost';
import { RateBasisBody } from './ProjectBodies';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const notify = vi.fn();
const host = { notify } as unknown as SettingsHost;
const mount = (api: NarrationApi) =>
  render(
    <ApiProvider api={api}>
      <SettingsHostProvider value={host}>
        <RateBasisBody />
      </SettingsHostProvider>
    </ApiProvider>,
  );
const radio = (name: string) => screen.findByRole('radio', { name });

describe('the schedule basis setting (parity audit)', () => {
  it('is a project row under Project, found by the words a narrator uses, and Changed reads the plan', async () => {
    expect(ROWS.find((row) => row.id === 'project.rateBasis')).toMatchObject({ cat: 'project', scope: 'project', used: ['production', 'schedule'] });
    for (const query of ['schedule basis', 'words per hour standard rate', 'own pace measured'])
      expect(search(query).some((hit) => hit.row?.id === 'project.rateBasis')).toBe(true);
    const plan = (rateBasis?: 'standard' | 'own') => ({ productionPlan: async () => ({ rateBasis }) });
    const context = (api: object) => ({ api, settings: {}, delivery: async () => ({}) }) as unknown as ProbeContext;
    expect(await CUSTOM_CHANGED['project.rateBasis']!(context(plan(undefined)))).toBe(false);
    expect(await CUSTOM_CHANGED['project.rateBasis']!(context(plan('standard')))).toBe(false);
    expect(await CUSTOM_CHANGED['project.rateBasis']!(context(plan('own')))).toBe(true);
  });

  it('shows Standard until the project chose its own pace, and saves a choice through the same binding the Production popover uses', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'setProductionRateBasis');
    mount(api);
    expect(((await radio('Standard')) as HTMLInputElement).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(await radio('Your own pace'));
    await waitFor(() => expect(save).toHaveBeenCalledWith('own'));
    await waitFor(async () => expect((await api.productionPlan()).rateBasis).toBe('own'));
    expect((await radio('Your own pace')).getAttribute('aria-checked')).toBe('true');
  });

  it('follows a choice made elsewhere while it is shown', async () => {
    const api = createMockApi();
    mount(api);
    await radio('Standard');
    await api.setProductionRateBasis('own');
    act(() => announceRateBasis('own'));
    await waitFor(async () => expect((await radio('Your own pace')).getAttribute('aria-checked')).toBe('true'));
  });

  it('keeps the earlier choice and says why when the host refuses', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'setProductionRateBasis').mockRejectedValueOnce(new Error('disk full'));
    mount(api);
    fireEvent.click(await radio('Your own pace'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('disk full'), 'error'));
    expect((await radio('Standard')).getAttribute('aria-checked')).toBe('true');
  });

  it('says so when the plan cannot be read, and offers no choice it cannot honour', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'productionPlan').mockRejectedValue(new Error('no project'));
    mount(api);
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('no project'), 'error'));
    const standard = await radio('Standard');
    expect(standard.hasAttribute('data-disabled') || standard.getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('does not let a plan read that started before a save overwrite it', async () => {
    const api = createMockApi();
    let finishSlow: (plan: Awaited<ReturnType<NarrationApi['productionPlan']>>) => void = () => undefined;
    const read = vi.spyOn(api, 'productionPlan');
    mount(api);
    await radio('Standard');
    read.mockImplementationOnce(() => new Promise((resolve) => (finishSlow = resolve)));
    act(() => void window.dispatchEvent(new Event('focus')));
    fireEvent.click(await radio('Your own pace'));
    await waitFor(async () => expect((await radio('Your own pace')).getAttribute('aria-checked')).toBe('true'));
    await act(async () => finishSlow({ deadline: null, contractedAmount: null, payment: 'none', rateBasis: 'standard', milestones: [] } as never));
    expect((await radio('Your own pace')).getAttribute('aria-checked')).toBe('true');
  });

  it('saves once when the same choice is pressed twice before the host has answered', async () => {
    const api = createMockApi();
    let answer: () => void = () => undefined;
    const save = vi
      .spyOn(api, 'setProductionRateBasis')
      .mockImplementation(
        (basis) =>
          new Promise(
            (resolve) => (answer = () => resolve({ deadline: null, contractedAmount: null, payment: 'none', rateBasis: basis, milestones: [] } as never)),
          ),
      );
    mount(api);
    const own = await radio('Your own pace');
    fireEvent.click(own);
    fireEvent.click(own);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => answer());
  });

  it('reports a read that fails once, not again on every window focus', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'productionPlan').mockRejectedValue(new Error('no project'));
    notify.mockClear();
    mount(api);
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 3; i += 1) await act(async () => void window.dispatchEvent(new Event('focus')));
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
