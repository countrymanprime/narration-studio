// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { overlay } from '../../../overlay/overlayService';
import { useAnnouncePlayback } from './useAnnouncePlayback';

function Probe({ playing }: { playing: boolean }) {
  useAnnouncePlayback(playing);
  return null;
}
let said: string[];
beforeEach(() => {
  said = [];
  vi.spyOn(overlay, 'announce').mockImplementation((text) => void said.push(text));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('playback is announced when it starts and stops', () => {
  it('says nothing on first render, playing or not', () => {
    render(<Probe playing />);
    expect(said).toEqual([]);
  });

  it('says Playing when it starts and Stopped when it ends', () => {
    const view = render(<Probe playing={false} />);
    view.rerender(<Probe playing />);
    expect(said).toEqual(['Playing']);
    view.rerender(<Probe playing={false} />);
    expect(said).toEqual(['Playing', 'Stopped']);
  });

  it('says nothing when the state does not change', () => {
    const view = render(<Probe playing={false} />);
    view.rerender(<Probe playing={false} />);
    expect(said).toEqual([]);
  });
});
