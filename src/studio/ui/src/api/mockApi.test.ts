import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyMixedManuscriptMock, createMockApi } from './mockApi';
import type { ManuscriptChapter, ManuscriptParagraph } from '../types';

// createMockApi() is the mock host used by the browser demo and by most component tests (imported by
// ApiProvider). Its credits functions are a JS mirror of src/studio/desktop/internal/credits.Render, and its install-job and template-library edge
// cases are otherwise only reached indirectly, if at all, through component tests. These exercise that
// behavior directly, against the public NarrationApi surface, rather than through a rendered component.

describe('applyMixedManuscriptMock (?mockManuscript=mixed)', () => {
  const chapters: ManuscriptChapter[] = [
    { id: 'c1', title: 'Chapter 1', index: 0, wordCount: 3182, status: 'not_started', contentKind: 'narration' },
    { id: 'c2', title: 'Chapter 2', index: 1, wordCount: 2044, status: 'not_started', contentKind: 'narration' },
  ];
  const paragraphs: ManuscriptParagraph[] = [{ id: 'p1', chapterId: 'c1', chapter: 'Chapter 1', index: 0, text: 'Once upon a time.', entityIds: [] }];

  it('adds a buttonless Front Matter row (contentKind opening) before the narration chapters, with a 3-digit count', () => {
    const mixed = applyMixedManuscriptMock(chapters, paragraphs);
    expect(mixed.chapters[0]).toMatchObject({ id: 'front-matter', contentKind: 'opening' });
    expect(String(mixed.chapters[0].wordCount)).toHaveLength(3);
    expect(mixed.chapters.slice(1).map((chapter) => chapter.id)).toEqual(['c1', 'c2']);
  });

  it('raises the first narration chapter to a 5-digit count, leaving the others alone', () => {
    const mixed = applyMixedManuscriptMock(chapters, paragraphs);
    expect(String(mixed.chapters[1].wordCount)).toHaveLength(5);
    expect(mixed.chapters[2].wordCount).toBe(2044);
  });

  it('gives the Front Matter row a paragraph, so its (buttonless, collapsed) card can still be expanded', () => {
    const mixed = applyMixedManuscriptMock(chapters, paragraphs);
    expect(mixed.paragraphs.filter((paragraph) => paragraph.chapterId === 'front-matter').length).toBe(1);
    expect(mixed.paragraphs).toHaveLength(paragraphs.length + 1);
  });
});

describe('createMockApi mockManuscript option', () => {
  it('is unchanged by default: no Front Matter row', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    expect(chapters.find((chapter) => chapter.id === 'front-matter')).toBeUndefined();
  });
});

describe('createMockApi chapters and paragraphs seed', () => {
  it('answers the seeded book instead of the Alice fixture', async () => {
    const chapters = [{ id: 'seeded-1', title: 'Seeded', index: 0, wordCount: 10, status: 'not_started' as const }];
    const paragraphs = [{ id: 'sp-1', chapterId: 'seeded-1', chapter: 'Seeded', index: 0, sourceLine: 1, text: 'Hello.', entityIds: [] }];
    const api = createMockApi({}, { chapters, paragraphs });
    // The credits of the library's templates are chapters around the seeded one.
    expect((await api.manuscriptChapters()).map((chapter) => chapter.id)).toEqual(['credits-opening', 'seeded-1', 'credits-closing']);
    expect((await api.manuscriptParagraphs('seeded-1')).map((paragraph) => paragraph.id)).toEqual(['sp-1']);
  });
});

