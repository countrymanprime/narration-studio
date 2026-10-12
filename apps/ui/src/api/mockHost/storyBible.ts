// The mock host (mockApi.ts): the Story Bible.
import { parseWireJson } from '../wire/parseWire';
import { guidePropertiesSchema } from '../schemas/storyBible';
import type { GuideEntity, GuidePronunciation, GuideProperty, NarrationApi, WorkJob } from '../../types';
import { wireClone } from '../mockFixtures';
import { type MockApiSeed, type MockState, wireContext } from './state';
import { type AssetsMock, MOCK_ASSET_ROOT } from './assets';

/** What the sidecar does with the `properties` value of an edit: a JSON list of pairs, a name on every one and no name twice (whatever its case). */
function parseMockProperties(text: string): GuideProperty[] {
  const seen = new Set<string>();
  return parseWireJson(guidePropertiesSchema, text, wireContext('mock properties')).map((row, index) => {
    const key = row.key.trim();
    if (!key) throw new Error(`Property ${index + 1} has no name.`);
    if (seen.has(key.toLowerCase())) throw new Error(`There are two properties named '${key}'; give each a different name.`);
    seen.add(key.toLowerCase());
    return { key, value: row.value.trim() };
  });
}

/**
 * A real, silent 22.05 kHz mono WAV (a 44-byte header and 200 bytes of samples). The Story Bible preview hook
 * rejects an empty payload (the host never sends one), so the mock must send audio.
 */
const MOCK_PREVIEW_WAV_BASE64 =
  'UklGRuwAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YcgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

// A pronunciation the narrator typed: `manual` (ADR 0792), or `user` in a file written before it.
const isUser = (value: { source?: string }) => value.source === 'user' || value.source === 'manual';

function setPronunciation(prior: GuidePronunciation, next: GuidePronunciation): GuidePronunciation {
  const value: GuidePronunciation = { ipa: next.ipa, source: next.source, confidence: next.confidence, chosen: next.chosen };
  if (prior.status) value.status = prior.status === 'author_confirmed' && prior.ipa !== next.ipa ? 'researched' : prior.status;
  if (prior.note) value.note = prior.note;
  if (prior.ipa && isUser(prior) !== isUser(next)) value.alternate = { ipa: prior.ipa, source: prior.source, confidence: prior.confidence };
  else if (prior.alternate) value.alternate = prior.alternate;
  return value;
}

