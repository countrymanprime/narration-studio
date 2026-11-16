// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnginePanelProvider } from '../engine/EnginePanelContext';
import { CauseAction } from './StageEvidence';

afterEach(cleanup);

// #3416 item 60: the "Open the audio engine panel" pointer in a Stage readiness slide-over opened the engine panel without closing the slide-over, so they stacked.
describe('Stage evidence: the engine pointer', () => {
  it('closes the slide-over it sits in as it opens the engine panel', () => {
    const openEngine = vi.fn();
    const onClose = vi.fn();
    render(
      <EnginePanelProvider value={openEngine}>
        <CauseAction resolve="engine" openLabel="Open" onCheckNow={vi.fn()} onOpenCheck={vi.fn()} onClose={onClose} />
      </EnginePanelProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open the audio engine panel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(openEngine).toHaveBeenCalledTimes(1);
  });
});
