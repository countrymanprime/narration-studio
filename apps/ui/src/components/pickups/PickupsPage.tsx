import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PickupItem, PickupList } from '../../api/contracts/pickups';
import type { Measured } from '../../api/schemas/base';
import { chapterHeading } from '../../chapterHeading';
import { useOverlay } from '../../overlay/OverlayProvider';
import { usePort } from '../../ports/usePort';
import { useCapability } from '../../useCapability';
import { useDawKind } from '../../useDawKind';
import type { ManuscriptChapter } from '../../types';
import { boothQuery } from '../booth/page/boothQuery';
import { openCheckRecordings } from '../recordingcheck/openCheckRecordings';
import { NeedManuscript } from '../layout/NeedManuscript';
import { ALL_SCOPE, inScope, plainLine, reasonSentence, type ChapterRef } from './list/pickupRows';
import { PickupsTable, type PickupsRead, type RemoveUndo } from './list/PickupsTable';
import { SessionPanel } from './list/SessionPanel';

/** A chapter named as the manuscript heads it, label then title ("Chapter 3 A Caucus-Race and a Long Tale"), as the mock's `chName` and the Editing page. */
function headingName(chapter: Parameters<typeof chapterHeading>[0]): string {
  const { label, title } = chapterHeading(chapter);
  return label ? `${label} ${title}` : title;
}

const isNarration = (chapter: ManuscriptChapter) => (chapter.contentKind ?? 'narration') === 'narration';
const LOADING: Measured<number> = { ok: false, reason: 'Reading the recording times…' };
/** How often a list that could not be read is tried again. */
const RETRY_MS = 10_000;

/** The Booth's address for a pickup session: the first line's chapter, and the pickups in the order they were chosen. */
export function boothSessionPath(pickups: readonly PickupItem[]): string {
  const chapter = pickups[0]?.chapterId;
  return chapter
    ? `/booth${boothQuery(
        { chapter },
        pickups.map((pickup) => pickup.id),
      )}`
    : '/booth';
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
  const [read, setRead] = useState<PickupsRead>({ kind: 'loading' });
  const [scopeChoice, setScope] = useState(ALL_SCOPE);
  const [current, setCurrent] = useState('');
  const [seconds, setSeconds] = useState<Measured<number>>(LOADING);
  /* Answers come back in any order and can be late: each request takes a number as it starts, and an answer older than one already shown is dropped. */
  const started = useRef(0);
  const shown = useRef(0);
  const showing = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Reads the chapters and the list. With a list already on screen a failure keeps it and says when it was read; with none, it is the page's state. */
  const load = useCallback(async () => {
    const mine = ++started.current;
    try {
      const [all, answer] = await Promise.all([manuscriptApi.manuscriptChapters(), pickupsApi.pickupsList()]);
      if (!alive.current || mine < shown.current) return;
      shown.current = mine;
      showing.current = true;
      setChapters(all.filter(isNarration).map((chapter) => ({ id: chapter.id, name: headingName(chapter) })));
      setList(answer);
      setRead({ kind: 'ready', readAt: Date.now() });
    } catch (error) {
      if (!alive.current || mine < shown.current) return;
      const message = reasonSentence(error);
      setRead((before) => (showing.current && before.kind === 'ready' ? { ...before, trouble: message } : { kind: 'failed', message }));
    }
  }, [manuscriptApi, pickupsApi]);

  useEffect(() => {
    if (!hasManuscript) return;
    void load();
  }, [hasManuscript, load]);

  /* The DAW's markers decide what is recorded, so the list is read again when the window is used again, and every few seconds while it could not be read. */
  const troubled = read.kind === 'failed' || (read.kind === 'ready' && Boolean(read.trouble));
  useEffect(() => {
    if (!hasManuscript) return;
    const again = () => {
      if (document.visibilityState !== 'hidden') void load();
    };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    const timer = troubled ? window.setInterval(again, RETRY_MS) : undefined;
    return () => {
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', again);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [hasManuscript, load, troubled]);

  /* A chapter that has gone from the manuscript is not a scope: the page shows every chapter instead of an empty one that cannot be left. */
  const scope = scopeChoice === ALL_SCOPE || chapters.some((chapter) => chapter.id === scopeChoice) ? scopeChoice : ALL_SCOPE;

  const inView = useMemo(() => inScope(list.pickups, scope), [list.pickups, scope]);
  const sessionIds = useMemo(() => inView.filter((p) => !p.done && p.included).map((p) => p.id), [inView]);
  const sessionKey = sessionIds.join('\n');
  useEffect(() => {
    let live = true;
    measurements.pickupSessionSeconds(sessionKey ? sessionKey.split('\n') : []).then(
      (answer) => live && setSeconds(answer),
      (error: unknown) => live && setSeconds({ ok: false, reason: reasonSentence(error) }),
    );
    return () => {
      live = false;
    };
  }, [measurements, sessionKey]);

  const changing = useCallback(async (run: Promise<PickupList>) => {
    const mine = ++started.current;
    const answer = await run;
    if (!alive.current || mine < shown.current) return;
    shown.current = mine;
    showing.current = true;
    setList(answer);
    setRead((before) => (before.kind === 'ready' ? { kind: 'ready', readAt: Date.now() } : before));
  }, []);
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
        return { ok: false, refusal: { reason: reasonSentence(error) } };
      }
    };
  };

  const addMarkers = async (picked: PickupItem[]) => {
    const placed = picked.filter((p): p is PickupItem & { at: number } => p.at !== null);
    const result = await daw.addPickupMarkers(placed.map((p) => ({ ref: p.id, start: p.at, tag: p.type, note: plainLine(p.script) })));
    if (!result.ok) throw new Error(result.message);
    overlay.toast(result.message);
    await changing(pickupsApi.pickupsList());
  };

  if (!hasManuscript) return <NeedManuscript title="Pickups" onImport={() => goTo('/')} />;

  const openInBooth = (picked: PickupItem[]) => goTo(boothSessionPath(picked));
  const dawName = !dawKind ? 'the DAW' : dawKind === 'none' ? 'the built-in recorder' : dawKind;

  return (
    <div className="grid items-start gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_360px]">
      <PickupsTable
        pickups={list.pickups}
        read={read}
        onReload={() => void load()}
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
