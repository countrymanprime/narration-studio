import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PickupItem, PickupList } from '../../api/contracts/pickups';
import type { Measured } from '../../api/schemas/base';
import { describeApiError } from '../../api/errorMessage';
import { chapterName } from '../../chapterName';
import { useOverlay } from '../../overlay/OverlayProvider';
import { usePort } from '../../ports/usePort';
import { useCapability } from '../../useCapability';
import { useDawKind } from '../../useDawKind';
import type { ManuscriptChapter } from '../../types';
import { openCheckRecordings } from '../recordingcheck/openCheckRecordings';
import { NeedManuscript } from '../script/page/layout/NeedManuscript';
import { ALL_SCOPE, inScope, plainLine, type ChapterRef } from './list/pickupRows';
import { PickupsTable, type RemoveUndo } from './list/PickupsTable';
import { SessionPanel } from './list/SessionPanel';

const isNarration = (chapter: ManuscriptChapter) => (chapter.contentKind ?? 'narration') === 'narration';
const LOADING: Measured<number> = { ok: false, reason: 'Reading the recording times…' };

/** The Booth's address for a pickup session: the first line's chapter, and the pickups in the order they were chosen. */
export function boothSessionPath(pickups: readonly PickupItem[]): string {
  const chapter = pickups[0]?.chapterId;
  const query = new URLSearchParams();
  if (chapter) query.set('chapter', chapter);
  query.set('pickups', pickups.map((pickup) => pickup.id).join(','));
  return `/booth?${query.toString()}`;
}

/**
 * Pickups (Studio Next mock `pages/Pickups.tsx`): the host's merged pickup list (ADR 0840) grouped by chapter, with the pickup session
 * beside it. The page points at the Booth and records nothing itself: there is no Punch and no Next pickup here (DQ-6). Reading the
 * list on open is what reconciles it with the DAW's markers; every change answers the whole list.
 */
export function PickupsPage({
  hasManuscript,
  goTo,
  goToScript,
}: {
  hasManuscript: boolean;
  goTo: (path: string) => void;
  goToScript: (chapterId: string) => void;
}) {
  const pickupsApi = usePort('pickups');
  const manuscriptApi = usePort('manuscript');
  const measurements = usePort('measurements');
  const daw = usePort('daw');
  const overlay = useOverlay();
  const review = useCapability('review');
  const markers = useCapability('markers');
  const dawKind = useDawKind();
  const [chapters, setChapters] = useState<ChapterRef[]>([]);
  const [list, setList] = useState<PickupList>({ pickups: [], leftOut: [] });
  const [scope, setScope] = useState(ALL_SCOPE);
  const [current, setCurrent] = useState('');
  const [seconds, setSeconds] = useState<Measured<number>>(LOADING);

  useEffect(() => {
    if (!hasManuscript) return;
    let live = true;
    Promise.all([manuscriptApi.manuscriptChapters(), pickupsApi.pickupsList()])
      .then(([all, answer]) => {
        if (!live) return;
        setChapters(all.filter(isNarration).map((chapter) => ({ id: chapter.id, name: chapterName(chapter) })));
        setList(answer);
      })
      .catch((error: unknown) => live && overlay.toast(describeApiError(error), { tone: 'error' }));
    return () => {
      live = false;
    };
  }, [manuscriptApi, pickupsApi, hasManuscript, overlay]);

  const inView = useMemo(() => inScope(list.pickups, scope), [list.pickups, scope]);
  const sessionIds = useMemo(() => inView.filter((p) => !p.done && p.included).map((p) => p.id), [inView]);
  const sessionKey = sessionIds.join('\n');
  useEffect(() => {
    let live = true;
    measurements.pickupSessionSeconds(sessionKey ? sessionKey.split('\n') : []).then(
      (answer) => live && setSeconds(answer),
      (error: unknown) => live && setSeconds({ ok: false, reason: describeApiError(error) }),
    );
    return () => {
      live = false;
    };
  }, [measurements, sessionKey]);

  const changing = useCallback(async (run: Promise<PickupList>) => setList(await run), []);
  const choose = (next: string) => {
    setScope(next);
    if (next !== ALL_SCOPE) setCurrent(next);
  };
  const step = (direction: -1 | 1) => {
    if (scope === ALL_SCOPE) {
      const back = chapters.find((c) => c.id === current) ?? chapters[0];
      if (back) choose(back.id);
      return;
    }
    const next = chapters[chapters.findIndex((c) => c.id === scope) + direction];
    if (next) choose(next.id);
  };

  // A line added by hand can be put back; the host keeps an automatic line off once removed, so it has no Undo.
  const remove = async (id: string): Promise<RemoveUndo | undefined> => {
    const pickup = list.pickups.find((p) => p.id === id);
    await changing(pickupsApi.pickupsRemove(id));
    if (!pickup || pickup.source !== 'you' || pickup.time === null) return undefined;
    const { chapterId, time, script } = pickup;
    return async () => {
      try {
        await changing(pickupsApi.pickupsAdd(chapterId, time, plainLine(script)));
        return { ok: true };
      } catch (error) {
        return { ok: false, refusal: { reason: describeApiError(error) } };
      }
    };
  };

  const addMarkers = async (picked: PickupItem[]) => {
    const placed = picked.filter((p): p is PickupItem & { at: number } => p.at !== null);
    const result = await daw.addPickupMarkers(placed.map((p) => ({ ref: p.id, start: p.at, tag: p.type, note: plainLine(p.script) })));
    if (!result.ok) throw new Error(result.message);
    overlay.toast(result.message);
    setList(await pickupsApi.pickupsList());
  };

  if (!hasManuscript) return <NeedManuscript title="Pickups" onImport={() => goTo('/')} />;

  const openInBooth = (picked: PickupItem[]) => goTo(boothSessionPath(picked));
  const dawName = !dawKind ? 'the DAW' : dawKind === 'none' ? 'the built-in recorder' : dawKind;

  return (
    <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
      <PickupsTable
        pickups={list.pickups}
        chapters={chapters}
        scope={scope}
        currentChapterId={current || chapters[0]?.id || ''}
        chaptersToCheck={list.leftOut.map((chapter) => chapter.chapterId)}
        daw={{ available: review.available, message: review.message }}
        onScope={choose}
        onStep={step}
        onCheck={(ids) => openCheckRecordings(ids)}
        onAdd={(chapterId, time, line) => changing(pickupsApi.pickupsAdd(chapterId, time, line))}
        onSetIncluded={(id, included) => changing(pickupsApi.pickupsSetIncluded(id, included))}
        onSetDone={(id, done) => changing(pickupsApi.pickupsSetDone(id, done))}
        onRemove={remove}
        onOpenInBooth={openInBooth}
        onOpenInScript={goToScript}
        onGoToProof={(findingId) => goTo(findingId ? `/proof?finding=${encodeURIComponent(findingId)}` : '/proof')}
      />
      <SessionPanel
        pickups={inView}
        chapters={chapters}
        seconds={seconds}
        dawName={dawName}
        markers={{ available: markers.available, message: markers.message }}
        onOpenInBooth={openInBooth}
        onAddMarkers={addMarkers}
      />
    </div>
  );
}