describe('mockApi credits preview (renderMockCredits)', () => {
  it('keeps an optional {…} segment, with its own punctuation, when every token inside it resolves', async () => {
    const api = createMockApi();
    await api.saveCreditsProjectValues({ title: 'Bad Ideas Look Great in Neon', author: 'A. Writer', narrator: 'Sam' });

    const result = await api.creditsPreview('[Title], written by [Author]{, narrated by [Narrator]}.');

    expect(result.text).toBe('Bad Ideas Look Great in Neon, written by A. Writer, narrated by Sam.');
    expect(result.unresolved).toEqual([]);
  });

  it('drops an optional {…} segment whole, its punctuation included, when a token inside it is unresolved', async () => {
    const api = createMockApi();
    await api.saveCreditsProjectValues({ title: 'Neon', author: 'A. Writer' });

    const result = await api.creditsPreview('[Title], written by [Author]{, narrated by [Narrator]}.');

    // The dropped segment's own token never counts as unresolved: it was optional, not missing.
    expect(result.text).toBe('Neon, written by A. Writer.');
    expect(result.unresolved).toEqual([]);
  });

  it('still reports an unresolved token outside any optional segment', async () => {
    const api = createMockApi();
    await api.saveCreditsProjectValues({ author: 'A. Writer' });

    const result = await api.creditsPreview('[Title], written by [Author].');

    expect(result.text).toBe('[Title], written by A. Writer.');
    expect(result.unresolved).toEqual(['Title']);
  });

  it('treats an unterminated "{" as literal text, still resolving tokens around it', async () => {
    const api = createMockApi();
    await api.saveCreditsProjectValues({ author: 'A. Writer' });

    const result = await api.creditsPreview('By [Author] {');

    expect(result.text).toBe('By A. Writer {');
    expect(result.unresolved).toEqual([]);
  });

  it('falls back to the global narrator default when the project has not set its own narrator', async () => {
    const api = createMockApi();
    await api.saveSettings('General', 'global', { narrator_name: 'Global Narrator' });
    await api.saveCreditsProjectValues({ title: 'Neon' });

    const result = await api.creditsPreview('[Title], read by [Narrator].');

    expect(result.text).toBe('Neon, read by Global Narrator.');
  });
});

describe('mockApi credit template library', () => {
  it('updates a template in place when its id already exists in the library', async () => {
    const api = createMockApi();
    const [first] = await api.creditsTemplates();

    const updated = await api.saveCreditsTemplate(first.id, first.kind, 'Renamed', 'New body [Title].');

    expect(updated).toEqual({ id: first.id, kind: first.kind, name: 'Renamed', body: 'New body [Title].', builtIn: first.builtIn });
    const templates = await api.creditsTemplates();
    expect(templates.find((template) => template.id === first.id)).toEqual(updated);
  });

  it('adds a new entry, not builtIn, when saved with an id the library does not have (a stale or foreign id)', async () => {
    const api = createMockApi();

    const saved = await api.saveCreditsTemplate('not-in-the-library', 'closing', 'Custom', '[Title].');

    expect(saved).toEqual({ id: 'not-in-the-library', kind: 'closing', name: 'Custom', body: '[Title].', builtIn: false });
    const templates = await api.creditsTemplates();
    expect(templates.some((template) => template.id === 'not-in-the-library')).toBe(true);
  });

  it('duplicates an existing template as a new, editable "<name> copy" entry', async () => {
    const api = createMockApi();
    const [first] = await api.creditsTemplates();

    const duplicate = await api.duplicateCreditsTemplate(first.id);

    expect(duplicate).toMatchObject({ kind: first.kind, name: `${first.name} copy`, body: first.body, builtIn: false });
    expect(duplicate.id).not.toBe(first.id);
  });

  it('rejects duplicating a template id that is not in the library', async () => {
    const api = createMockApi();
    await expect(api.duplicateCreditsTemplate('nope')).rejects.toThrow('No credit template with id "nope"');
  });

  it('removes a template from the library', async () => {
    const api = createMockApi();
    const [first] = await api.creditsTemplates();

    await api.deleteCreditsTemplate(first.id);

    const templates = await api.creditsTemplates();
    expect(templates.some((template) => template.id === first.id)).toBe(false);
  });
});

