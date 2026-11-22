import { creditsKindOfId } from '../../credits/creditsEntries';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import type { CreditsRenderResult, GuideDialogueCue, GuideEntity, GuideType, ManuscriptChapter } from '../../../types';
import type { RecordedThrough } from '../../../api/contracts/manuscript';
import { recordedAtOf, type RecordedAt } from '../../../recordedThrough';
import type { CreditsKind } from '../readerModel';
import { isCreditsChapter, isNarrationChapter } from '../../../chapterKinds';
import type { BoothChapterTarget } from './boothQuery';
import { attributeCue } from '../../../studio/commands/attributeCue';
import { useJournalOrOwn } from '../../../studio/StudioProvider';
import { useChapters } from '../../../studio/useChapters';
import { apiErrorDetails, apiErrorMessage } from '../../../api/errorMessage';

const CREDITS_KINDS: readonly CreditsKind[] = ['opening', 'closing'];
const NONE: never[] = [];

/** Whether two reads of a chapter are the same chapter to the Booth: what a take changes (how far it is recorded) is not part of it. */
const sameChapter = (a: ManuscriptChapter, b: ManuscriptChapter) =>
  a.id === b.id && a.title === b.title && a.subtitle === b.subtitle && a.index === b.index && a.isCredits === b.isCredits && a.contentKind === b.contentKind;

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
  const storyBible = usePort('storyBible');
  const teleprompter = usePort('teleprompter');
  const journal = useJournalOrOwn();
  const [entities, setEntities] = useState<GuideEntity[]>(NONE);
  const [cues, setCues] = useState<GuideDialogueCue[]>(NONE);
  const [types, setTypes] = useState<GuideType[]>(NONE);
  const { previews, loaded: creditsLoaded } = useCreditsPreviews();

  // The chapter list is the store's, shared with every page: opening the Booth does not read it again. `reload` asks the store for it now (after a take).
  const [reload, setReload] = useState(0);
  // Each reset of the store is a project switch (`generation`): the chapter the page opens on is chosen again for the new project.
  const { chapters: held, error: listError, refreshing, generation } = useChapters(true, reload);

  // The narration chapters follow the store's list (a re-split, a chapter added while the Booth is open, a project switch). The array is kept as it was while
  // only what a take changes (how far a chapter is recorded) moved, so a take does not re-render what is built from the chapters.
  const narration = useMemo(() => held?.filter(isNarrationChapter), [held]);
  const shown = useRef<ManuscriptChapter[]>(undefined);
  const chapters = useMemo(() => {
    if (!narration) return undefined;
    const before = shown.current;
    const same = before && before.length === narration.length && before.every((item, i) => sameChapter(item, narration[i]!));
    return same ? before : narration;
  }, [narration]);
  useEffect(() => {
    shown.current = chapters;
  }, [chapters]);

  // How far each chapter is recorded, from the store's list, so a chapter the narrator comes back to opens where the take they just made ends. Each entry is
  // the chapter's `recordedThrough` AND whether its track holds audio, from the same read (`RecordedAt`): a new list replaces the pairs together.
  const recordedAt = useMemo<Record<string, RecordedAt>>(() => (narration ? recordedOf(narration) : {}), [narration]);
  const recorded = useMemo<Record<string, RecordedThrough>>(
    () => Object.fromEntries(Object.entries(recordedAt).map(([id, at]) => [id, at.through])),
    [recordedAt],
  );
  // After a take the list is read now rather than waiting for the store's record-end event; a failure keeps what was read before.
  const refreshRecorded = useCallback(() => setReload((n) => n + 1), []);

  // The running session picks the chapter the page opens on. It is read for each project and each Retry, and the choice below waits for the read of its own
  // generation and attempt, so an old answer never picks the chapter.
  const [attempt, setAttempt] = useState(0);
  const [host, setHost] = useState<{ generation: number; attempt: number; running: string | undefined }>();
  useEffect(() => {
    let live = true;
    void teleprompter
      .teleprompterState()
      .catch(() => undefined)
      .then(
        (state) =>
          live &&
          setHost({ generation, attempt, running: state && state.phase !== 'idle' && state.phase !== 'stopped' ? (state.chapter ?? undefined) : undefined }),
      );
    return () => {
      live = false;
    };
  }, [teleprompter, generation, attempt]);
  const hostRead = host && host.generation === generation && host.attempt === attempt ? host : undefined;
  const [chosen, setChosen] = useState<{ generation: number; id: string }>();
  useEffect(() => {
    if (!narration || !hostRead || chosen?.generation === generation) return;
    // With nothing asked for and nothing running the page opens on the first chapter of the book's text, not on the opening credits.
    const id = narration.find((item) => item.id === hostRead.running)?.id ?? (narration.find((item) => !isCreditsChapter(item)) ?? narration[0])?.id ?? '';
    setChosen({ generation, id });
  }, [narration, hostRead, generation, chosen]);
  const fallback = chosen?.generation === generation ? chosen.id : '';

  // A Retry (and a Booth opened on a failed list) reads the list now: the skeleton shows until that read ends, whatever the failure is.
  const failed = !held && listError && !refreshing ? listError : undefined;
  const error = failed ? apiErrorMessage(failed) : '';
  const errorDetails = failed ? apiErrorDetails(failed) : undefined;

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
    setReload((n) => n + 1);
    setAttempt((n) => n + 1);
  }, []);

  const chapterId = target ? target.chapter : fallback;
  // While a take runs (the page says so with `hold`) the chapter on screen stays when a list change takes it out: a session is never unmounted from under a
  // take. Once the take ends, or the project changes, the list decides again.
  const pin = useRef<{ generation: number; chapter: ManuscriptChapter }>(undefined);
  const holding = useRef(false);
  const onScreen = useRef<{ generation: number; chapter: ManuscriptChapter }>(undefined);
  const hold = useCallback((on: boolean) => {
    holding.current = on;
    pin.current = on ? onScreen.current : undefined;
  }, []);
  const found = chapters?.find((item) => item.id === chapterId);
  if (found) onScreen.current = { generation, chapter: found };
  if (found && holding.current) pin.current = onScreen.current;
  const chapter =
    found ??
    (holding.current && pin.current && pin.current.generation === generation && pin.current.chapter.id === chapterId ? pin.current.chapter : undefined);
  // Nothing is said about a chapter that is not there until the page has chosen the one it opens on (the session state has answered).
  const picked = Boolean(target) || chosen?.generation === generation;

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
  const unavailable: BoothUnavailable | undefined =
    source || !picked
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
    recordedAt,
    refreshRecorded,
    hold,
    source,
    unavailable,
    error,
    errorDetails,
    retry,
    entities,
    types,
    cues,
    correctCue,
  };
}

/** Each chapter's `recordedThrough` with its audio flag, by id, from one read; a chapter with none is left out. */
function recordedOf(chapters: readonly ManuscriptChapter[]): Record<string, RecordedAt> {
  return Object.fromEntries(
    chapters.flatMap((chapter) => {
      const at = recordedAtOf(chapter);
      return at ? [[chapter.id, at]] : [];
    }),
  );
}
