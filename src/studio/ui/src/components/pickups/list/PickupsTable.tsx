import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { PickupItem } from '../../../api/contracts/pickups';
import { useOverlay } from '../../../overlay/OverlayProvider';
import type { OverlayService } from '../../../overlay/overlayService';
import { Button } from '../../primitives/Button';
import { Checkbox } from '../../primitives/Checkbox';
import { ChapterStepper } from '../../primitives/ChapterStepper';
import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';
import { Heading } from '../../primitives/Heading';
import { IconButton } from '../../primitives/IconButton';
import { PANEL_FRAME_CLASS, PANEL_HEADER_CLASS } from '../../primitives/panelStyles';
import { Popover } from '../../primitives/Popover';
import { KindChip } from '../../primitives/KindChip';
import { StatusBadge } from '../../primitives/StatusBadge';
import { statusLabel, statusTone } from '../../../kinds/statusTone';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { AddPickup } from './AddPickup';
import { clock, groupByChapter, reasonSentence, inScope, sourceLabel, sourceTitle, pickupKind, typeLabel, ALL_SCOPE, type ChapterRef } from './pickupRows';
import { ScriptLine } from './ScriptLine';
import { FINE_LABEL, fineUnavailable, NO_NOTE, PICKUP_ROW, usePickupsContextMenu } from './usePickupsContextMenu';
import { ARRIVE_CLASSES } from '../../primitives/changeHighlight';

/** What a removal gives back to undo it: the page's journal entry. */
export type RemoveUndo = () => Promise<{ ok: true } | { ok: false; refusal: { reason: string } }>;

/** Where the host's list stands: being read, read (with the reason a later read failed, if one did) or not readable at all. */
export type PickupsRead = { kind: 'loading' } | { kind: 'ready'; readAt: number; trouble?: string } | { kind: 'failed'; message: string };

/** The DAW as the head needs it: whether the recording check can run, and the host's sentence when it cannot. */
export type DawGate = { available: boolean; message?: string };

/** Why Play is off when the page lends no player. */
const PLAY_OFF = 'Playing the original around a line is not available here. Open the line in the Booth to hear and re-record it.';
/** A pickup row is 57 px tall (mock `Pickups.tsx`); its icon buttons are 36 px. */
const ROW_HEIGHT = '[&>td]:h-[57px]';

/** The page's player for the original recording around a line: the line playing now, play or stop, and why a line cannot be heard. */
export type OriginalPlayer = {
  playingId: string | null;
  play: (pickup: PickupItem) => void;
  unavailable: (pickup: PickupItem) => string | undefined;
};
/** Why a recorded line says it is not in the DAW yet. */
const WAITING = 'The line is recorded here. The DAW did not take the change yet; it is written to the pickup marker the next time the DAW answers.';
const MONO = "font-['IBM_Plex_Mono',ui-monospace,monospace]";
/** A control inside a row has its own key handling; the row's keys are for the row itself. */
const OWN_KEYS = 'button, a, input, textarea, select, [role="checkbox"]';

/** Runs a handler that may refuse; a refusal is shown as a toast with the host's own words. */
async function said(overlay: OverlayService, run: () => unknown): Promise<void> {
  try {
    await run();
  } catch (error) {
    overlay.toast(reasonSentence(error), { tone: 'error' });
  }
}

/**
 * The Pickups list (mock `Pickups.tsx`): the page head with the chapter stepper, Check recordings and Add a pickup by hand, then the pickups
 * grouped by chapter. It points at the Booth and does no recording itself: there is no Punch and no Next here (DQ-6). Every change is a
 * callback; the page owns the host calls and the journal.
 */
