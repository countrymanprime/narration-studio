// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from './mockApi';

afterEach(() => {
  delete window.__NARRATION_MOCK_DAW__;
});

// The host tells the page that another project was opened (the epoch moves, daw_tracks_changed); the mock must too, or a page that waits on the event waits on a timer.
describe('the mock DAW announces a change of the open project as the host does', () => {
  it.each([
    ['another project is opened', (control: NonNullable<typeof window.__NARRATION_MOCK_DAW__>) => control.openProject('other')],
    ['the linked project is opened again', (control: NonNullable<typeof window.__NARRATION_MOCK_DAW__>) => control.linkedOpenProject()],
  ])('when %s, once, and not after the page stopped listening', (_what, act) => {
    const api = createMockApi();
    const heard = vi.fn();
    const stop = api.subscribeTracksChanged(heard);
    const control = window.__NARRATION_MOCK_DAW__!;
    act(control);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    act(control);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
