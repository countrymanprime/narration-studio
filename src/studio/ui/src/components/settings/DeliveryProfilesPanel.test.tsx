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
    const notify = vi.fn();
    // A second custom profile, a copy of the built-in ACX one.
    await api.deliveryDuplicateProfile('acx', '2026-09');
    const real = api.deliverySaveProfile.bind(api);
    const spy = vi.spyOn(api, 'deliverySaveProfile').mockImplementation((change) => save(change, real));
    render(
      <ApiProvider api={api}>
        <UnsavedDraftsProvider>
          <TooltipProvider>
            <Harness notify={notify} />
          </TooltipProvider>
        </UnsavedDraftsProvider>
      </ApiProvider>,
    );
    fireEvent.click((await screen.findAllByRole('button', { name: /^Edit / }))[0]!);
    const dialog = await screen.findByRole('dialog');
    return { api, dialog, spy, real, notify, name: within(dialog).getByLabelText('Name') as HTMLInputElement };
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

  it('a profile list read that fails after a good save says so, and the row shows the saved revision (#3461 round 9)', async () => {
    const { api, dialog, name, notify } = await openEditor((change, real) => real(change));
    const before = (await api.deliveryProfiles()).profiles.find((profile) => !profile.builtIn)!;
    vi.spyOn(api, 'deliveryProfiles').mockRejectedValue(new Error('The host could not list them.'));
    fireEvent.change(name, { target: { value: 'Tighter peak' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.stringContaining('The delivery profiles could not be read: The host could not list them.'),
        'error',
        expect.anything(),
      ),
    );
    // The row is not left on the old name and revision.
    expect(screen.getByText('Tighter peak')).toBeTruthy();
    expect(before.name).not.toBe('Tighter peak');
  });

  it("one profile whose save never answered does not hold another profile's Save (#3461 round 9)", async () => {
    let calls = 0;
    const { dialog, name, spy } = await openEditor((change, real) => (++calls === 1 ? new Promise(() => {}) : real(change)));
    fireEvent.change(name, { target: { value: 'First profile renamed' } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save profile' }));
    await act(async () => {});
    await act(async () => void vi.advanceTimersByTime(15_001));
    vi.useRealTimers();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Discard changes' })).toHaveProperty('disabled', false));
    // Close the first editor and save the other profile.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getAllByRole('button', { name: /^Edit / })[1]!);
    const second = await screen.findByRole('dialog');
    fireEvent.change(within(second).getByLabelText('Name'), { target: { value: 'Second profile renamed' } });
    fireEvent.click(within(second).getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it('a Save the panel refused is not what the late answer of the first save is about: the text typed meanwhile is kept (#3461 round 10 P1)', async () => {
    let answer: () => void = () => {};
    const { dialog, name } = await openEditor(
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
    // More typed after the give-up, and Save pressed: refused with the notice, nothing sent.
    fireEvent.change(name, { target: { value: 'Tighter peak and more typed since' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save profile' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    answer();
    await new Promise((resolve) => setTimeout(resolve, 200));
    // The first save landed: the editor stays open on the newer text.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Tighter peak and more typed since');
  });

  it('a profile list read that is overtaken does not put the row back at an older revision (#3461 round 10 P2)', async () => {
    const { api, dialog, name } = await openEditor((change, real) => real(change));
    const stale = await api.deliveryProfiles();
    const real = api.deliveryProfiles.bind(api);
    const waiting: Array<(list: Awaited<ReturnType<typeof real>>) => void> = [];
    vi.spyOn(api, 'deliveryProfiles').mockImplementation(() => new Promise((resolve) => waiting.push(resolve)));
    fireEvent.change(name, { target: { value: 'Tighter peak' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(waiting.length).toBeGreaterThanOrEqual(2));
    vi.mocked(api.deliveryProfiles).mockRestore();
    const fresh = await real();
    // The later read answers first with the new revision; the earlier one answers last with the old one.
    waiting.at(-1)!(fresh);
    await new Promise((resolve) => setTimeout(resolve, 50));
    waiting[0]!(stale);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getByText('Tighter peak')).toBeTruthy();
  });
});

describe('the Duplicate toast of a delivery profile (#4129)', () => {
  // The profile's Name field is a plain input, drawn left to right: "<Arabic> copy" with the Arabic run first and "copy" to its right. A first-strong isolate in the toast would put "copy" on the other side.
  it('names the copy left to right, as the Name field draws it', async () => {
    const api = createMockApi({}, { deliveryProfile: 'custom' });
    const notify = vi.fn();
    const arabic = 'افتتاحية الكتاب';
    const real = api.deliveryDuplicateProfile.bind(api);
    vi.spyOn(api, 'deliveryDuplicateProfile').mockImplementation(async (id, version) => ({ ...(await real(id, version)), name: `${arabic} copy` }));
    render(
      <ApiProvider api={api}>
        <UnsavedDraftsProvider>
          <TooltipProvider>
            <Harness notify={notify} />
          </TooltipProvider>
        </UnsavedDraftsProvider>
      </ApiProvider>,
    );
    fireEvent.click((await screen.findAllByRole('button', { name: /^Duplicate / }))[0]!);
    await waitFor(() => expect(notify).toHaveBeenCalledWith(`Duplicated as "⁦${arabic} copy⁩".`));
  });
});
