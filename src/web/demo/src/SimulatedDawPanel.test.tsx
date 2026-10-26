// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMockApi } from '@ui/api/mockApi';
import { simulateDaw } from './simulatedDaw';
import { SimulatedDawPanel } from './SimulatedDawPanel';

const control = (reachable = true) => ({
  state: () => ({ daw: 'REAPER', reachable, openProject: 'linked' as const, recording: false }),
  quiet: vi.fn(),
  heartbeat: vi.fn(),
});

describe('the Simulated DAW panel', () => {
  it('is a labelled badge that opens to what the app asked the DAW, and shuts again', async () => {
    const sim = simulateDaw(createMockApi({}, {}));
    render(<SimulatedDawPanel sim={sim} control={() => control()} />);
    const badge = screen.getByRole('button', { name: /^Simulated DAW · REAPER/ });
    expect(screen.queryByRole('region', { name: 'Simulated DAW' })).toBeNull();

    await userEvent.click(badge);
    expect(screen.getByRole('region', { name: 'Simulated DAW' }).textContent).toContain('Nothing yet');
    const [chapter] = (await sim.api.manuscriptChapters()).filter((candidate) => candidate.index > 0);
    await act(async () => {
      await sim.api.dawGoToChapter(chapter.id, 'at', 12.4);
    });
    expect(screen.getByRole('region', { name: 'Simulated DAW' }).textContent).toContain(`Cursor moved to ${chapter.title} at 00:12.4`);

    await userEvent.click(badge);
    expect(screen.queryByRole('region', { name: 'Simulated DAW' })).toBeNull();
  });

  it('says when the DAW is not answering and offers to make it answer', async () => {
    const quiet = control(false);
    render(<SimulatedDawPanel sim={simulateDaw(createMockApi({}, {}))} control={() => quiet} />);
    await userEvent.click(screen.getByRole('button', { name: /^Simulated DAW/ }));
    expect(screen.getByRole('region', { name: 'Simulated DAW' }).textContent).toContain('Not answering');
    await userEvent.click(screen.getByRole('button', { name: 'Make it answer' }));
    expect(quiet.heartbeat).toHaveBeenCalledOnce();
  });

  it('offers the other DAW and an unlinked start, and restarts the demo with the scenario it names', async () => {
    const boot = vi.fn();
    render(<SimulatedDawPanel sim={simulateDaw(createMockApi({}, {}))} control={() => control()} boot={boot} />);
    await userEvent.click(screen.getByRole('button', { name: /^Simulated DAW/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Audacity' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start unlinked' }));
    expect(boot.mock.calls).toEqual([['audacity'], ['unlinked']]);
  });

  it('in the site window, draws no badge, opens when the page asks and tells the page what its badge says', async () => {
    const parent = { postMessage: vi.fn() } as unknown as Window & { postMessage: ReturnType<typeof vi.fn> };
    const spy = vi.spyOn(window, 'parent', 'get').mockReturnValue(parent);
    render(<SimulatedDawPanel sim={simulateDaw(createMockApi({}, {}))} control={() => control()} placement="window" />);
    expect(screen.queryByRole('button', { name: /^Simulated DAW/ })).toBeNull();
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      { channel: 'narration-site', kind: 'daw', daw: 'REAPER', answering: true, recording: false, open: false },
      '*',
    );

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { channel: 'narration-site', kind: 'daw-panel', open: true }, source: parent }));
    });
    expect(screen.getByRole('region', { name: 'Simulated DAW' })).toBeTruthy();
    expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'daw', open: true }), '*');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Simulated DAW' })).toBeNull();
    expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'daw', open: false }), '*');
    spy.mockRestore();
  });

  it('in the banner, opens its panel under the badge rather than floating in the corner', async () => {
    const { container } = render(<SimulatedDawPanel sim={simulateDaw(createMockApi({}, {}))} control={() => control()} placement="banner" />);
    expect(container.querySelector('.fixed')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Simulated DAW/ }));
    expect(screen.getByRole('region', { name: 'Simulated DAW' })).toBeTruthy();
    expect(container.querySelector('.fixed')).toBeNull();
  });
});