export function PickupsTable({
  pickups,
  returnTo = null,
  reveal = null,
  read,
  onReload,
  checking = false,
  chapters,
  scope,
  currentChapterId,
  chaptersToCheck,
  daw,
  onScope,
  onStep,
  onCheck,
  onAdd,
  onSetIncluded,
  onSetDone,
  onRemove,
  original,
  onOpenInBooth,
  onOpenInScript,
  onGoToProof,
  onFine,
  where,
}: {
  /** Every pickup the host lists. */
  pickups: readonly PickupItem[];
  /** The line to select and focus once it is listed: the one the narrator opened in the Booth and came back from. */
  returnTo?: string | null;
  /** A line the jump menu picked: selected and focused once it is drawn. */
  reveal?: { id: string; n: number } | null;
  read: PickupsRead;
  /** Reads the list again now (Retry on a failed read, Check again over a list already shown). */
  onReload: () => void;
  /** A Check again is being answered. */
  checking?: boolean;
  chapters: readonly ChapterRef[];
  /** The stepper's value: a chapter id, or `ALL_SCOPE`. */
  scope: string;
  /** The chapter a hand-added line goes to. */
  currentChapterId: string;
  /** The chapters whose recording check is not current: what Check recordings opens with. */
  chaptersToCheck: readonly string[];
  daw: DawGate;
  onScope: (scope: string) => void;
  onStep: (direction: -1 | 1) => void;
  onCheck: (chapterIds: string[]) => void;
  onAdd: (chapterId: string, time: number, line: string) => Promise<unknown>;
  onSetIncluded: (id: string, included: boolean) => Promise<unknown>;
  onSetDone: (id: string, done: boolean) => Promise<unknown>;
  /** Removes the pickup and answers how to put it back; the list offers that as Undo. */
  onRemove: (id: string) => Promise<RemoveUndo | undefined>;
  /** Plays the original recording around a line; without it the button is off. */
  original?: OriginalPlayer;
  onOpenInBooth: (pickups: PickupItem[]) => void;
  onOpenInScript: (chapterId: string) => void;
  /** Goes to the note a pickup came from, in Proof; with no id, to Proof. */
  onGoToProof: (findingId?: string) => void;
  /** Marks a line from a note fine as read (its note dismissed, so it leaves the list) and answers how to take that back. */
  onFine?: (pickup: PickupItem) => Promise<{ undo: RemoveUndo; entry: number } | undefined>;
  /** Show where for the selected line: its paragraph and the ones around it (research note A4). */
  where?: (pickup: PickupItem) => ReactNode;
}) {
  const overlay = useOverlay();
  const body = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  /* Back from the Booth: select the line the narrator left from and put focus on it, once, when it first appears. */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !returnTo || !pickups.some((pickup) => pickup.id === returnTo)) return;
    restored.current = true;
    setSelected(returnTo);
    body.current?.querySelector<HTMLTableRowElement>(`tr[${PICKUP_ROW}="${CSS.escape(returnTo)}"]`)?.focus();
  }, [returnTo, pickups]);

  useEffect(() => {
    if (!reveal) return;
    setSelected(reveal.id);
    // The pick can change the chapter showing, so the row exists only after this render has drawn.
    const frame = requestAnimationFrame(() => body.current?.querySelector<HTMLTableRowElement>(`tr[${PICKUP_ROW}="${CSS.escape(reveal.id)}"]`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [reveal]);

  const list = inScope(pickups, scope);
  const groups = groupByChapter(list, chapters);
  const tabbable = list.some((pickup) => pickup.id === selected) ? selected : (list[0]?.id ?? null);
  const addTo = chapters.find((chapter) => chapter.id === currentChapterId) ?? chapters[0];

  /* A press on a line whose last change has not been answered is ignored: a second Remove would be refused ("not in the list") and a second Mark recorded would flip the first back. */
  const inFlight = useRef(new Set<string>());
  const once = (id: string, run: () => Promise<void>): void => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    void run().finally(() => inFlight.current.delete(id));
  };
  const setIncluded = (id: string, included: boolean) => once(id, () => said(overlay, () => onSetIncluded(id, included)));
  const setDone = (id: string, done: boolean) => once(id, () => said(overlay, () => onSetDone(id, done)));
  const remove = (pickup: PickupItem) =>
    once(pickup.id, async () => {
      let undo: RemoveUndo | undefined;
      let removed = false;
      /* Focus goes to the line that takes this one's place as the page draws it (grouped by chapter, not in the host's order), so a keyboard user keeps their place instead of starting again from the top. */
      const drawn = [...(body.current?.querySelectorAll<HTMLTableRowElement>(`tr[${PICKUP_ROW}]`) ?? [])].map((row) => row.getAttribute(PICKUP_ROW));
      const at = drawn.indexOf(pickup.id);
      const nextId = drawn[at + 1] ?? drawn[at - 1] ?? null;
      await said(overlay, async () => {
        undo = await onRemove(pickup.id);
        removed = true;
      });
      if (!removed) return;
      if (undo) overlay.toastUndo(`Removed ${clock(pickup.time)} from pickups.`, undo);
      else overlay.toast(`Removed ${clock(pickup.time)} from pickups. A line from a check or a note stays off the list, so there is no Undo.`);
      requestAnimationFrame(() => {
        const row = nextId && body.current?.querySelector<HTMLTableRowElement>(`tr[${PICKUP_ROW}="${CSS.escape(nextId)}"]`);
        if (row && nextId) {
          setSelected(nextId);
          row.focus();
        } else region.current?.focus();
      });
    });

  const fine = (pickup: PickupItem) =>
    once(pickup.id, async () => {
      if (!onFine || fineUnavailable(pickup)) return;
      let answer: { undo: RemoveUndo; entry: number } | undefined;
      let done = false;
      await said(overlay, async () => {
        answer = await onFine(pickup);
        done = true;
      });
      if (!done) return;
      const text = `${clock(pickup.time)} is fine as read: its note on Proof is cleared and it is off the list.`;
      if (answer) overlay.toastUndo(text, answer.undo, { entry: answer.entry });
      else overlay.toast(text);
      region.current?.focus();
    });

  usePickupsContextMenu(list, {
    onSetIncluded: setIncluded,
    onSetDone: setDone,
    onRemove: (id) => {
      const pickup = list.find((p) => p.id === id);
      if (pickup) remove(pickup);
    },
    onPlayOriginal: original?.play,
    playOriginalUnavailable: original?.unavailable,
    onOpenInBooth,
    onOpenInScript,
    onGoToNote: (pickup) => onGoToProof(pickup.findingId),
    ...(onFine ? { onFine: fine } : {}),
  });

  /* Up and Down move between lines; Space includes or leaves out; Enter opens the line in the Booth. */
  const rowKey = (event: KeyboardEvent<HTMLTableRowElement>, pickup: PickupItem) => {
    if ((event.target as Element).closest(OWN_KEYS)) return;
    const rows = [...(body.current?.querySelectorAll<HTMLTableRowElement>(`tr[${PICKUP_ROW}]`) ?? [])];
    const at = rows.indexOf(event.currentTarget);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = rows[Math.max(0, Math.min(rows.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
      setSelected(next.getAttribute(PICKUP_ROW));
      next.focus();
    } else if (event.key === ' ') {
      event.preventDefault();
      if (!pickup.done) {
        setSelected(pickup.id);
        setIncluded(pickup.id, !pickup.included);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onOpenInBooth([pickup]);
    }
  };

  const checkReason = daw.available ? undefined : daw.message || 'The DAW is not answering.';
  const checkReasonId = useId();

  return (
    /* tabIndex -1: with no line left to focus, the region itself takes focus so the narrator is not dropped to the top of the page. */
    <section ref={region} tabIndex={-1} aria-label="Pickups" className={`${PANEL_FRAME_CLASS} min-w-0 focus:outline-none`}>
      <div className={PANEL_HEADER_CLASS}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <Heading title="Pickups" />
          <ChapterStepper chapters={[...chapters]} value={scope} allowAll stepKeys={['Alt+↑', 'Alt+↓']} onChange={onScope} onStep={onStep} />
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            action="checkRecordings"
            label="Check recordings"
            aria-haspopup="dialog"
            disabledReason={checkReason}
            aria-describedby={checkReason ? checkReasonId : undefined}
            onClick={() => onCheck([...chaptersToCheck])}
          />
          {checkReason && (
            <span id={checkReasonId} className="sr-only">
              {checkReason}
            </span>
          )}
          <Popover label="Add a pickup by hand" open={adding} onOpenChange={setAdding} trigger={<IconButton action="add" label="Add a pickup by hand" />}>
            {addTo ? (
              <AddPickup chapterId={addTo.id} chapterName={addTo.name} onAdd={onAdd} onDone={() => setAdding(false)} />
            ) : (
              <p className="m-0 max-w-[18rem] text-[var(--text-muted)]">
                A pickup can be added once the list has been read. If it could not be read, use Retry.
              </p>
            )}
          </Popover>
        </div>
      </div>
      {read.kind === 'ready' && read.trouble && (
        <div
          role="status"
          className={`flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[0.875rem] ${ARRIVE_CLASSES}`}
        >
          <span>
            Can’t tell if this list is current. {read.trouble} Last read at {new Date(read.readAt).toLocaleTimeString()}.
          </span>
          <Button variant="secondary" size="sm" pending={checking} onClick={onReload}>
            Check again
          </Button>
        </div>
      )}
      {read.kind === 'loading' ? (
        <LoadingRegion label="Loading the pickups" status="Reading the pickup list…" className="flex flex-col gap-2 p-4">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-9" />
          ))}
        </LoadingRegion>
      ) : read.kind === 'failed' ? (
        <div role="alert" className="flex flex-col items-center gap-2 p-6 text-center">
          <h2 className="font-semibold">The pickup list could not be read</h2>
          <span className="text-[var(--text-muted)]">{read.message}</span>
          <Button pending={checking} onClick={onReload}>
            Retry
          </Button>
        </div>
      ) : list.length > 0 ? (
        <div ref={body} className="scroll-x-edges overflow-auto" tabIndex={0} role="group" aria-label="Pickups scroll area">
          <Table label="Pickups" className="min-w-[40rem]">
            <TableHead>
              <TableRow>
                <TableHeader hiddenLabel="Include in the session" style={{ width: 36 }} />
                <TableHeader>Time</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Line to re-record</TableHeader>
                <TableHeader>From</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader hiddenLabel="Actions" />
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map((group) => (
                <GroupRows key={group.chapter.id} name={group.chapter.name} open={group.open}>
                  {group.items.map((pickup) => (
                    <Fragment key={pickup.id}>
                      {/* native-control-ok: a pickup row keeps one row in the tab order and its own Up, Down, Space and Enter keys; TableRow makes every row a tab stop. */}
                      <tr
                        {...{ [PICKUP_ROW]: pickup.id }}
                        tabIndex={pickup.id === tabbable ? 0 : -1}
                        aria-selected={pickup.id === selected}
                        onClick={(event) => {
                          if ((event.target as Element).closest(OWN_KEYS)) return;
                          setSelected(pickup.id);
                          event.currentTarget.focus();
                        }}
                        onKeyDown={(event) => rowKey(event, pickup)}
                        className={`${ROW_HEIGHT} cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)] ${pickup.id === selected ? 'bg-[var(--row-selected)]' : ''}`}
                      >
                        <TableCell>
                          <Checkbox checked={pickup.included && !pickup.done} disabled={pickup.done} onChange={(checked) => setIncluded(pickup.id, checked)}>
                            <span className="sr-only">Include {clock(pickup.time)} in the session</span>
                          </Checkbox>
                        </TableCell>
                        <TableCell numeric align="left">
                          {clock(pickup.time)}
                        </TableCell>
                        <TableCell>
                          <span className="whitespace-nowrap">
                            <PickupType pickup={pickup} />
                          </span>
                        </TableCell>
                        <TableCell style={{ fontSize: 16 }}>
                          <ScriptLine text={pickup.script} plain={pickup.source === 'you'} />
                        </TableCell>
                        <TableCell muted>
                          <span title={sourceTitle(pickup)}>{sourceLabel(pickup)}</span>
                        </TableCell>
                        <TableCell>
                          <span title={pickup.done && pickup.waiting ? WAITING : undefined}>
                            <StatusBadge
                              tone={statusTone(pickup.done ? 'recorded' : 'open_pickup')}
                              label={statusLabel(pickup.done ? 'recorded' : 'open_pickup')}
                            />
                            {pickup.done && pickup.waiting && (
                              <span className="mt-1 block text-[0.75rem] leading-tight text-[var(--text-muted)]">Not in the DAW yet</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-nowrap items-center justify-end gap-1">
                            <IconButton
                              action={original?.playingId === pickup.id ? 'stop' : 'play'}
                              label={original?.playingId === pickup.id ? 'Stop the original' : 'Hear the original in context'}
                              disabledReason={original ? original.unavailable(pickup) : PLAY_OFF}
                              onClick={() => original?.play(pickup)}
                            />
                            <IconButton action="openInBooth" label="Open in Booth at this line" onClick={() => onOpenInBooth([pickup])} />
                            <IconButton
                              action={pickup.done ? 'markedDone' : 'markDone'}
                              label={pickup.done ? 'Mark open again' : 'Mark recorded'}
                              onClick={() => setDone(pickup.id, !pickup.done)}
                            />
                            <IconButton action="remove" label="Remove from pickups" variant="danger" onClick={() => remove(pickup)} />
                          </div>
                        </TableCell>
                      </tr>
                      {pickup.id === selected && (
                        <ShowWhere
                          pickup={pickup}
                          where={where}
                          canFine={Boolean(onFine)}
                          onFine={() => fine(pickup)}
                          onGoToNote={() => onGoToProof(pickup.findingId)}
                        />
                      )}
                    </Fragment>
                  ))}
                </GroupRows>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : pickups.length > 0 && scope !== ALL_SCOPE ? (
        <div className="p-6 text-center">
          <h2 className="font-semibold">No pickups for this chapter</h2>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 p-6 text-center">
          <h2 className="font-semibold">No pickups queued</h2>
          <span className="text-[var(--text-muted)]">Mark a proof note “Needs pickup” and it appears here.</span>
          <IconButton action="goTo" label="Go to Proof" onClick={() => onGoToProof()} />
        </div>
      )}
    </section>
  );
}

/**
 * Show where under the selected line (research note A4): its paragraph with the ones before and after, from the page, and the two
 * verbs a line from a note has on Pickups, Fine, not a pickup and Go to the note in Proof. A line from no note has both off, saying why.
 */
function ShowWhere({
  pickup,
  where,
  canFine,
  onFine,
  onGoToNote,
}: {
  pickup: PickupItem;
  where?: (pickup: PickupItem) => ReactNode;
  canFine: boolean;
  onFine: () => void;
  onGoToNote: () => void;
}) {
  const noNote = !pickup.findingId;
  return (
    <TableRow data={{ 'data-show-where': pickup.id }}>
      <TableCell colSpan={7} className="bg-[var(--surface-2)]">
        <section aria-label={`Where ${clock(pickup.time)} is`} className="sticky left-2 flex max-w-[min(60rem,calc(100vw-5rem))] flex-col gap-2 py-1">
          {where?.(pickup)}
          <div className="flex flex-wrap items-center gap-2">
            {canFine && (
              <Button variant="secondary" size="sm" aria-disabled={noNote || undefined} onClick={noNote ? undefined : onFine}>
                {FINE_LABEL}
              </Button>
            )}
            <Button variant="secondary" size="sm" aria-disabled={noNote || undefined} onClick={noNote ? undefined : onGoToNote}>
              Go to the note in Proof
            </Button>
            {noNote && <span className="text-sm text-[var(--text-muted)]">{NO_NOTE}</span>}
          </div>
        </section>
      </TableCell>
    </TableRow>
  );
}

/** A chapter's group row, "<n> open", then its pickups. */
/** The Type column's chip: the kind of finding it is, drawn as that kind is everywhere; a type the app has no kind for is a neutral tag. */
function PickupType({ pickup }: { pickup: PickupItem }) {
  const kind = pickupKind(pickup);
  return kind ? <KindChip kind={kind} label={typeLabel(pickup)} /> : <StatusBadge tone="neutral" label={typeLabel(pickup)} shape="tag" />;
}

function GroupRows({ name, open, children }: { name: string; open: number; children: ReactNode }) {
  return (
    <>
      <TableRow>
        <TableCell colSpan={7} className="bg-[var(--surface-2)]">
          <b>{name}</b> <span className={`text-[var(--text-muted)] ${MONO}`}>· {open} open</span>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}
