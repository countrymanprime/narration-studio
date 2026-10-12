// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import type { GuideEntity } from '../../types';
import { overlay } from '../../overlay/overlayService';
import type { Notify } from '../primitives/Toast';
import { GuideDetail } from './GuideDetail';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

class PreviewAudio {
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);

  constructor(readonly src: string) {}
}

function readyPreviewApi() {
  const api = createMockApi();
  vi.spyOn(api, 'guidePreview').mockResolvedValue({ status: 'ready', audioBase64: 'UklGRg==', mimeType: 'audio/wav' });
  return api;
}

function renderReadyPreview(entity = WIRE_ENTITIES[1]) {
  const previews: PreviewAudio[] = [];
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    'Audio',
    class extends PreviewAudio {
      constructor(src: string) {
        super(src);
        previews.push(this);
      }
    },
  );
  render(
    <ApiProvider api={readyPreviewApi()}>
      <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
    </ApiProvider>,
  );
  return previews;
}

function renderDetail(entity: (typeof WIRE_ENTITIES)[number]) {
  render(
    <ApiProvider api={createMockApi()}>
      <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
    </ApiProvider>,
  );
}

describe('Story Bible locked entries', () => {
  it('offers neither Edit nor Save for a locked entry and keeps its fields read-only', () => {
    const entity = WIRE_ENTITIES.find((row) => row.locked);
    if (!entity) throw new Error('fixture must include a locked entity');
    renderDetail(entity);
    expect(screen.getByRole('heading', { name: entity.canonical_name })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit this entry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes to this entry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete entity' })).toBeNull();
  });
});

describe('Story Bible read-only entries (ADR-0018)', () => {
  const unlocked = () => {
    const entity = WIRE_ENTITIES.find((row) => !row.locked);
    if (!entity) throw new Error('fixture must include an unlocked entity');
    return entity;
  };

  it('opens read-only with no Save button until Edit is clicked', () => {
    const entity = unlocked();
    renderDetail(entity);
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes to this entry' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit this entry' })).toBeTruthy();
  });

  it('Edit enables the fields and shows Save and Cancel; Cancel restores read-only', () => {
    const entity = unlocked();
    renderDetail(entity);
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Save changes to this entry' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(screen.getByRole('heading', { name: entity.canonical_name })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save changes to this entry' })).toBeNull();
  });

  it('opens read-only under the name as a heading; Edit, then Save keeps and Cancel puts everything back', async () => {
    const entity = unlocked();
    const api = createMockApi();
    const guideEdit = vi.spyOn(api, 'guideEdit');
    render(
      <ApiProvider api={api}>
        <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
      </ApiProvider>,
    );
    // Read-only: the name is the heading, the description is text, nothing takes input.
    expect(screen.getByRole('heading', { name: entity.canonical_name })).toBeTruthy();
    expect(screen.getByText(entity.description.text)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull();

    // Edit turns the name and the description into fields, with Save and Cancel; Cancel puts everything back.
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Renamed' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'Rewritten' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(screen.getByRole('heading', { name: entity.canonical_name })).toBeTruthy();
    expect(screen.getByText(entity.description.text)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(guideEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveProperty('value', entity.canonical_name);

    // Save keeps the changes.
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes to this entry' }));
    await waitFor(() => expect(guideEdit).toHaveBeenCalledTimes(1));
    expect(guideEdit.mock.calls[0][1]).toMatchObject({ canonical_name: 'Renamed' });
  });
});

describe('Story Bible local TTS preview', () => {
  it('requires explicit approval before downloading a missing local voice and retries the preview', async () => {
    vi.stubGlobal('Audio', PreviewAudio);
    const api = createMockApi();
    render(
      <ApiProvider api={api}>
        <GuideDetail
          entity={WIRE_ENTITIES[0]}
          entities={WIRE_ENTITIES}
          reload={vi.fn().mockResolvedValue(undefined)}
          notify={vi.fn()}
          goToManuscript={vi.fn()}
        />
      </ApiProvider>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Play preview' })[0]);
    expect(await screen.findByRole('heading', { name: 'Download local preview voice?' })).toBeTruthy();
    expect(screen.getByText(/LJ Speech/)).toBeTruthy();
    expect(screen.getAllByText(/109 MB/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Download voice' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: /preview voice/i })).toBeNull());
  });

  it('shows the real bytes of the voice download and lets the narrator cancel it', async () => {
    vi.stubGlobal('Audio', PreviewAudio);
    const api = createMockApi({}, { assets: 'downloading' });
    render(
      <ApiProvider api={api}>
        <GuideDetail
          entity={WIRE_ENTITIES[0]}
          entities={WIRE_ENTITIES}
          reload={vi.fn().mockResolvedValue(undefined)}
          notify={vi.fn()}
          goToManuscript={vi.fn()}
        />
      </ApiProvider>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Play preview' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Download voice' }));

    expect(await screen.findByText(/of 109 MB/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('39'));
    expect(screen.getByText(/44 of 109 MB/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect((await screen.findAllByText('Voice download cancelled.')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says why the voice download failed and leaves the narrator able to try again', async () => {
    vi.stubGlobal('Audio', PreviewAudio);
    const api = createMockApi({}, { assets: 'download-fails' });
    render(
      <ApiProvider api={api}>
        <GuideDetail
          entity={WIRE_ENTITIES[0]}
          entities={WIRE_ENTITIES}
          reload={vi.fn().mockResolvedValue(undefined)}
          notify={vi.fn()}
          goToManuscript={vi.fn()}
        />
      </ApiProvider>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Play preview' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Download voice' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/did not match the approved one/);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getAllByRole('button', { name: 'Play preview' })[0]).toBeTruthy();
  });

  it('plays a ready preview without rendering a native audio control and toggles pause', async () => {
    const previews = renderReadyPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Play preview' }));
    await waitFor(() => expect(previews).toHaveLength(1));
    expect(previews[0].src).toBe('blob:preview');
    expect(previews[0].play).toHaveBeenCalledTimes(1);
    expect(document.querySelector('audio')).toBeNull();
    // The button flips to Pause only after the audio's play() promise settles, one step after the Audio object exists.
    expect(await screen.findByRole('button', { name: 'Pause preview' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Pause preview' }));
    expect(previews[0].pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Play preview' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play preview' }));
    await waitFor(() => expect(previews[0].play).toHaveBeenCalledTimes(2));
  });

  it('says why a preview failed and leaves Play usable for another try', async () => {
    const previews: PreviewAudio[] = [];
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
    vi.stubGlobal(
      'Audio',
      class extends PreviewAudio {
        constructor(src: string) {
          super(src);
          previews.push(this);
        }
      },
    );
    const api = createMockApi();
    const guidePreview = vi
      .spyOn(api, 'guidePreview')
      .mockRejectedValueOnce('"Dawnspire" could not be spoken: the voice produced no audio for it.')
      .mockResolvedValue({ status: 'ready', audioBase64: 'UklGRg==', mimeType: 'audio/wav' });
    const notify = vi.fn();
    render(
      <ApiProvider api={api}>
        <GuideDetail
          entity={WIRE_ENTITIES[1]}
          entities={WIRE_ENTITIES}
          reload={vi.fn().mockResolvedValue(undefined)}
          notify={notify}
          goToManuscript={vi.fn()}
        />
      </ApiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play preview' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('"Dawnspire" could not be spoken: the voice produced no audio for it.', 'error'));
    const play = screen.getByRole('button', { name: 'Play preview' });
    expect((play as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(play);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause preview' })).toBeTruthy());
    expect(guidePreview).toHaveBeenCalledTimes(2);
    expect(previews).toHaveLength(1);
  });

  it('shows the host failure the mock preview-error seam simulates once the voice is installed', async () => {
    vi.stubGlobal('Audio', PreviewAudio);
    const api = createMockApi({}, { previewError: 'the preview voice could not be loaded (missing file)' });
    let installing = await api.ttsInstall('en_US-ljspeech-high');
    while (installing.phase !== 'success') installing = await api.ttsInstallState(installing.id);
    const notify = vi.fn();
    render(
      <ApiProvider api={api}>
        <GuideDetail
          entity={WIRE_ENTITIES[1]}
          entities={WIRE_ENTITIES}
          reload={vi.fn().mockResolvedValue(undefined)}
          notify={notify}
          goToManuscript={vi.fn()}
        />
      </ApiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play preview' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('The preview voice could not be loaded (missing file)', 'error'));
    expect(screen.getByRole('button', { name: 'Play preview' })).toBeTruthy();
  });

  it('stops the active preview when switching to an alias and clears playback when it ends', async () => {
    const previews = renderReadyPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Play preview' }));
    await waitFor(() => expect(previews).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Play alias pronunciation' }));
    await waitFor(() => expect(previews).toHaveLength(2));

    expect(previews[0].pause).toHaveBeenCalledTimes(1);
    expect(previews[1].play).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Pause alias pronunciation' })).toBeTruthy();

    previews[1].onended?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play alias pronunciation' })).toBeTruthy());
  });
});

describe('Story Bible delete confirmation', () => {
  it('is a red alertdialog that keeps focus inside and hands it back to Delete entity on Escape', async () => {
    const entity = WIRE_ENTITIES.find((row) => !row.locked);
    if (!entity) throw new Error('fixture must include an unlocked entity');
    const user = userEvent.setup();
    renderDetail(entity);
    // Delete only exists in edit mode (ADR 0087).
    await user.click(screen.getByRole('button', { name: 'Edit this entry' }));
    const opener = screen.getByRole('button', { name: 'Delete entity' });
    await user.click(opener);

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete entry' });
    expect(within(dialog).getByRole('button', { name: 'Delete entry' }).className).toContain('text-[var(--danger-text)]');
    // The page behind is out of the accessibility tree while the dialog is open.
    expect(screen.queryByRole('button', { name: 'Save changes to this entry' })).toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(screen.getByRole('button', { name: 'Save changes to this entry' })).toBeTruthy();
  });
});

describe('Story Bible Appears in', () => {
  const entity = {
    ...WIRE_ENTITIES[0],
    appearances: [
      { chapterId: 'chapter-1', chapter: 'chapter-1', sceneIndex: 0 },
      { chapterId: 'chapter-1', chapter: 'chapter-1', sceneIndex: 1 },
      { chapterId: 'chapter-2', chapter: 'chapter-2', sceneIndex: 0 },
    ],
  };
  // The page reads the chapters once and hands them down (Guide.tsx).
  const chapters = [
    { id: 'chapter-1', title: 'Chapter 1' },
    { id: 'chapter-2', title: 'Chapter 2' },
  ];

  it('lists the chapters after the editable parts and opens one in Script', async () => {
    const goToManuscript = vi.fn();
    render(
      <ApiProvider api={createMockApi()}>
        <GuideDetail
          entity={entity}
          entities={WIRE_ENTITIES}
          chapters={chapters}
          reload={vi.fn().mockResolvedValue(undefined)}
          notify={vi.fn()}
          goToManuscript={goToManuscript}
        />
      </ApiProvider>,
    );
    expect(await screen.findByText('Appears in · 2 chapters')).toBeTruthy();
    const section = screen.getByTestId('appears-in');
    const relationships = screen.getByText('Relationship');
    expect(relationships.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(within(section).getAllByRole('button')[0]);
    expect(goToManuscript).toHaveBeenCalledWith('chapter-1');
  });

  it('Appears in sits after the editable parts', () => {
    render(
      <ApiProvider api={createMockApi()}>
        <GuideDetail
          entity={{ ...entity, category: 'Character' }}
          entities={WIRE_ENTITIES}
          chapters={chapters}
          reload={vi.fn()}
          notify={vi.fn()}
          goToManuscript={vi.fn()}
        />
      </ApiProvider>,
    );
    const appears = screen.getByTestId('appears-in');
    for (const label of ['Description', 'How they talk', 'How they act', 'What they know', 'Properties', 'Relationships']) {
      const part = screen.getAllByText(label)[0];
      expect(part.compareDocumentPosition(appears) & Node.DOCUMENT_POSITION_FOLLOWING, label).toBeTruthy();
    }
  });

  it('shows no line or mention counts', async () => {
    render(
      <ApiProvider api={createMockApi()}>
        <GuideDetail
          entity={entity}
          entities={WIRE_ENTITIES}
          chapters={chapters}
          reload={vi.fn().mockResolvedValue(undefined)}
          notify={vi.fn()}
          goToManuscript={vi.fn()}
        />
      </ApiProvider>,
    );
    await screen.findByText('Appears in · 2 chapters');
    expect(screen.queryByText(/occurrences/i)).toBeNull();
    expect(screen.queryByText(/Evidence/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Go to line in Script' })).toBeNull();
  });

  it('says so for an entry written before appearances existed', async () => {
    const legacy = { ...entity } as Partial<typeof entity>;
    delete legacy.appearances;
    render(
      <ApiProvider api={createMockApi()}>
        <GuideDetail
          entity={legacy as typeof entity}
          entities={WIRE_ENTITIES}
          reload={vi.fn().mockResolvedValue(undefined)}
          notify={vi.fn()}
          goToManuscript={vi.fn()}
        />
      </ApiProvider>,
    );
    expect(await screen.findByText('Not listed yet. Build the Story Bible again to list the chapters.')).toBeTruthy();
  });
});

describe('speaker colour field in the entry', () => {
  it('puts the colour back to Automatic with one host call', async () => {
    const api = createMockApi();
    const call = vi.spyOn(api, 'guideSetSpeakerColor');
    const row = { ...WIRE_ENTITIES.find((entity) => entity.category === 'Character' && !entity.locked)!, speaker_color: 3 };
    render(
      <ApiProvider api={api}>
        <GuideDetail entity={row} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
      </ApiProvider>,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Speaker colour' }), { target: { value: 'auto' } });
    await waitFor(() => expect(call).toHaveBeenCalledWith(row.id, 0));
  });

  it('is not offered on a place', () => {
    const place = WIRE_ENTITIES.find((entity) => entity.category === 'Place')!;
    render(
      <ApiProvider api={createMockApi()}>
        <GuideDetail entity={place} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
      </ApiProvider>,
    );
    expect(screen.queryByRole('combobox', { name: 'Speaker colour' })).toBeNull();
  });
});

// SNB-3b: the flags in the detail, Mark reviewed for the entry and for one name, and the block while a suggestion is still to be verified.
describe('mark-reviewed-in-the-detail', () => {
  const cat = (over: Partial<GuideEntity> = {}): GuideEntity => ({
    ...WIRE_ENTITIES.find((row) => row.id === 'cheshire-cat')!,
    review: { entry: true, aliases: ['Cat'] },
    ...over,
  });
  function renderReview(entity: GuideEntity, { toVerify = 0, notify = vi.fn<Notify>() }: { toVerify?: number; notify?: Notify } = {}) {
    const api = createMockApi();
    const calls = { mark: vi.spyOn(api, 'guideMarkReviewed'), flag: vi.spyOn(api, 'guideFlagReview') };
    const reload = vi.fn().mockResolvedValue(undefined);
    const toast = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    render(
      <ApiProvider api={api}>
        <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={reload} notify={notify} goToManuscript={vi.fn()} toVerify={toVerify} />
      </ApiProvider>,
    );
    return { ...calls, reload, toast, notify };
  }

  it('mark-reviewed-clears-the-entry-and-its-names: the button calls guideMarkReviewed(id) and the list reloads', async () => {
    const { mark, reload } = renderReview(cat());
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(reload).toHaveBeenCalledWith('cheshire-cat'));
    expect(mark.mock.calls).toEqual([['cheshire-cat']]);
  });

  it("a name's own button calls guideMarkReviewed with the alias index", async () => {
    const { mark, reload } = renderReview(cat());
    fireEvent.click(screen.getByRole('button', { name: 'Mark Cat reviewed' }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(mark.mock.calls).toEqual([['cheshire-cat', 0]]);
  });

  it('editor-shows-the-flags: the entry and each flagged name show Needs review, and a clean name has no button', () => {
    renderReview(cat({ review: { entry: true, aliases: ['Cat'] } }));
    expect(screen.getAllByText('Needs review')).toHaveLength(2);
    expect(within(screen.getByRole('list', { name: 'Names' })).getAllByText('Needs review')).toHaveLength(1);
    cleanup();
    renderReview(cat({ review: { entry: true, aliases: [] } }));
    expect(screen.queryByRole('button', { name: 'Mark Cat reviewed' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark reviewed' })).toBeTruthy();
  });

  it('shows neither a flag nor a button on an entry that needs nothing', () => {
    renderReview(cat({ review: { entry: false, aliases: [] }, review_state: 'reviewed' }));
    expect(screen.queryByText('Needs review')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull();
  });

  it('blocked-while-anything-needs-verification: the button is off with the reason and no call is made', () => {
    const { mark } = renderReview(cat(), { toVerify: 2 });
    const button = screen.getByRole('button', { name: 'Mark reviewed' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByRole('group', { name: 'Verify or reject its suggestions first.' })).toBeTruthy();
    fireEvent.click(button);
    expect(mark).not.toHaveBeenCalled();
  });

  it('an entry with only suggestions to verify shows the flag but no Mark reviewed button', () => {
    renderReview(cat({ review: { entry: false, aliases: [] }, review_state: 'reviewed' }), { toVerify: 1 });
    expect(screen.getAllByText('Needs review').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull();
  });

  it('mark-reviewed-can-be-undone: Undo in the toast calls guideFlagReview to put the same flags back', async () => {
    const { toast, flag } = renderReview(cat());
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0][0]).toBe('“Cheshire Cat” reviewed.');
    expect(flag).not.toHaveBeenCalled();
    await expect(toast.mock.calls[0][1]()).resolves.toEqual({ ok: true });
    expect(flag.mock.calls).toEqual([['cheshire-cat'], ['cheshire-cat', 0]]);
  });

  it('undoing a name puts that name back and nothing else', async () => {
    const { toast, flag, reload } = renderReview(cat());
    fireEvent.click(screen.getByRole('button', { name: 'Mark Cat reviewed' }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0][0]).toBe('“Cat” reviewed.');
    reload.mockClear();
    await toast.mock.calls[0][1]();
    expect(flag.mock.calls).toEqual([['cheshire-cat', 0]]);
    expect(reload).toHaveBeenCalled();
  });

  it('undo puts back only the flags the entry had: a name-only flag does not flag the entry', async () => {
    const { toast, flag } = renderReview(cat({ review: { entry: false, aliases: ['Cat'] } }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    await toast.mock.calls[0][1]();
    expect(flag.mock.calls).toEqual([['cheshire-cat', 0]]);
  });

  it('a refused undo answers the host sentence for the toast', async () => {
    const { toast, flag } = renderReview(cat());
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    flag.mockRejectedValueOnce(new Error('This entity is locked. Unlock it before editing.'));
    await expect(toast.mock.calls[0][1]()).resolves.toEqual({ ok: false, refusal: { reason: 'This entity is locked. Unlock it before editing.' } });
  });

  it('a refusal is the host sentence in a toast, with no Undo offered', async () => {
    const { notify, toast, mark } = renderReview(cat());
    mark.mockRejectedValueOnce(new Error('This entity is locked. Unlock it before editing.'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Error: This entity is locked. Unlock it before editing.', 'error'));
    expect(toast).not.toHaveBeenCalled();
  });

  it('one name at a time: the pressed button is busy while the call runs', async () => {
    const { mark } = renderReview(cat());
    let finish!: () => void;
    mark.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Cat reviewed' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark Cat reviewed' }).getAttribute('aria-busy')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    expect(mark).toHaveBeenCalledTimes(1);
    finish();
  });
});
