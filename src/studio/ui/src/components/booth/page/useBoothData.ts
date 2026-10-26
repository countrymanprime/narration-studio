import { useCallback, useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import type { CreditsRenderResult, GuideDialogueCue, GuideEntity, GuideType, ManuscriptChapter } from '../../../types';
import type { RecordedThrough } from '../../../api/contracts/manuscript';
import type { CreditsKind } from '../readerModel';
import type { BoothTarget } from './boothQuery';

const CREDITS_KINDS: readonly CreditsKind[] = ['opening', 'closing'];
const NONE: never[] = [];

/** What the Booth reads now: a chapter, or the credits with their rendered text. */
export type BoothSource =
  { kind: 'chapter'; chapter: Pick<ManuscriptChapter, 'id' | 'title' | 'subtitle'> } | { kind: 'credits'; credits: CreditsKind; preview: CreditsRenderResult };

/** Why the page has nothing to read: the credits asked for have no text, or the chapter asked for is not in the book. */
export type BoothUnavailable = { kind: 'credits'; credits: CreditsKind } | { kind: 'chapter' };

/** The opening and closing credits as the host renders them; a failure leaves them out rather than blocking the chapters. `loaded` is false until the read ends. */
function useCreditsPreviews(): { previews: Partial<Record<CreditsKind, CreditsRenderResult>>; loaded: boolean } {
  const credits = usePort('credits');
  const [previews, setPreviews] = useState<Partial<Record<CreditsKind, CreditsRenderResult>>>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      const templates = await credits.creditsTemplates().catch(() => []);
      const rendered = await Promise.all(
        CREDITS_KINDS.map(async (kind) => {
          const template = templates.find((item) => item.kind === kind);
          const preview = template ? await credits.creditsPreview(template.body).catch(() => undefined) : undefined;
          return [kind, preview] as const;
        }),
      );
      if (!live) return;
      setPreviews(Object.fromEntries(rendered.filter(([, preview]) => preview && preview.words > 0)));
      setLoaded(true);
    })();
    return () => {
      live = false;
    };
  }, [credits]);
  return { previews, loaded };
}

/**
 * What the Booth page loads: the narration chapters, the credits, and the Story Bible's entries, types and dialogue cues. The cues are
 * secondary, so a failure leaves them out. With no target in the address the page opens on the chapter a running session reads, else
 * the first. `correctCue` records the narrator's speaker for a quote and reads the cues again.
 */
export function useBoothData(target: BoothTarget | null) {
  const manuscript = usePort('manuscript');
  const storyBible = usePort('storyBible');
  const teleprompter = usePort('teleprompter');
  const [chapters, setChapters] = useState<ManuscriptChapter[]>();
  const [fallback, setFallback] = useState('');
  const [error, setError] = useState('');
  const [entities, setEntities] = useState<GuideEntity[]>(NONE);
  const [cues, setCues] = useState<GuideDialogueCue[]>(NONE);
  const [types, setTypes] = useState<GuideType[]>(NONE);
  const { previews, loaded: creditsLoaded } = useCreditsPreviews();

  // How far each chapter is recorded, read with the chapters and read again after a take (`refreshRecorded`), so a chapter the narrator
  // comes back to opens where the take they just made ends; the chapters themselves are not replaced, so nothing on the page re-renders.
  const [recorded, setRecorded] = useState<Record<string, RecordedThrough>>({});
  const refreshRecorded = useCallback(() => {
    void manuscript
      .manuscriptChapters()
      .then((all) => setRecorded(recordedOf(all)))
      .catch(() => {});
  }, [manuscript]);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void Promise.all([manuscript.manuscriptChapters(), teleprompter.teleprompterState().catch(() => undefined)])
      .then(([all, host]) => {
        if (!live) return;
        const narration = all.filter((item) => (item.contentKind ?? 'narration') === 'narration');
        setChapters(narration);
        setRecorded(recordedOf(narration));
        const running = host && host.phase !== 'idle' && host.phase !== 'stopped' ? narration.find((item) => item.id === host.chapter)?.id : undefined;
        setFallback(running ?? narration[0]?.id ?? '');
      })
      .catch((reason) => live && setError(reason instanceof Error ? reason.message : String(reason)));
    return () => {
      live = false;
    };
  }, [manuscript, teleprompter, attempt]);

  useEffect(() => {
    let live = true;
    void storyBible
      .guideEntities()
      .then((next) => live && setEntities(next))
      .catch(() => {});
    // The types colour the names and speakers; none read leaves every entry in the fallback colour rather than blocking the page.
    void storyBible
      .guideTypes()
      .then((next) => live && setTypes(next))
      .catch(() => {});
    void storyBible
      .guideDialogueCues()
      .then((next) => live && setCues(next))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [storyBible]);

  // Retry: clears the error first, so the skeleton shows with no stale sentence under it, then reads the chapters again.
  const retry = useCallback(() => {
    setError('');
    setAttempt((n) => n + 1);
  }, []);

  const credits = target && 'credits' in target ? target.credits : undefined;
  const chapterId = credits ? '' : target && 'chapter' in target ? target.chapter : fallback;
  const chapter = chapters?.find((item) => item.id === chapterId);

  const correctCue = useCallback(
    async (cueId: string, entityId: string) => {
      await storyBible.guideCorrectCue(cueId, entityId);
      setCues(await storyBible.guideDialogueCues());
    },
    [storyBible],
  );

  const preview = credits ? previews[credits] : undefined;
  const source: BoothSource | undefined = credits ? preview && { kind: 'credits', credits, preview } : chapter && { kind: 'chapter', chapter };
  // Nothing to show once what it waits for has been read: the credits have no text, or the chapter asked for is not there. (No chapters at all is its own panel.)
  const unavailable: BoothUnavailable | undefined = source
    ? undefined
    : credits
      ? creditsLoaded
        ? { kind: 'credits', credits }
        : undefined
      : chapters && chapters.length > 0
        ? { kind: 'chapter' }
        : undefined;
  return {
    chapters,
    recorded,
    refreshRecorded,
    previews,
    source,
    unavailable,
    error,
    retry,
    entities,
    types,
    cues,
    correctCue,
  };
}

/** Each chapter's `recordedThrough`, by id; a chapter with none is left out. */
function recordedOf(chapters: readonly ManuscriptChapter[]): Record<string, RecordedThrough> {
  return Object.fromEntries(chapters.flatMap((chapter) => (chapter.recordedThrough ? [[chapter.id, chapter.recordedThrough]] : [])));
}
