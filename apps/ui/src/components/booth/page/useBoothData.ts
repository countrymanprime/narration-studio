import { useCallback, useEffect, useState } from 'react';
import type { PrepMarkupSpan } from '../../../api/contracts/prepMarkup';
import { usePort } from '../../../ports/usePort';
import type { CreditsRenderResult, GuideDialogueCue, GuideEntity, ManuscriptChapter } from '../../../types';
import type { CreditsKind } from '../readerModel';
import type { BoothTarget } from './boothQuery';

const CREDITS_KINDS: readonly CreditsKind[] = ['opening', 'closing'];
const NONE: never[] = [];

/** What the Booth reads now: a chapter, or the credits with their rendered text. */
export type BoothSource =
  { kind: 'chapter'; chapter: Pick<ManuscriptChapter, 'id' | 'title' | 'subtitle'> } | { kind: 'credits'; credits: CreditsKind; preview: CreditsRenderResult };

/** The opening and closing credits as the host renders them; a failure leaves them out rather than blocking the chapters. */
function useCreditsPreviews(): Partial<Record<CreditsKind, CreditsRenderResult>> {
  const credits = usePort('credits');
  const [previews, setPreviews] = useState<Partial<Record<CreditsKind, CreditsRenderResult>>>({});
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
      if (live) setPreviews(Object.fromEntries(rendered.filter(([, preview]) => preview && preview.words > 0)));
    })();
    return () => {
      live = false;
    };
  }, [credits]);
  return previews;
}

/**
 * What the Booth page loads: the narration chapters, the credits, and the Story Bible's entries and dialogue cues. The cues are
 * secondary, so a failure leaves them out. `spans` is always empty: SN-B8 removed the prep markup bindings. With no target in the address the page opens on the chapter
 * a running session reads, else the first. `correctCue` records the narrator's speaker for a quote and reads the cues again.
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
  const previews = useCreditsPreviews();

  useEffect(() => {
    let live = true;
    void Promise.all([manuscript.manuscriptChapters(), teleprompter.teleprompterState().catch(() => undefined)])
      .then(([all, host]) => {
        if (!live) return;
        const narration = all.filter((item) => (item.contentKind ?? 'narration') === 'narration');
        setChapters(narration);
        const running = host && host.phase !== 'idle' && host.phase !== 'stopped' ? narration.find((item) => item.id === host.chapter)?.id : undefined;
        setFallback(running ?? narration[0]?.id ?? '');
      })
      .catch((reason) => live && setError(reason instanceof Error ? reason.message : String(reason)));
    void storyBible
      .guideEntities()
      .then((next) => live && setEntities(next))
      .catch(() => {});
    void storyBible
      .guideDialogueCues()
      .then((next) => live && setCues(next))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [manuscript, storyBible, teleprompter]);

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
  return {
    chapters,
    previews,
    source,
    error,
    entities,
    cues,
    spans: NONE as PrepMarkupSpan[],
    correctCue,
  };
}
