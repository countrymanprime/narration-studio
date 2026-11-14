// @vitest-environment jsdom
// The entry editor's holder meets the contract on `UnsavedDraft.save`: once the registry's save resolves, the editor renders clean (#3400).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import { overlay } from '../../overlay/overlayService';
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

describe('a name typed in "Add a name"', () => {
  const mount = () => {
    const api = createMockApi();
    const notify = vi.fn();
    render(
      <ApiProvider api={api}>
        <UnsavedDraftsProvider>
          <RegistryProbe />
          <GuideDetail entity={hatter} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={notify} goToManuscript={vi.fn()} />
        </UnsavedDraftsProvider>
      </ApiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    return { api, notify };
  };

  it("is held, with nothing to save, and the entry's own Save refuses and says what to do (#3457)", async () => {
    const { api, notify } = mount();
    const guideEdit = vi.spyOn(api, 'guideEdit');
    fireEvent.change(screen.getByRole('textbox', { name: 'Add a name' }), { target: { value: 'Mad H' } });
    const held = registry.heldNow();
    expect(held).toHaveLength(1);
    expect(held[0]!.saveable).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes to this entry' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('The name “Mad H” you are adding still needs Add name, so the entry was not saved.'));
    expect(guideEdit).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox', { name: 'Add a name' }) as HTMLInputElement).value).toBe('Mad H');
  });

  it("a relationship row half filled refuses the entry's Save in its own words (#3457)", async () => {
    const { notify } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add a relationship' }));
    const rows = screen.getAllByRole('combobox', { name: 'Relationship' });
    fireEvent.change(rows[rows.length - 1]!, { target: { value: 'hates' } });
    fireEvent.blur(rows[rows.length - 1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes to this entry' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('A relationship you started still needs an entry chosen under To, so the entry was not saved.'));
  });

  it('Escape in the box asks, and Keep editing leaves the text; with nothing typed it clears at once (#3457)', async () => {
    const confirm = vi.spyOn(overlay, 'confirm').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mount();
    const box = screen.getByRole('textbox', { name: 'Add a name' }) as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'Mad H' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(box.value).toBe('Mad H');
    fireEvent.keyDown(box, { key: 'Escape' });
    await waitFor(() => expect(box.value).toBe(''));
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