export function createStoryBibleMock(
  s: MockState,
  initial: MockApiSeed,
  manuscriptReady: Promise<void>,
  {
    spacyInstalled,
    ttsInstalled,
    mockLanguageModel,
    mockVoiceIdentity,
    mockVoice,
  }: Pick<AssetsMock, 'spacyInstalled' | 'ttsInstalled' | 'mockLanguageModel' | 'mockVoiceIdentity' | 'mockVoice'>,
) {
  let storyBibleJob: WorkJob = initial.rebuildRunning
    ? {
        id: 'mock-guide-running',
        kind: 'story_bible',
        phase: 'running',
        message: 'Extracting names and terms',
        percent: 45,
        logs: ['Reading canonical manuscript', 'Read 240 paragraphs in 3 chapters', 'Extracting names and terms'],
        elapsed: 12,
      }
    : { id: null, kind: 'story_bible', phase: 'idle', message: 'Ready to build.', percent: 0, logs: [], elapsed: 0 };
  // The sidecar's rules (manuscript_guide.py set_pronunciation): the narrator's own and a dictionary's pronunciation sit
  // side by side, the one not in use kept as the alternate; an author confirmation is withdrawn when the IPA in use changes.
  const changePronunciation = (id: string, aliasIndex: number | undefined, change: (prior: GuidePronunciation) => GuidePronunciation) => {
    const entity = s.entities.find((row) => row.id === id);
    if (!entity) throw new Error('Entity not found.');
    if (entity.locked) throw new Error('This entity is locked. Unlock it before editing.');
    if (aliasIndex !== undefined && !entity.aliases[aliasIndex]) throw new Error('Alias index out of range.');
    const prior = aliasIndex === undefined ? entity.pronunciation : entity.aliases[aliasIndex].pronunciation;
    const value = change(prior);
    updateEntity(id, (row) =>
      aliasIndex === undefined
        ? { ...row, pronunciation: value }
        : { ...row, aliases: row.aliases.map((alias, index) => (index === aliasIndex ? { ...alias, pronunciation: value } : alias)) },
    );
  };
  const updateEntity = (id: string, change: (entity: GuideEntity) => GuideEntity) => {
    s.entities = s.entities.map((entity) => (entity.id === id ? change(entity) : entity));
  };
  // The review flags and speaker colour calls (SNB-3b, SNB-4b), refused on a locked entry like every edit.
  const editableEntity = (id: string): GuideEntity => {
    const entity = s.entities.find((row) => row.id === id);
    if (!entity) throw new Error('Entity not found.');
    if (entity.locked) throw new Error('This entity is locked. Unlock it before editing.');
    return entity;
  };
  const reviewOf = (entity: GuideEntity) => entity.review ?? { entry: entity.review_state === 'needs review', aliases: [] };
  const aliasTextAt = (entity: GuideEntity, aliasIndex: number | undefined): string | undefined => {
    if (aliasIndex === undefined) return undefined;
    const alias = entity.aliases[aliasIndex];
    if (!alias) throw new Error('Alias index out of range.');
    return alias.text;
  };
  const bindings = {
    guideBuild: async (options) => {
      // The first-use gate: the selected language model is an asset, so nothing starts until the narrator chooses to download it or to
      // build without it this once.
      if (!spacyInstalled() && !options?.rulesOnly) {
        return {
          status: 'asset_required' as const,
          model: mockLanguageModel,
          installState: 'not_installed' as const,
          downloadSize: 12806118,
          diskSize: 15251718,
          installPath: MOCK_ASSET_ROOT + '/spacy/en_core_web_sm/3.8.0',
        };
      }
      if (initial.build) {
        const running: WorkJob = {
          id: 'mock-guide',
          kind: 'story_bible',
          phase: 'running',
          message: 'Extracting names and terms',
          percent: 30,
          logs: ['Reading canonical manuscript', 'Read 221 paragraphs in 5 chapters', 'Extracting names and terms'],
          elapsed: 4,
        };
        const failure = 'The language model could not be loaded: the model folder is missing its config.cfg.';
        storyBibleJob = initial.build === 'hold' ? running : { ...running, phase: 'error', message: failure, error: failure, logs: [...running.logs, failure] };
        if (initial.build === 'fails') s.endJob({ id: 'mock-guide', kind: 'story_bible', outcome: 'error', message: failure, durationMs: 4000 });
        return { status: 'started' as const, job: wireClone(running) };
      }
      const message = options?.rulesOnly
        ? 'Story Bible rebuild complete with the rules-only extraction, which is lower quality than a language model.'
        : 'Story Bible rebuild complete.';
      storyBibleJob = {
        id: 'mock-guide',
        kind: 'story_bible',
        phase: 'success',
        message,
        percent: 100,
        logs: ['Reading canonical manuscript', 'Built Story Bible with 7 entities'],
        elapsed: 1,
        result: { message: 'Story Bible rebuilt.' },
      };
      s.endJob({ id: 'mock-guide', kind: 'story_bible', outcome: 'success', message, durationMs: 1000 });
      return { status: 'started' as const, job: wireClone(storyBibleJob) };
    },
    guideBuildState: async () => wireClone(storyBibleJob),
    clearProjectData: async () => {},
    guideEntities: async () => {
      await manuscriptReady;
      return wireClone(s.entities);
    },
    guideEdit: async (id, values) => {
      // A Python process that has not answered yet: the Save button stays busy, so its look can be seen (`?mockHoldEdits=1`).
      if (initial.holdEdits) await new Promise<void>(() => {});
      return updateEntity(id, (entity) => ({
        ...entity,
        canonical_name: values.canonical_name ?? entity.canonical_name,
        category: values.category ?? entity.category,
        description: values.description === undefined ? entity.description : { text: values.description, evidence: {} },
        personality_notes: values.personality === undefined ? entity.personality_notes : values.personality ? [{ text: values.personality, evidence: {} }] : [],
        context: values.context ?? entity.context,
        properties: values.properties === undefined ? entity.properties : parseMockProperties(values.properties),
        aliases:
          values.aliases === undefined
            ? entity.aliases
            : values.aliases
                .split(';')
                .map((text) => text.trim())
                .filter(Boolean)
                .map(
                  (text) =>
                    entity.aliases.find((alias) => alias.text === text) ?? {
                      text,
                      pronunciation: { ipa: '', source: 'Piper', confidence: 'pending' },
                      occurrences: [],
                    },
                ),
      }));
    },
    guideSetLocked: async (id, locked) => updateEntity(id, (entity) => ({ ...entity, locked })),
    guideRescan: async (id) =>
      updateEntity(id, (entity) => ({
        ...entity,
        aliases: entity.aliases.map((alias) =>
          alias.occurrences.length
            ? alias
            : {
                ...alias,
                pronunciation: { ipa: '/generated/', source: 'Piper', confidence: 'generated' },
                occurrences: [{ chapter: 'Chapter 2', paragraph: 1, sourceLine: 17, excerpt: `Found a mention of ${alias.text} while scanning Chapter 2.` }],
              },
        ),
        occurrence_count: entity.occurrences.length + entity.aliases.reduce((sum, alias) => sum + (alias.occurrences.length || 1), 0),
      })),
    guideCreate: async (name, category, aliases) => {
      const id = `new-${s.nextId++}`;
      s.entities = [
        ...s.entities,
        {
          id,
          canonical_name: name || 'New entity',
          category: category || 'Draft',
          locked: false,
          review_state: 'draft',
          pronunciation: { ipa: '', source: 'Piper', confidence: 'pending' },
          description: { text: '', evidence: {} },
          personality_notes: [],
          properties: [],
          context: '',
          aliases: aliases.map((text) => ({ text, pronunciation: { ipa: '', source: 'Piper', confidence: 'pending' }, occurrences: [] })),
          relationships: [],
          occurrences: [],
          occurrence_count: 0,
        },
      ];
      return id;
    },
    guideMerge: async (sourceId, targetId) => {
      const source = s.entities.find((entity) => entity.id === sourceId);
      const target = s.entities.find((entity) => entity.id === targetId);
      if (!source || !target || source.locked) return;
      const names = [{ text: source.canonical_name, pronunciation: source.pronunciation, occurrences: source.occurrences }, ...source.aliases];
      const aliases = [...target.aliases];
      names.forEach((candidate) => {
        if (
          candidate.text.toLowerCase() !== target.canonical_name.toLowerCase() &&
          !aliases.some((alias) => alias.text.toLowerCase() === candidate.text.toLowerCase())
        )
          aliases.push(candidate);
      });
      updateEntity(targetId, (entity) => ({
        ...entity,
        aliases,
        occurrences: [...entity.occurrences, ...source.occurrences],
        relationships: [...entity.relationships, ...source.relationships.filter((relationship) => relationship.id !== targetId)],
      }));
      s.entities = s.entities
        .filter((entity) => entity.id !== sourceId)
        .map((entity) => ({
          ...entity,
          relationships: entity.relationships
            .map((relationship) => (relationship.id === sourceId ? { ...relationship, id: targetId, name: target.canonical_name } : relationship))
            .filter((relationship, index, rows) => rows.findIndex((item) => item.id === relationship.id && item.label === relationship.label) === index),
        }));
    },
    guideDelete: async (id) => {
      s.entities = s.entities
        .filter((entity) => entity.id !== id)
        .map((entity) => ({ ...entity, relationships: entity.relationships.filter((relationship) => relationship.id !== id) }));
    },
    guideRelate: async (id, otherId, label) =>
      updateEntity(id, (entity) => ({
        ...entity,
        relationships: entity.relationships.some((relationship) => relationship.id === otherId && relationship.label === label)
          ? entity.relationships
          : [...entity.relationships, { id: otherId, name: s.entities.find((row) => row.id === otherId)?.canonical_name ?? otherId, label }],
      })),
    guideUnrelate: async (id, otherId, label) =>
      updateEntity(id, (entity) => ({
        ...entity,
        relationships: entity.relationships.filter((relationship) => !(relationship.id === otherId && relationship.label === label)),
      })),
    guidePreview: async () => {
      if (!ttsInstalled()) {
        return {
          status: 'asset_required' as const,
          voice: mockVoiceIdentity,
          installState: 'not_installed' as const,
          downloadSize: mockVoice.downloadSize,
          diskSize: mockVoice.downloadSize,
          installPath: MOCK_ASSET_ROOT + '/tts/piper/en_US-ljspeech-high',
        };
      }
      // The failing seam behind ?mockPreviewError=<text>, so a real host failure can be seen without a host.
      if (initial.previewError) throw new Error(initial.previewError);
      return { status: 'ready' as const, audioBase64: MOCK_PREVIEW_WAV_BASE64, mimeType: 'audio/wav' };
    },
    guidePronounce: async (id, source, aliasIndex) => {
      const entity = s.entities.find((row) => row.id === id);
      if (!entity) throw new Error('Entity not found.');
      if (entity.locked) throw new Error('This entity is locked. Unlock it before editing.');
      // The mock always succeeds; the real chain can refuse a name a given engine has nothing for.
      const value: GuidePronunciation =
        source === 'cmu'
          ? { ipa: '/mɒk kjuː ɛm juː/', source: 'CMU dictionary', confidence: 'medium', chosen: true }
          : source === 'wiktextract'
            ? { ipa: '/mɒk wɪkʃənɛri/', source: 'Wiktionary (via Wiktextract)', confidence: 'high', chosen: true }
            : { ipa: '/mɒk iː spiːk/', source: 'eSpeak NG', confidence: 'low', chosen: true };
      changePronunciation(id, aliasIndex, (prior) => setPronunciation(prior, value));
    },
    guidePronounceUser: async (id, ipa, aliasIndex) => {
      const text = ipa.trim();
      if (!text) throw new Error('type a pronunciation first');
      changePronunciation(id, aliasIndex, (prior) => setPronunciation(prior, { ipa: text, source: 'manual', confidence: 'narrator', chosen: true }));
    },
    guidePronunciationUseAlternate: async (id, aliasIndex) => {
      changePronunciation(id, aliasIndex, (prior) => {
        if (!prior.alternate) throw new Error('There is no other pronunciation to switch to.');
        return setPronunciation(prior, { ...prior.alternate, chosen: true });
      });
    },
    guideDialogueCues: async () => wireClone(s.dialogueCues),
    guideMarkReviewed: async (id, aliasIndex) => {
      const entity = editableEntity(id);
      const review = reviewOf(entity);
      const alias = aliasTextAt(entity, aliasIndex);
      const aliases = alias === undefined ? [] : review.aliases.filter((text) => text !== alias);
      const entry = alias === undefined ? false : review.entry;
      updateEntity(id, (row) => ({
        ...row,
        review: { entry, aliases },
        review_state: !entry && !aliases.length ? 'reviewed' : row.review_state,
      }));
    },
    guideFlagReview: async (id, aliasIndex) => {
      const entity = editableEntity(id);
      const review = reviewOf(entity);
      const alias = aliasTextAt(entity, aliasIndex);
      if (alias === undefined) updateEntity(id, (row) => ({ ...row, review: { ...review, entry: true }, review_state: 'needs review' }));
      else if (!review.aliases.includes(alias)) updateEntity(id, (row) => ({ ...row, review: { ...review, aliases: [...review.aliases, alias] } }));
    },
    guideSetSpeakerColor: async (id, index) => {
      const value = index ?? 0;
      if (!Number.isInteger(value) || value < 0 || value > 7) throw new Error('A speaker colour is 1 to 7, or 0 for automatic.');
      const entity = editableEntity(id);
      if (entity.category !== 'Character') throw new Error('Only a character speaks, so only a character has a speaker colour.');
      updateEntity(id, (row) => {
        const next: GuideEntity = { ...row, speaker_color: value };
        if (!value) delete next.speaker_color;
        return next;
      });
    },
    guideCorrectCue: async (cueId, speakerEntityId) => {
      const cue = s.dialogueCues.find((row) => row.id === cueId);
      if (!cue) throw new Error('Cue not found.');
      const value = speakerEntityId.trim();
      const speaker = value === '' || value.toLowerCase() === 'unknown' ? null : value;
      s.dialogueCues = s.dialogueCues.map((row) =>
        row.id === cueId ? { ...row, speaker_entity_id: speaker, speaker_source: 'correction', corrected: true } : row,
      );
    },
  } satisfies Partial<NarrationApi>;
  return { bindings };
}
