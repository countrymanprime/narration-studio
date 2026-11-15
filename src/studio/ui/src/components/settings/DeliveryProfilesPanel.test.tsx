// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { UnsavedDraftsProvider } from '../../studio/drafts/unsavedDrafts';
import { TooltipProvider } from '../primitives/Tooltip';
import { CustomProfileList, useDeliveryProfiles } from './DeliveryProfilesPanel';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function Harness({ notify }: { notify: () => void }) {
  const ctl = useDeliveryProfiles(notify);
  return <CustomProfileList ctl={ctl} />;
}

describe('the delivery profile editor over a save that never answers', () => {
  it('is free again after the save limit, with an error and the typed number kept (#3461 round 7 BR2)', async () => {
    const api = createMockApi({}, { deliveryProfile: 'custom' });
    vi.spyOn(api, 'deliverySaveProfile').mockImplementation(() => new Promise(() => {}));
    render(
      <ApiProvider api={api}>
        <UnsavedDraftsProvider>
          <TooltipProvider>
            <Harness notify={vi.fn()} />
          </TooltipProvider>
        </UnsavedDraftsProvider>
      </ApiProvider>,
    );
    const edit = await screen.findByRole('button', { name: /^Edit / });
    fireEvent.click(edit);
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Tighter peak' } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save profile' }));
    await act(async () => {});
    // While the save is out the way out is off.
    expect(within(dialog).getByRole('button', { name: 'Discard changes' })).toHaveProperty('disabled', true);
    await act(async () => void vi.advanceTimersByTime(15_001));
    vi.useRealTimers();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Discard changes' })).toHaveProperty('disabled', false));
    expect(within(dialog).getByText('The save did not finish. What you typed is still here.')).toBeTruthy();
    expect(name.value).toBe('Tighter peak');
  });

  // Opens the first custom profile's editor over a mock host whose save the test controls.
  type Save = ReturnType<typeof createMockApi>['deliverySaveProfile'];
  const openEditor = async (save: (change: Parameters<Save>[0], real: Save) => ReturnType<Save>) => {
    const api = createMockApi({}, { deliveryProfile: 'custom' });
    const real = api.deliverySaveProfile.bind(api);
    const spy = vi.spyOn(api, 'deliverySaveProfile').mockImplementation((change) => save(change, real));
    render(
      <ApiProvider api={api}>
        <UnsavedDraftsProvider>
          <TooltipProvider>
            <Harness notify={vi.fn()} />
          </TooltipProvider>
        </UnsavedDraftsProvider>
      </ApiProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Edit / }));
    const dialog = await screen.findByRole('dialog');
    return { api, dialog, spy, real, name: within(dialog).getByLabelText('Name') as HTMLInputElement };
  };

  it('text typed while the save is out is kept when the save succeeds: the editor stays open on it (#3461 round 7 BR1)', async () => {
    let answer: () => void = () => {};
    const { dialog, name } = await openEditor(
      (change, real) =>
        new Promise((resolve) => {
          answer = () => void real(change).then(resolve);
        }),
    );
    fireEvent.change(name, { target: { value: 'Tighter peak' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save profile' }));
    await act(async () => {});
    fireEvent.change(name, { target: { value: 'Tighter peak, and more' } });
    answer();
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Still open, with what was typed, as an edit still to save (the button says it drops it).
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Tighter peak, and more');
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeTruthy();
  });

  it('with nothing typed since, a save that succeeds closes the editor (#3461 round 7 BR1)', async () => {
    const { dialog, name } = await openEditor((change, real) => real(change));
    fireEvent.change(name, { target: { value: 'Tighter peak' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a profile list read that never answers does not hold the editor once the save succeeded (#3461 round 7 BR2b)', async () => {
    const { api, dialog, name } = await openEditor((change, real) => real(change));
    vi.spyOn(api, 'deliveryProfiles').mockImplementation(() => new Promise(() => {}));
    fireEvent.change(name, { target: { value: 'Tighter peak' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Save again after the give-up sends nothing, and the first save landing late closes the editor (#3461 round 7 BR3)', async () => {
    let answer: () => void = () => {};
    const { dialog, name, spy } = await openEditor(
      (change, real) =>
        new Promise((resolve) => {
          answer = () => void real(change).then(resolve);
        }),
    );
    fireEvent.change(name, { target: { value: 'Tighter peak' } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save profile' }));
    await act(async () => {});
    await act(async () => void vi.advanceTimersByTime(15_001));
    vi.useRealTimers();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Discard changes' })).toHaveProperty('disabled', false));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save profile' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy).toHaveBeenCalledTimes(1);
    answer();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