describe('mockApi asset install edge cases (createInstallMock)', () => {
  it('joins an already-running install instead of starting a second one', async () => {
    const api = createMockApi();

    const first = await api.ttsInstall('en_US-ljspeech-high');
    const second = await api.ttsInstall('en_US-ljspeech-high');

    expect(second).toEqual(first);
  });

  it('rejects polling an unknown or already-finished-elsewhere install job id', async () => {
    const api = createMockApi();
    await expect(api.ttsInstallState('never-started')).rejects.toThrow('unknown voice install job');
  });

  it('rejects cancelling an unknown install job id', async () => {
    const api = createMockApi();
    await expect(api.ttsInstallCancel('never-started')).rejects.toThrow('unknown voice install job');
  });

  it('leaves an already-finished install job alone when asked to advance again', async () => {
    const api = createMockApi();
    const started = await api.ttsInstall('en_US-ljspeech-high');
    // Advance to 'success' and then poll once more: the mock's advance() falls through unchanged once a job is done.
    let state = await api.ttsInstallState(started.id);
    for (let guard = 0; guard < 10 && state.phase !== 'success'; guard += 1) state = await api.ttsInstallState(started.id);
    expect(state.phase).toBe('success');

    const polledAgain = await api.ttsInstallState(started.id);

    expect(polledAgain.phase).toBe('success');
  });
});

describe('mockApi preview voices (config/tts-assets.json)', () => {
  const catalog: Array<{ id: string; files: Array<{ size: number }> }> = JSON.parse(
    readFileSync(join(__dirname, '../../../../../config/tts-assets.json'), 'utf8'),
  ).voices;

  it('lists every approved voice, with its download size, in the voice catalog, the downloads list and the Preview voice choices', async () => {
    const api = createMockApi();
    const ids = catalog.map((voice) => voice.id);
    const sizes = catalog.map((voice) => voice.files.reduce((sum, file) => sum + file.size, 0));
    const voices = (await api.ttsCatalog()).voices;
    expect(voices.map((voice) => voice.id)).toEqual(ids);
    expect(voices.map((voice) => voice.downloadSize)).toEqual(sizes);
    const listed = (await api.assetsList()).assets.filter((asset) => asset.kind === 'tts');
    expect(listed.map((asset) => [asset.id, asset.downloadSize])).toEqual(ids.map((id, index) => [id, sizes[index]]));
    const piper = (await api.settingsForScope('global')).Piper;
    expect(piper.find((field) => field.key === 'tts_voice_id')?.choices).toEqual(ids);
  });

  it('downloads and removes a second voice on its own, leaving the first as it was', async () => {
    const api = createMockApi();
    const job = await api.assetsInstall('tts', 'en_GB-cori-high');
    let state = await api.assetsInstallState(job.id);
    for (let guard = 0; guard < 10 && state.phase !== 'success'; guard += 1) state = await api.assetsInstallState(job.id);
    expect(state).toMatchObject({ phase: 'success', assetId: 'en_GB-cori-high' });
    const installed = async () =>
      (await api.assetsList()).assets.filter((asset) => asset.kind === 'tts' && asset.installState === 'installed').map((asset) => asset.id);
    expect(await installed()).toEqual(['en_GB-cori-high']);
    await api.assetsRemove('tts', 'en_GB-cori-high');
    expect(await installed()).toEqual([]);
  });
});

describe('mockApi guideMarkReviewed (the host refuses an entry with suggestions to verify)', () => {
  it('refuses the whole entry while a suggestion about it needs verification, and clears nothing', async () => {
    const api = createMockApi();
    const before = (await api.guideEntities()).find((entity) => entity.id === 'white-rabbit');

    await expect(api.guideMarkReviewed('white-rabbit')).rejects.toThrow('Verify or reject its suggestions first.');

    expect((await api.guideEntities()).find((entity) => entity.id === 'white-rabbit')).toEqual(before);
  });

  it('marks an entry with nothing to verify reviewed', async () => {
    const api = createMockApi();

    await expect(api.guideMarkReviewed('mad-hatter')).resolves.toBeUndefined();
  });
});

describe('the mock host lists the Story Bible analysis tools as the real host does', () => {
  it('lists the three tools not installed, none with a reason it cannot be had', async () => {
    const api = createMockApi();
    const analysis = (await api.assetsList()).assets.filter((asset) => asset.kind === 'analysis');
    expect(analysis.map((tool) => [tool.id, tool.installState])).toEqual([
      ['gliner', 'not_installed'],
      ['booknlp-small', 'not_installed'],
      ['booknlp-big', 'not_installed'],
    ]);
    expect(analysis.filter((tool) => tool.unavailableReason)).toEqual([]);
  });
});
