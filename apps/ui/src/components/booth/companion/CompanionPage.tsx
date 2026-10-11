import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../../../api/ApiContext';
import type { CreditsRenderResult, GuideEntity, ManuscriptChapter, ManuscriptNote } from '../../../types';
import { boothQuery } from '../BoothPage';
import type { BoothSource } from '../BoothSession';
import type { CreditsKind } from '../readerModel';
import { ACTIVE_PHASES } from '../useTeleprompterSession';
import { CompanionHost } from './CompanionHost';

const CREDITS_KINDS: CreditsKind[] = ['opening', 'closing'];
const NO_ENTITIES: GuideEntity[] = [];
const NO_NOTES: ManuscriptNote[] = [];

type Props = {
  /** Opens Settings > Credits, where a token with no value is filled in. */
  onFixCredits?: () => void;
};

/**
 * The Companion's route (`/companion?chapter=<id>` or `?credits=opening`): the chapter rule of `BoothPage` without its
 * picker. With neither in the address it reads the chapter a running session is on, else the last chapter read; an unknown
 * chapter sends the narrator to `/booth`.
 */
export function CompanionPage({ onFixCredits }: Props) {
  const api = useApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [chapters, setChapters] = useState<ManuscriptChapter[]>();
  const [entities, setEntities] = useState<GuideEntity[]>(NO_ENTITIES);
  const [notes, setNotes] = useState<ManuscriptNote[]>(NO_NOTES);
  const [fallback, setFallback] = useState('');
  const [credits, setCredits] = useState<CreditsRenderResult>();
  const creditsParam = params.get('credits');
  const creditsKind = CREDITS_KINDS.find((kind) => kind === creditsParam);

  useEffect(() => {
    let live = true;
    void Promise.all([
      api.manuscriptChapters(),
      api.readerState().catch(() => undefined),
      api.teleprompterState().catch(() => undefined),
      api.guideEntities().catch(() => NO_ENTITIES),
      api.noteList().catch(() => NO_NOTES),
    ])
      .then(([all, reader, host, nextEntities, nextNotes]) => {
        if (!live) return;
        const narration = all.filter((item) => (item.contentKind ?? 'narration') === 'narration');
        setChapters(narration);
        setEntities(nextEntities);
        setNotes(nextNotes);
        const running = host && ACTIVE_PHASES.includes(host.phase) ? narration.find((item) => item.id === host.chapter)?.id : undefined;
        const last = narration.find((item) => item.id === reader?.activeChapter || item.title === reader?.activeChapter);
        setFallback(running || (last ?? narration[0])?.id || '');
      })
      .catch(() => live && setChapters([]));
    return () => {
      live = false;
    };
  }, [api]);

  useEffect(() => {
    if (!creditsKind) return;
    let live = true;
    void (async () => {
      const templates = await api.creditsTemplates().catch(() => []);
      const template = templates.find((item) => item.kind === creditsKind);
      const preview = template ? await api.creditsPreview(template.body).catch(() => undefined) : undefined;
      if (live) setCredits(preview && preview.words > 0 ? preview : undefined);
    })();
    return () => {
      live = false;
    };
  }, [api, creditsKind]);

  const chosen = params.get('chapter') ?? fallback;
  const chapter = creditsKind ? undefined : chapters?.find((item) => item.id === chosen);
  const chapterNotes = useMemo(
    () => (chapter ? notes.filter((item) => item.chapterId === chapter.id || (!item.chapterId && item.chapter === chapter.title)) : NO_NOTES),
    [notes, chapter],
  );

  if (!chapters) return null;
  if (!creditsKind && !chapter) return <Navigate to="/booth" replace />;
  const source: BoothSource | undefined = creditsKind
    ? credits && { kind: 'credits', credits: creditsKind, preview: credits }
    : { kind: 'chapter', chapter: chapter! };
  if (!source) return null;
  const toBooth = () => navigate(`/booth${boothQuery(creditsKind ? { credits: creditsKind } : { chapter: chapter!.id })}`);
  return (
    <div className="flex size-full flex-col">
      <CompanionHost
        key={creditsKind ? `credits:${creditsKind}` : chapter!.id}
        source={source}
        entities={source.kind === 'chapter' ? entities : undefined}
        notes={source.kind === 'chapter' ? chapterNotes : undefined}
        onFullApp={toBooth}
        onFixCredits={onFixCredits}
      />
    </div>
  );
}
