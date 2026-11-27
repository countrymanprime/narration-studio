import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../../../api/ApiContext';
import type { CreditsRenderResult, GuideEntity, GuideType, ManuscriptChapter, ManuscriptNote } from '../../../types';
import type { BoothSource } from '../page/useBoothData';
import { boothQuery, readBoothQuery } from '../page/boothQuery';
import { creditsKindOf } from '../page/useBoothData';
import { keptChapterIn, loadLastPlace } from '../page/lastPlace';
import { useFollowDawOnOpen } from '../page/useDawFollow';
import { isCreditsChapter, isNarrationChapter, lastReadOrFirstTextChapter } from '../../../chapterKinds';
import { ACTIVE_PHASES } from '../useTeleprompterSession';
import { CompanionSkeleton } from './CompanionSkeleton';
import { CompanionHost } from './CompanionHost';
import { addressPath } from '../../../navigation/address';
import { useReadChapters } from '../../../studio/useChapters';

const NO_ENTITIES: GuideEntity[] = [];
const NO_NOTES: ManuscriptNote[] = [];
const NO_TYPES: GuideType[] = [];

type Props = {
  /** Opens Settings > Credits, where a token with no value is filled in. */
  onFixCredits?: () => void;
  /** The open project's folder: the key of the place the Booth remembers (`loadLastPlace`). */
  projectFolder?: string;
};

/**
 * The Companion's route (`/companion?chapter=<id>`; the credits are chapters, and `?credits=opening` is the old spelling of `?chapter=credits-opening`): the chapter rule of the old Booth page without its
 * picker. With neither in the address it reads the chapter a running session is on, else the chapter the Booth remembers for this project (`keptChapterIn`), else the chapter the DAW is on
 * (`useFollowDawOnOpen`, as the Booth does), else the chapter last read, else the first chapter with text (`lastReadOrFirstTextChapter`, the Booth's end of the order too); an unknown
 * chapter sends the narrator to `/booth`.
 */
export function CompanionPage({ onFixCredits, projectFolder = '' }: Props) {
  const api = useApi();
  const readChapters = useReadChapters();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [chapters, setChapters] = useState<ManuscriptChapter[]>();
  const [entities, setEntities] = useState<GuideEntity[]>(NO_ENTITIES);
  const [types, setTypes] = useState<GuideType[]>(NO_TYPES);
  const [notes, setNotes] = useState<ManuscriptNote[]>(NO_NOTES);
  // What decides the chapter when none is asked, read once with the chapters: a running session's, the remembered one, and the one to fall back on.
  const [fallback, setFallback] = useState('');
  const [decided, setDecided] = useState(false);
  const [credits, setCredits] = useState<CreditsRenderResult>();
  // The credits chapter read last, with text or without, so empty credits are not waited for for ever.
  const [creditsReadOf, setCreditsReadOf] = useState<string>();

  useEffect(() => {
    let live = true;
    void Promise.all([
      readChapters(),
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
        // The Booth's remembered chapter, used when it is in this list.
        const remembered = keptChapterIn(
          projectFolder ? loadLastPlace(projectFolder) : null,
          narration.map((item) => item.id),
        )?.chapterId;
        setDecided(!running && !remembered);
        setFallback(running || remembered || lastReadOrFirstTextChapter(narration, reader?.activeChapter)?.id || '');
      })
      .catch(() => live && setChapters([]));
    return () => {
      live = false;
    };
  }, [api, readChapters, projectFolder]);

  const asked = readBoothQuery(params)?.chapter;
  const chapterIds = useMemo(() => chapters?.map((item) => item.id), [chapters]);
  // Nothing asked, no session running and nothing remembered: the chapter the DAW is on, asked once, and nothing is drawn until it answers.
  const followingDaw = useFollowDawOnOpen({
    enabled: asked === undefined && decided,
    chapterIds,
    onChapter: (chapterId) => setParams(new URLSearchParams(boothQuery({ chapter: chapterId }).slice(1)), { replace: true }),
  });
  const chosen = asked ?? fallback;
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
  if (followingDaw) return <CompanionSkeleton status="Opening your chapter…" />;
  // A chapter the book does not list (a credits file with no template included) goes to the Booth with its id, which says so in its own panel.
  if (!chapter) return <Navigate to={asked ? addressPath({ page: 'booth', target: { chapter: asked } }) : '/booth'} replace />;
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
