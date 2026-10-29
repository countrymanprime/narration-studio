import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../../../api/ApiContext';
import type { CreditsRenderResult, GuideEntity, GuideType, ManuscriptChapter, ManuscriptNote } from '../../../types';
import type { BoothSource } from '../page/useBoothData';
import { readBoothQuery } from '../page/boothQuery';
import { creditsKindOf } from '../page/useBoothData';
import { isCreditsChapter, isNarrationChapter } from '../../../chapterKinds';
import { ACTIVE_PHASES } from '../useTeleprompterSession';
import { CompanionSkeleton } from './CompanionSkeleton';
import { CompanionHost } from './CompanionHost';
import { addressPath } from '../../../navigation/address';

const NO_ENTITIES: GuideEntity[] = [];
const NO_NOTES: ManuscriptNote[] = [];
const NO_TYPES: GuideType[] = [];

type Props = {
  /** Opens Settings > Credits, where a token with no value is filled in. */
  onFixCredits?: () => void;
};

/**
 * The Companion's route (`/companion?chapter=<id>`; the credits are chapters, and `?credits=opening` is the old spelling of `?chapter=credits-opening`): the chapter rule of the old Booth page without its
 * picker. With neither in the address it reads the chapter a running session is on, else the last chapter read; an unknown
 * chapter sends the narrator to `/booth`.
 */
export function CompanionPage({ onFixCredits }: Props) {
  const api = useApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [chapters, setChapters] = useState<ManuscriptChapter[]>();
  const [entities, setEntities] = useState<GuideEntity[]>(NO_ENTITIES);
  const [types, setTypes] = useState<GuideType[]>(NO_TYPES);
  const [notes, setNotes] = useState<ManuscriptNote[]>(NO_NOTES);
  const [fallback, setFallback] = useState('');
  const [credits, setCredits] = useState<CreditsRenderResult>();
  // The credits chapter read last, with text or without, so empty credits are not waited for for ever.
  const [creditsReadOf, setCreditsReadOf] = useState<string>();

  useEffect(() => {
    let live = true;
    void Promise.all([
      api.manuscriptChapters(),
      api.readerState().catch(() => undefined),
      api.teleprompterState().catch(() => undefined),
      api.guideEntities().catch(() => NO_ENTITIES),
      api.guideTypes().catch(() => NO_TYPES),
      api.noteList().catch(() => NO_NOTES),
    ])
      .then(([all, reader, host, nextEntities, nextTypes, nextNotes]) => {
        if (!live) return;
        const narration = all.filter(isNarrationChapter);
        setChapters(narration);
        setEntities(nextEntities);
        setTypes(nextTypes);
        setNotes(nextNotes);
        const running = host && ACTIVE_PHASES.includes(host.phase) ? narration.find((item) => item.id === host.chapter)?.id : undefined;
        const last = narration.find((item) => item.id === reader?.activeChapter || item.title === reader?.activeChapter);
        setFallback(running || (last ?? narration.find((item) => !isCreditsChapter(item)) ?? narration[0])?.id || '');
      })
      .catch(() => live && setChapters([]));
    return () => {
      live = false;
    };
  }, [api]);

  const chosen = readBoothQuery(params)?.chapter ?? fallback;
  const chapter = chapters?.find((item) => item.id === chosen);
  // A credits chapter has no paragraphs; it reads the credits' rendered text.
  const creditsKind = chapter && isCreditsChapter(chapter) ? creditsKindOf(chapter) : undefined;
  const chapterNotes = useMemo(
    () => (chapter ? notes.filter((item) => item.chapterId === chapter.id || (!item.chapterId && item.chapter === chapter.title)) : NO_NOTES),
    [notes, chapter],
  );

  useEffect(() => {
    if (!creditsKind) return;
    let live = true;
    void (async () => {
      const templates = await api.creditsTemplates().catch(() => []);
      const template = templates.find((item) => item.kind === creditsKind);
      const preview = template ? await api.creditsPreview(template.body).catch(() => undefined) : undefined;
      if (!live) return;
      setCredits(preview && preview.words > 0 ? preview : undefined);
      setCreditsReadOf(creditsKind);
    })();
    return () => {
      live = false;
    };
  }, [api, creditsKind]);

  if (!chapters) return <CompanionSkeleton />;
  if (!chapter) return <Navigate to="/booth" replace />;
  const source: BoothSource | undefined = creditsKind
    ? credits && { kind: 'credits', credits: creditsKind, chapter, preview: credits }
    : { kind: 'chapter', chapter };
  // The credits asked for are still being read, or have no text: the Booth says so for them.
  if (!source)
    return creditsReadOf === creditsKind ? <Navigate to={addressPath({ page: 'booth', target: { chapter: chapter.id } })} replace /> : <CompanionSkeleton />;
  const toBooth = () => navigate(addressPath({ page: 'booth', target: { chapter: chapter.id } }));
  return (
    <div className="flex size-full flex-col">
      <CompanionHost
        key={chapter.id}
        source={source}
        entities={source.kind === 'chapter' ? entities : undefined}
        types={source.kind === 'chapter' ? types : undefined}
        notes={source.kind === 'chapter' ? chapterNotes : undefined}
        onFullApp={toBooth}
        onFixCredits={onFixCredits}
      />
    </div>
  );
}
