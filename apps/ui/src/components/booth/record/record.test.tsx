// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { DawSetupId } from '../../../fixtures/daw';
import { BoothFooter } from '../frame/BoothFooter';
import { defaultKeymap } from '../../../input/keymap';
import { apiWithTracks, dawClientFor, REFUSALS, setupCapabilities, type TrackKind } from './fixtures';
import { RecordControl } from './RecordControl';
import { recordCheck } from './recordCheck';
import { SetupChip } from './SetupChip';
import { useRecordControl } from './useRecordControl';

afterEach(cleanup);

function wrapper(client: DawClient, statuses: Record<string, TrackKind> = {}) {
  return ({ children }: { children: ReactNode }) => (
    <ApiProvider api={apiWithTracks(statuses)}>
      <PortOverrides clients={{ daw: client }}>{children}</PortOverrides>
    </ApiProvider>
  );
}

const mic = { engine: 'builtin' as const, dawName: 'DAW', reachable: true, device: 'USB Mic', onDevice: vi.fn() };

function Booth({ chapterId, notify }: { chapterId: string; notify: (s: string) => void }) {
  const control = useRecordControl({ chapterId, notify });
  return (
    <>
      <BoothFooter
        record={<RecordControl control={control} />}
        seconds={0}
        recording={control.recording}
        why={control.reason}
        mic={mic}
        roomTone=""
        keymap={defaultKeymap()}
      />
      <button onClick={() => void control.toggle()}>space</button>
    </>
  );
}

function show(setup: DawSetupId, chapterId = 'c1', statuses: Record<string, TrackKind> = {}, client = dawClientFor(setup)) {
  const notify = vi.fn();
  const view = render(<Booth chapterId={chapterId} notify={notify} />, { wrapper: wrapper(client, statuses) });
  return { notify, client, ...view };
}
const record = () => screen.getByRole('button', { name: /^(record|stop)$/i }) as HTMLButtonElement;
// The text the control is described by, resolved through aria-describedby the way assistive tech does.
const described = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();

describe('Record preconditions on the Record control', () => {
  it('a-dawless-setup-disables-record-and-shows-the-capabilitys-reason', async () => {
    const { notify, client } = show('reaper-off');
    const reason = setupCapabilities('reaper-off').capabilities.record.message!;
    await waitFor(() => expect(record().disabled).toBe(true));
    expect(described(record())).toBe(reason);
    expect(record().getAttribute('aria-describedby')).toBe('brec-why');
    const start = vi.spyOn(client, 'recordStart');
    await userEvent.click(screen.getByText('space'));
    expect(notify).toHaveBeenCalledWith(reason);
    expect(start).not.toHaveBeenCalled();
  });

  it('one-chapter-one-track', async () => {
    show('reaper', 'none', { none: 'none' });
    await waitFor(() => expect(record().disabled).toBe(true));
    expect(described(record())).toBe(REFUSALS.none);
    cleanup();
    show('reaper', 'many', { many: 'several' });
    await waitFor(() => expect(record().disabled).toBe(true));
    expect(described(record())).toBe(REFUSALS.several);
    cleanup();
    show('reaper', 'one', { one: 'one' });
    await waitFor(() => expect(record().disabled).toBe(false));
    expect(document.getElementById('brec-why')).toBeNull();
  });

  it('the-built-in-recorder-needs-no-track', async () => {
    show('builtin', 'none', { none: 'none' });
    await waitFor(() => expect(record().disabled).toBe(false));
    expect(document.getElementById('brec-why')).toBeNull();
  });

  it('start-and-stop-go-through-the-daw-port', async () => {
    const { client } = show('reaper');
    const start = vi.spyOn(client, 'recordStart');
    const stop = vi.spyOn(client, 'recordStop');
    await waitFor(() => expect(record().disabled).toBe(false));
    expect(record().textContent).toBe('Record');
    await userEvent.click(record());
    expect(start).toHaveBeenCalledExactlyOnceWith('c1');
    await waitFor(() => expect(record().textContent).toBe('Stop'));
    await userEvent.click(record());
    expect(stop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(record().textContent).toBe('Record'));
  });

  it('a refused start shows the refusal and changes nothing', async () => {
    const client = dawClientFor('reaper', ['other']);
    show('reaper', 'c1', {}, client);
    await waitFor(() => expect(record().disabled).toBe(false));
    await userEvent.click(record());
    await waitFor(() => expect(described(record())).toBe(REFUSALS.none));
    expect(record().textContent).toBe('Record');
  });
});

describe('recordCheck', () => {
  it('recordCheck-is-one-pure-selector', () => {
    const reaper = setupCapabilities('reaper');
    const state = { tracks: 'one' as const, message: '' };
    expect(recordCheck(reaper, state)).toBeNull();
    expect(recordCheck(reaper, { tracks: 'none', message: REFUSALS.none })).toEqual({ code: 'no_track', reason: REFUSALS.none });
    expect(recordCheck(reaper, { tracks: 'several', message: REFUSALS.several })).toEqual({ code: 'several_tracks', reason: REFUSALS.several });
    expect(recordCheck(setupCapabilities('audacity'), state)?.code).toBe('capability');
    expect(recordCheck(setupCapabilities('builtin'), { ...state, tracks: 'none' })).toBeNull();
  });

  it('names no DAW in its sources', () => {
    const files = readdirSync(__dirname).filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f) && f !== 'fixtures.ts');
    expect(files).toContain('recordCheck.ts');
    for (const f of files) expect(readFileSync(join(__dirname, f), 'utf8'), f).not.toMatch(/REAPER|Audacity|built-in/);
  });
});

describe('SetupChip', () => {
  it('the-control-wording-comes-from-the-capability', () => {
    const { rerender } = render(<SetupChip capabilities={setupCapabilities('reaper')} standaloneName="Recorder" />);
    expect(screen.getByRole('group').textContent).toBe('REAPER');
    rerender(<SetupChip capabilities={setupCapabilities('audacity')} standaloneName="Recorder" />);
    expect(screen.getByRole('group').textContent).toBe('Audacity');
    rerender(<SetupChip capabilities={setupCapabilities('builtin')} standaloneName="Recorder" />);
    expect(screen.getByRole('group').textContent).toBe('Recorder');
  });

  // Blocked on SN-D41's DawProjectState read (#1163), not on main yet: the chip must not invent the read.
  it.todo("unsaved-changes-chip-text: the chip says so in the host's words once DawProjectState lands (#1163)");
});

describe('useRecordControl', () => {
  it('no-silent-stop-hook: exposes recording and startedByApp and does not stop on unmount', async () => {
    const client = dawClientFor('reaper');
    const stop = vi.spyOn(client, 'recordStop');
    const { result, unmount } = renderHook(() => useRecordControl({ chapterId: 'c1', notify: vi.fn() }), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.reason).toBe(''));
    expect(result.current).toMatchObject({ recording: false, startedByApp: true });
    await act(() => result.current.toggle());
    expect(result.current.recording).toBe(true);
    unmount();
    expect(stop).not.toHaveBeenCalled();
  });
});
