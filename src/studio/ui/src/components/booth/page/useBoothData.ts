import { creditsKindOfId } from '../../credits/creditsEntries';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import type { CreditsRenderResult, GuideDialogueCue, GuideEntity, GuideType, ManuscriptChapter } from '../../../types';
import type { RecordedThrough } from '../../../api/contracts/manuscript';
import type { CreditsKind } from '../readerModel';
import { isCreditsChapter, isNarrationChapter } from '../../../chapterKinds';
import type { BoothChapterTarget } from './boothQuery';
import { attributeCue } from '../../../studio/commands/attributeCue';
import { useJournalOrOwn } from '../../../studio/StudioProvider';

const CREDITS_KINDS: readonly CreditsKind[] = ['opening', 'closing'];
const NONE: never[] = [];

type SourceChapter = Pick<ManuscriptChapter, 'id' | 'title' | 'subtitle'>;

/** What the Booth reads now: a chapter, or a credits chapter, which has no paragraphs and reads the rendered credits text instead. */
export type BoothSource =
  { kind: 'chapter'; chapter: SourceChapter } | { kind: 'credits'; credits: CreditsKind; chapter: SourceChapter; preview: CreditsRenderResult };

/** Which credits a credits chapter is. */
export const creditsKindOf = (chapter: Pick<ManuscriptChapter, 'id'>): CreditsKind => (chapter.id === 'credits-closing' ? 'closing' : 'opening');

/** Why the page has nothing to read: the credits chapter asked for has no text to render, or the chapter asked for is not in the book. */
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
export function useBoothData(target: BoothChapterTarget | null) {
  const manuscript = usePort('manuscript');
  const storyBible = usePort('storyBible');
  const teleprompter = usePort('teleprompter');
  const journal = useJournalOrOwn();
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
  // Reads can answer out of order; only the newest one asked is kept, so an old answer never replaces how far a later take reached.
  const recordedRead = useRef(0);
  const refreshRecorded = useCallback(() => {
    const mine = ++recordedRead.current;
    void manuscript
      .manuscriptChapters()
      .then((all) => mine === recordedRead.current && setRecorded(recordedOf(all)))
      .catch(() => {});
  }, [manuscript]);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    const mine = ++recordedRead.current;
    void Promise.all([manuscript.manuscriptChapters(), teleprompter.teleprompterState().catch(() => undefined)])
      .then(([all, host]) => {
        if (!live) return;
        const narration = all.filter(isNarrationChapter);
        setChapters(narration);
        if (mine === recordedRead.current) setRecorded(recordedOf(narration));
        const running = host && host.phase !== 'idle' && host.phase !== 'stopped' ? narration.find((item) => item.id === host.chapter)?.id : undefined;
        // With nothing asked for and nothing running the page opens on the first chapter of the book's text, not on the opening credits.
        setFallback(running ?? (narration.find((item) => !isCreditsChapter(item)) ?? narration[0])?.id ?? '');
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

  const chapterId = target ? target.chapter : fallback;
  const chapter = chapters?.find((item) => item.id === chapterId);

  const correctCue = useCallback(
    async (cueId: string, entityId: string) => {
      const done = await attributeCue(journal, storyBible, cues.find((cue) => cue.id === cueId) ?? { id: cueId }, entityId);
      if (!done.ok) throw new Error(done.refusal.reason);
      setCues(await storyBible.guideDialogueCues());
    },
    [storyBible, journal, cues],
  );

  // A credits chapter has no paragraphs; its text is the credits preview.
  const credits = chapter && isCreditsChapter(chapter) ? creditsKindOf(chapter) : undefined;
  const preview = credits ? previews[credits] : undefined;
  const source: BoothSource | undefined =
    chapter && credits ? preview && { kind: 'credits', credits, chapter, preview } : chapter && { kind: 'chapter', chapter };
  // Nothing to show once what it waits for has been read: the credits have no text, or the chapter asked for is not there. (No chapters at all is its own panel.)
  // A credits file the library has no template for is not in the list; asked for by its id it is still the credits' own panel (set one up), not "not in this book".
  const unlisted = !chapter ? creditsKindOfId(chapterId) : undefined;
  const unavailable: BoothUnavailable | undefined = source
    ? undefined
    : credits
      ? creditsLoaded
        ? { kind: 'credits', credits }
        : undefined
      : unlisted
        ? chapters
          ? { kind: 'credits', credits: unlisted }
          : undefined
        : chapters && chapters.length > 0
          ? { kind: 'chapter' }
          : undefined;
  return {
    chapters,
    recorded,
    refreshRecorded,
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
