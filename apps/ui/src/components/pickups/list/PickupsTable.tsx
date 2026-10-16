import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { PickupItem } from '../../../api/contracts/pickups';
import { useOverlay } from '../../../overlay/OverlayProvider';
import type { OverlayService } from '../../../overlay/overlayService';
import { Button } from '../../primitives/Button';
import { Checkbox } from '../../primitives/Checkbox';
import { ChapterStepper } from '../../primitives/ChapterStepper';
import { Heading } from '../../primitives/Heading';
import { IconButton } from '../../primitives/IconButton';
import { PANEL_FRAME_CLASS, PANEL_HEADER_CLASS } from '../../primitives/panelStyles';
import { Popover } from '../../primitives/Popover';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { AddPickup } from './AddPickup';
import { clock, groupByChapter, reasonSentence, inScope, sourceLabel, sourceTitle, typeLabel, typeTone, ALL_SCOPE, type ChapterRef } from './pickupRows';
import { ScriptLine } from './ScriptLine';
import { PICKUP_ROW, usePickupsContextMenu } from './usePickupsContextMenu';

/** What a removal gives back to undo it: the page's journal entry. */
export type RemoveUndo = () => Promise<{ ok: true } | { ok: false; refusal: { reason: string } }>;

/** Where the host's list stands: being read, read (with the reason a later read failed, if one did) or not readable at all. */
export type PickupsRead = { kind: 'loading' } | { kind: 'ready'; readAt: number; trouble?: string } | { kind: 'failed'; message: string };

/** The DAW as the head needs it: whether the recording check can run, and the host's sentence when it cannot. */
export type DawGate = { available: boolean; message?: string };

/** Why Play is off: the app has no player for the original recording around a line yet (the Booth plays a take, the Editing page a chapter). */
const PLAY_OFF = 'Playing the original around a line is not available here yet. Open the line in the Booth to hear and re-record it.';
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
  read,
  onReload,
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
  onOpenInBooth,
  onOpenInScript,
  onGoToProof,
}: {
  /** Every pickup the host lists. */
  pickups: readonly PickupItem[];
  read: PickupsRead;
  /** Reads the list again now (Check again). */
  onReload: () => void;
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
  onOpenInBooth: (pickups: PickupItem[]) => void;
  onOpenInScript: (chapterId: string) => void;
  /** Goes to the note a pickup came from, in Proof; with no id, to Proof. */
  onGoToProof: (findingId?: string) => void;
}) {
  const overlay = useOverlay();
  const body = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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
      await said(overlay, async () => {
        undo = await onRemove(pickup.id);
      });
      if (undo) overlay.toastUndo(`Removed ${clock(pickup.time)} from pickups.`, undo);
    });

  usePickupsContextMenu(list, {
    onSetIncluded: setIncluded,
    onSetDone: setDone,
    onRemove: (id) => {
      const pickup = list.find((p) => p.id === id);
      if (pickup) remove(pickup);
    },
    onOpenInBooth,
    onOpenInScript,
    onGoToNote: (pickup) => onGoToProof(pickup.findingId),
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

  return (
    <section aria-label="Pickups" className={`${PANEL_FRAME_CLASS} min-w-0`}>
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
            onClick={() => onCheck([...chaptersToCheck])}
          />
          <Popover label="Add a pickup by hand" open={adding} onOpenChange={setAdding} trigger={<IconButton action="add" label="Add a pickup by hand" />}>
            {addTo && <AddPickup chapterId={addTo.id} chapterName={addTo.name} onAdd={onAdd} onDone={() => setAdding(false)} />}
          </Popover>
        </div>
      </div>
      {read.kind === 'ready' && read.trouble && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 text-[0.875rem]"
        >
          <span>
            Can’t tell if this list is current. {read.trouble} Last read at {new Date(read.readAt).toLocaleTimeString()}.
          </span>
          <Button variant="secondary" size="sm" onClick={onReload}>
            Check again
          </Button>
        </div>
      )}
      {read.kind === 'loading' ? (
        <div role="status" className="p-6 text-center text-[var(--text-muted)]">
          Reading the pickup list…
        </div>
      ) : read.kind === 'failed' ? (
        <div role="alert" className="flex flex-col items-center gap-2 p-6 text-center">
          <h2 className="font-semibold">The pickup list could not be read</h2>
          <span className="text-[var(--text-muted)]">{read.message}</span>
          <Button onClick={onReload}>Check again</Button>
        </div>
      ) : list.length > 0 ? (
        <div ref={body} className="overflow-auto" tabIndex={0} role="group" aria-label="Pickups scroll area">
          <Table label="Pickups" className="min-w-[44rem]">
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
                    /* native-control-ok: a pickup row keeps one row in the tab order and its own Up, Down, Space and Enter keys; TableRow makes every row a tab stop. */
                    <tr
                      key={pickup.id}
                      {...{ [PICKUP_ROW]: pickup.id }}
                      tabIndex={pickup.id === tabbable ? 0 : -1}
                      aria-selected={pickup.id === selected}
                      onClick={(event) => {
                        if ((event.target as Element).closest(OWN_KEYS)) return;
                        setSelected(pickup.id);
                        event.currentTarget.focus();
                      }}
                      onKeyDown={(event) => rowKey(event, pickup)}
                      className={`focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)] ${pickup.id === selected ? 'bg-[var(--row-selected)]' : ''}`}
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
                          <StatusBadge tone={typeTone(pickup)} label={typeLabel(pickup)} shape="tag" />
                        </span>
                      </TableCell>
                      <TableCell style={{ fontSize: 16 }}>
                        <ScriptLine text={pickup.script} />
                      </TableCell>
                      <TableCell muted>
                        <span title={sourceTitle(pickup)}>{sourceLabel(pickup)}</span>
                      </TableCell>
                      <TableCell>
                        <span title={pickup.done && pickup.waiting ? WAITING : undefined}>
                          <StatusBadge tone={pickup.done ? 'success' : 'neutral'} label={pickup.done ? 'Recorded' : 'Open'} />
                          {pickup.done && pickup.waiting && (
                            <span className="mt-1 block text-[0.75rem] leading-tight text-[var(--text-muted)]">Not in the DAW yet</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-nowrap items-center justify-end gap-1">
                          <IconButton action="play" label="Play the original around this line" size="sm" disabledReason={PLAY_OFF} />
                          <IconButton action="openInBooth" label="Open in Booth at this line" size="sm" onClick={() => onOpenInBooth([pickup])} />
                          <IconButton
                            action={pickup.done ? 'markedDone' : 'markDone'}
                            label={pickup.done ? 'Mark open again' : 'Mark recorded'}
                            size="sm"
                            onClick={() => setDone(pickup.id, !pickup.done)}
                          />
                          <IconButton action="remove" label="Remove from pickups" size="sm" variant="danger" onClick={() => remove(pickup)} />
                        </div>
                      </TableCell>
                    </tr>
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

/** A chapter's group row, "<n> open", then its pickups. */
function GroupRows({ name, open, children }: { name: string; open: number; children: ReactNode }) {
  return (
    <>
      <TableRow className="bg-[var(--surface-2)]">
        <TableCell colSpan={7}>
          <b>{name}</b> <span className={`text-[var(--text-muted)] ${MONO}`}>· {open} open</span>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}
