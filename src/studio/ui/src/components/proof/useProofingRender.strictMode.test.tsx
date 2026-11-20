// @vitest-environment jsdom
// StrictMode mounts the hook, unmounts it and mounts it again: the instance that stays on screen must still take its own answers.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { NarrationApi } from '../../types';
import { useProofingRender } from './useProofingRender';

afterEach(cleanup);

function Probe() {
  const { phase, error } = useProofingRender('c1', vi.fn()) as unknown as { phase: string; error: string };
  return <p>{phase + ':' + error}</p>;
}

function renderStrict(over: Partial<NarrationApi>) {
  render(
    <StrictMode>
      <ApiProvider api={createMockApi(over)}>
        <Probe />
      </ApiProvider>
    </StrictMode>,
  );
}

describe('useProofingRender under StrictMode', () => {
  it('leaves loading once the read answers', async () => {
    renderStrict({ proofingRenderState: async () => ({ chapterId: 'c1', render: null }) as never });
    await waitFor(() => expect(screen.getByText(/^ready:/)).toBeTruthy());
  });

  it('shows a failed read', async () => {
    renderStrict({
      proofingRenderState: async () => {
        throw new Error('host down');
      },
    });
    await waitFor(() => expect(screen.getByText(/^error:.+/)).toBeTruthy());
  });
});
