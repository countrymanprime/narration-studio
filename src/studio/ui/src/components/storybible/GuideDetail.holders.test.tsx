// @vitest-environment jsdom
// The entry editor's holder meets the contract on `UnsavedDraft.save`: once the registry's save resolves, the editor renders clean (#3400).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import { expectHolderCleanAfterSave } from '../../studio/drafts/holderContract';
import { UnsavedDraftsProvider, useUnsavedDrafts } from '../../studio/drafts/unsavedDrafts';
import { GuideDetail } from './GuideDetail';

afterEach(() => cleanup());

const hatter = WIRE_ENTITIES.find((row) => row.id === 'mad-hatter')!;
let registry: ReturnType<typeof useUnsavedDrafts>;
function RegistryProbe() {
  registry = useUnsavedDrafts();
  return null;
}

// holder: storybible/GuideDetail.tsx
describe('the entry editor as an unsaved-draft holder', () => {
  it('renders clean once the registry has saved a renamed entry', async () => {
    const api = createMockApi();
    const guideEdit = vi.spyOn(api, 'guideEdit');
    render(
      <ApiProvider api={api}>
        <UnsavedDraftsProvider>
          <RegistryProbe />
          <GuideDetail entity={hatter} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
        </UnsavedDraftsProvider>
      </ApiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'The Mad Hatter' } });
    expect(registry.heldNow().length).toBe(1);
    await expectHolderCleanAfterSave(() => registry.save());
    expect(guideEdit).toHaveBeenCalledTimes(1);
    expect(registry.heldNow()).toEqual([]);
  });
});
