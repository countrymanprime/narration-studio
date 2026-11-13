// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { UnsavedDraftsProvider, useUnsavedDrafts } from '../../studio/drafts/unsavedDrafts';
import { PickupListCount } from './PickupListCount';
import { ProofPickupNotes } from './ProofPickupNotes';

// Check recordings opens over every page, so its links leave a page that may hold a draft: they take the shell's guarded move (#3446 D2).
function Shell({ go }: { go: (to: string) => void }) {
  const { setShell } = useUnsavedDrafts();
  useEffect(() => {
    setShell({ ask: vi.fn(), go });
    return () => setShell(null);
  }, [setShell, go]);
  return null;
}

describe('the links inside Check recordings ask like the nav does', () => {
  it('Open Proof and Open pickups take the guarded move', () => {
    const go = vi.fn();
    render(
      <MemoryRouter>
        <UnsavedDraftsProvider>
          <Shell go={go} />
          <ProofPickupNotes chapterId="ch 1" count={2} />
          <PickupListCount available remaining={3} />
        </UnsavedDraftsProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Open Proof' }));
    expect(go).toHaveBeenLastCalledWith('/proof?chapter=ch%201', undefined);
    fireEvent.click(screen.getByRole('link', { name: 'Open pickups' }));
    expect(go).toHaveBeenLastCalledWith('/pickups', undefined);
  });
});
