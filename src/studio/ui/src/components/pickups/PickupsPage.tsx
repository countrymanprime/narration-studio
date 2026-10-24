import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PickupItem, PickupList } from '../../api/contracts/pickups';
import type { Measured } from '../../api/schemas/base';
import { headingName } from '../../chapterHeading';
import { CommandScope } from '../../input/router';
import { useCommand } from '../../input/useCommand';
import { useOverlay } from '../../overlay/OverlayProvider';
import { usePort } from '../../ports/usePort';
import { useJournal } from '../../studio/StudioProvider';
import { useCapability } from '../../useCapability';
import { useDawKind } from '../../useDawKind';
import type { ManuscriptChapter } from '../../types';
import { boothQuery } from '../booth/page/boothQuery';
import { openCheckRecordings } from '../recordingcheck/openCheckRecordings';
import { NeedManuscript } from '../layout/NeedManuscript';
import { ALL_SCOPE, clock, inScope, lineText, reasonSentence, type ChapterRef } from './list/pickupRows';
import { PickupWhere } from './list/PickupWhere';
import { announcePickupListChanged } from './pickupListChanged';
import { pickupToReturnTo, rememberPickupLeft } from './pickupReturn';
import { usePlayOriginal } from './list/usePlayOriginal';
import { PickupsTable, type PickupsRead, type RemoveUndo } from './list/PickupsTable';
import { SessionPanel } from './list/SessionPanel';
import { usePickupsPageCommands } from './usePickupsPageCommands';

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
 * Pickups (Studio Next mock `pages/Pickups.tsx`): the host's merged pickup list grouped by chapter, with the pickup session
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
  const findingsApi = usePort('findings');
  const journal = useJournal();
  const measurements = usePort('measurements');
  const daw = usePort('daw');
  const overlay = useOverlay();
  const original = usePlayOriginal((sentence) => overlay.toast(sentence, { tone: 'error' }));
  const review = useCapability('review');
  const markers = useCapability('markers');
  const dawKind = useDawKind();
  const [chapters, setChapters] = useState<ChapterRef[]>([]);
  const [list, setList] = useState<PickupList>({ pickups: [], leftOut: [] });
  const [read, setRead] = useState<PickupsRead>({ kind: 'loading' });
  const [scopeChoice, setScope] = useState(ALL_SCOPE);
  const [current, setCurrent] = useState('');
  /* The jump menu's pick of a line: the table selects it. `n` makes a second pick of the same line count. */
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  /* Back from the Booth lands on the line that was opened (the table selects it once the list is there). */
  const [returnTo] = useState(pickupToReturnTo);
  const [seconds, setSeconds] = useState<Measured<number>>(LOADING);
  /* Answers come back in any order and can be late: each request takes a number as it starts, and an answer older than one already shown is dropped. */
  const started = useRef(0);
  const shown = useRef(0);
  const showing = useRef(false);
  const [checking, setChecking] = useState(false);
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
      announcePickupListChanged();
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
    announcePickupListChanged();
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

  useCommand('editing.chapter.next', () => step(1), hasManuscript);
  useCommand('editing.chapter.prev', () => step(-1), hasManuscript);

  // A line added by hand can be put back; the host keeps an automatic line off once removed, so it has no Undo.
  const remove = async (id: string): Promise<RemoveUndo | undefined> => {
    const pickup = list.pickups.find((p) => p.id === id);
    await changing(pickupsApi.pickupsRemove(id));
    if (!pickup || pickup.source !== 'you' || pickup.time === null) return undefined;
    const { chapterId, time, script } = pickup;
    return async () => {
      try {
        await changing(pickupsApi.pickupsAdd(chapterId, time, script));
        return { ok: true };
      } catch (error) {
        return { ok: false, refusal: { reason: reasonSentence(error) } };
      }
    };
  };

  /*
   * Fine, not a pickup (research note A4): the line's note is dismissed through FindingsReview (Fine as read on Proof), which takes a
   * note's own line off the list. A check's gap that a note was attached to stays listed by the check, so it is removed too. Undo puts
   * the note back as it was; a removed gap stays off, as Remove does. It is one entry in the app's journal, touching the note as Proof's
   * decisions do, so Ctrl+Z, History and the toast's Undo all take back this change and not an earlier one.
   */
  const fine = async (pickup: PickupItem): Promise<{ undo: RemoveUndo; entry: number } | undefined> => {
    const id = pickup.findingId;
    if (!id) return undefined;
    const before = await findingsApi.findingsGet(id);
    const failed = (error: unknown) => ({ ok: false as const, refusal: { code: 'host_refused', reason: reasonSentence(error) } });
    const done = await journal.act({
      label: `Fine, not a pickup at ${clock(pickup.time)}`,
      touches: [`proof/finding/${id}`, 'pickups'],
      run: async () => {
        try {
          const after = await findingsApi.findingsReview({
            id,
            evidenceVersion: before.evidence_version ?? '',
            status: 'dismissed',
            note: before.review.note ?? '',
          });
          return { ok: true as const, value: after };
        } catch (error) {
          return failed(error);
        }
      },
      undo: async (after) => {
        try {
          await findingsApi.findingsReview({ id, evidenceVersion: after.evidence_version ?? '', status: before.review.status, note: before.review.note ?? '' });
          await changing(pickupsApi.pickupsList());
          return { ok: true as const, value: undefined };
        } catch (error) {
          return failed(error);
        }
      },
    });
    if (!done.ok) throw new Error(done.refusal.reason);
    await changing(pickup.source === 'speech' ? pickupsApi.pickupsRemove(pickup.id) : pickupsApi.pickupsList());
    const entry = done.value.id;
    return {
      entry,
      undo: async () => {
        const undone = await journal.undo(entry);
        return undone.ok ? { ok: true } : { ok: false, refusal: { reason: undone.refusal.reason } };
      },
    };
  };

  /* The host keeps one pickup per chapter and line: a repeat comes back as the same list, which the narrator would see as nothing happening. */
  const add = async (chapterId: string, time: number, line: string) => {
    const before = list.pickups.length;
    const answer = await pickupsApi.pickupsAdd(chapterId, time, line);
    if (answer.pickups.length <= before) {
      throw new Error('That line is already in this chapter’s list.');
    }
    await changing(Promise.resolve(answer));
  };

  const dawName = !dawKind ? 'the DAW' : dawKind === 'none' ? 'the built-in recorder' : dawKind;
  const addMarkers = async (picked: PickupItem[]) => {
    const placed = picked.filter((p): p is PickupItem & { at: number } => p.at !== null);
    const result = await daw.addPickupMarkers(placed.map((p) => ({ ref: p.id, start: p.at, tag: p.type, note: lineText(p) })));
    if (!result.ok) throw new Error(result.message);
    const lines = placed.length === 1 ? '1 line' : `${placed.length} lines`;
    overlay.toast(
      result.changed
        ? `Pickup ${placed.length === 1 ? 'marker' : 'markers'} for ${lines} ${placed.length === 1 ? 'is' : 'are'} in ${dawName}.`
        : `Those markers were already in ${dawName}.`,
    );
    await changing(pickupsApi.pickupsList());
  };

  usePickupsPageCommands({
    pickups: hasManuscript ? list.pickups : [],
    chapters,
    scope,
    inView,
    chaptersToCheck: list.leftOut.map((chapter) => chapter.chapterId),
    daw: { available: review.available, message: review.message },
    markers: { available: markers.available, message: markers.message },
    dawName,
    onScope: choose,
    onReveal: (id) => setReveal((before) => ({ id, n: (before?.n ?? 0) + 1 })),
    onCheck: (ids) => openCheckRecordings(ids),
    onOpenInBooth: (picked) => goTo(boothSessionPath(picked)),
    onAddMarkers: addMarkers,
    onError: (error) => overlay.toast(reasonSentence(error), { tone: 'error' }),
  });

  if (!hasManuscript) return <NeedManuscript title="Pickups" onImport={() => goTo('/')} />;

  const openInBooth = (picked: PickupItem[]) => {
    if (picked.length === 1) rememberPickupLeft(picked[0].id);
    goTo(boothSessionPath(picked));
  };

  return (
    <CommandScope kind="page">
      <div className="grid items-start gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_360px]">
        <PickupsTable
          pickups={list.pickups}
          returnTo={returnTo}
          reveal={reveal}
          read={read}
          checking={checking}
          onReload={() => {
            setChecking(true);
            void load().finally(() => alive.current && setChecking(false));
          }}
          chapters={chapters}
          scope={scope}
          currentChapterId={current || chapters[0]?.id || ''}
          chaptersToCheck={list.leftOut.map((chapter) => chapter.chapterId)}
          daw={{ available: review.available, message: review.message }}
          onScope={choose}
          onStep={step}
          onCheck={(ids) => openCheckRecordings(ids)}
          onAdd={add}
          onSetIncluded={(id, included) => changing(pickupsApi.pickupsSetIncluded(id, included))}
          onSetDone={(id, done) => changing(pickupsApi.pickupsSetDone(id, done))}
          onRemove={remove}
          original={{ ...original, play: (pickup) => void original.play(pickup) }}
          onOpenInBooth={openInBooth}
          onOpenInScript={goToScript}
          onGoToProof={(findingId) => goTo(findingId ? `/proof?finding=${encodeURIComponent(findingId)}` : '/proof')}
          onFine={fine}
          where={(pickup) => <PickupWhere pickup={pickup} manuscript={manuscriptApi} />}
        />
        <SessionPanel
          pickups={inView}
          chapters={chapters}
          unreadable={read.kind === 'failed'}
          loading={read.kind === 'loading'}
          seconds={seconds}
          dawName={dawName}
          markers={{ available: markers.available, message: markers.message }}
          onOpenInBooth={openInBooth}
          onAddMarkers={addMarkers}
        />
      </div>
    </CommandScope>
  );
}
