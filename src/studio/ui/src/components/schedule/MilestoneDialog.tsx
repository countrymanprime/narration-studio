import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ProductionMilestone } from '../../api/contracts/production';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { DateField } from '../primitives/DateField';
import { Field, FIELD_LABEL_CLASSES } from '../primitives/Field';
import { Select } from '../primitives/Select';
import { NumberInput } from '../primitives/NumberInput';
import { blankDraft, draftOf, fieldRefusals, MAX_N, milestoneFromDraft, type MilestoneDraft, type RefusedField } from './draft';
import type { LiveBounds } from './liveBounds';
import { clamp } from '../../clamp';
import { chaptersOf, measOf, measureOptions, minutesOf } from './measures';
import type { PlatformCapability } from './profiles';

export type MilestoneDialogProps = {
  /** The milestone being edited; none adds a new one. */
  existing?: ProductionMilestone;
  /** The project's delivery profile, which decides whether the checkpoint is offered. */
  profileId: string | undefined;
  reportedCapabilities?: readonly PlatformCapability[];
  /** The range of an N as the chapter list stands now, asked when the dialog needs it: the list can be read again while the dialog is open. */
  bounds: LiveBounds;
  /** Opens with the note ready to type in, from the note button. */
  focusNote?: boolean;
  /** Saves the draft: the sentence saying why it was refused, or nothing when it was saved. */
  onSave: (draft: MilestoneDraft) => Promise<string | undefined>;
  onCancel: () => void;
};

const FIELD_ORDER = ['name', 'date', 'n'] as const;

/** Scrolls `body` so the field and the alert under it are both in view when they fit together, and otherwise keeps the field in view. */
function showTogether(body: HTMLElement, field: HTMLElement, alert: HTMLElement): void {
  const view = body.getBoundingClientRect();
  const a = field.getBoundingClientRect();
  const b = alert.getBoundingClientRect();
  const top = Math.min(a.top, b.top);
  const bottom = Math.max(a.bottom, b.bottom);
  if (bottom - top > view.height) {
    field.scrollIntoView?.({ block: 'nearest' });
    return;
  }
  if (top < view.top) body.scrollTop += top - view.top;
  else if (bottom > view.bottom) body.scrollTop += bottom - view.bottom;
}

/**
 * Add or change every detail of a milestone (the mock's MilestoneDialog): name, due date, what it measures with its N, a note and done.
 * Saving is one undoable command and Cancel changes nothing. The N is saved as typed, or refused with the range the book allows.
 */
export function MilestoneDialog({ existing, profileId, reportedCapabilities, bounds, focusNote, onSave, onCancel }: MilestoneDialogProps) {
  const [draft, setDraft] = useState<MilestoneDraft>(() => (existing ? draftOf(existing) : blankDraft()));
  const [refused, setRefused] = useState<{ text: string; field?: RefusedField }>();
  /** The fields a save was refused about: they stay marked for as long as they are wrong, whatever else is fixed or broken meanwhile. */
  const [flagged, setFlagged] = useState<readonly RefusedField[]>([]);
  const live = useSyncExternalStore(bounds.subscribe, bounds.get);
  const form = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  /** A save is out: a second submit before it ends is dropped. A ref, as a render may not have happened between two Enters. */
  const inFlight = useRef(false);
  /** The N fields the narrator has typed in: a typed number is never replaced by the starting one, whatever it equals. */
  const typed = useRef({ chapters: false, minutes: false });
  const [refusals, setRefusals] = useState(0);
  const set = (patch: Partial<MilestoneDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const options = measureOptions(profileId, existing?.measure, reportedCapabilities);
  /** The N a measure starts at when picked: the default, held to what the book has, so the field shows the number it will save. A milestone's own N and a typed one stay. */
  const startingN = (measure: string): Partial<MilestoneDraft> => {
    if (measure !== 'chN' && measure !== 'minN') return {};
    const field = measure === 'chN' ? 'chapters' : 'minutes';
    if (typed.current[field] || (existing && measOf(existing.measure) === measure)) return {};
    const start = measure === 'chN' ? chaptersOf(undefined) : minutesOf(undefined);
    return { [field]: String(clamp(start, 1, bounds.get()[field])) };
  };
  // Each field is judged on its own. Once a save has been refused, the fields it was refused about stay marked while they are wrong (their reason in the newest words), and when
  // none of them is, the first field still wrong is marked, so a field that is still wrong is never dropped; the others wait for a save to be refused about them.
  const problems = fieldRefusals(draft, existing, live);
  const wrong = FIELD_ORDER.filter((field) => problems[field]);
  const stillFlagged = wrong.filter((field) => flagged.includes(field));
  const shown: readonly RefusedField[] = !refused ? [] : stillFlagged.length > 0 ? stillFlagged : wrong.slice(0, 1);
  const alertText = shown.length > 0 ? problems[shown[0]] : refused && !refused.field ? refused.text : undefined;
  /** What a field the refusal is about is given: marked invalid and described by the alert. */
  const about = (field: RefusedField) => ({ invalid: shown.includes(field), describedBy: shown.includes(field) ? 'milestone-problem' : undefined });
  // A refusal is brought into view. Focus goes to the field it is about; the field and the alert are both scrolled into view when they fit together in the body, and when they
  // do not (a tiny window) the field stays in view and the alert is reachable below it. A refusal about no field (the list changed) scrolls the alert into view.
  useEffect(() => {
    if (!refusals || !form.current) return;
    const field = refused?.field;
    const target =
      field === 'name'
        ? form.current.querySelector<HTMLElement>('input')
        : field === 'date'
          ? form.current.querySelector<HTMLElement>('#milestone-due')
          : field === 'n'
            ? form.current.querySelector<HTMLElement>('input[aria-label^="How many"]')
            : null;
    target?.focus({ preventScroll: true });
    const alert = form.current.querySelector<HTMLElement>('[role="alert"]');
    const body = form.current.firstElementChild as HTMLElement | null;
    if (!alert) return;
    if (target && body) showTogether(body, target, alert);
    else alert.scrollIntoView?.({ block: 'nearest' });
    // Once per refusal: editing the draft afterwards must not pull focus back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refusals]);
  /** What a "first N" box is given: the number while the text is one, and the text itself while it is not, so a wrong N stays as typed until it is saved or fixed. */
  const nField = (field: 'chapters' | 'minutes') => {
    const text = draft[field];
    const isCount = /^[1-9]\d*$/.test(text.trim());
    return {
      value: isCount ? Number(text.trim()) : 1,
      heldText: isCount ? undefined : text,
      onValueChange: (n: number) => {
        typed.current[field] = true;
        set({ [field]: String(n) });
      },
      onRefused: (text: string) => {
        typed.current[field] = true;
        set({ [field]: text });
      },
    };
  };
  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    const text = await onSave(draft);
    const made = milestoneFromDraft(draft, existing, bounds.get());
    const field = 'refusal' in made && made.refusal === text ? made.field : undefined;
    setRefused(text ? { text, ...(field ? { field } : {}) } : undefined);
    if (text && field) setFlagged((now) => (now.includes(field) ? now : [...now, field]));
    if (text) setRefusals((n) => n + 1);
    inFlight.current = false;
    setSaving(false);
  };
  return (
    /* The dialog's 80dvh less its header and the body's padding: the fields scroll inside it and the footer stays on screen (as Check recordings does). */
    <form
      ref={form}
      className="flex max-h-[calc(80dvh-7rem)] min-h-0 flex-col gap-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      // Ctrl+Enter (Cmd+Enter on a Mac) saves from anywhere in the form, the note box included, where a plain Enter is a new line.
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void save();
        }
      }}
    >
      <div className="scroll-y-edges flex min-h-0 flex-1 [scrollbar-gutter:auto] flex-col gap-3.5 overflow-y-auto">
        <Field label="Name" value={draft.name} onChange={(name) => set({ name })} autoFocus={!focusNote} {...about('name')} />
        <div>
          <label className={FIELD_LABEL_CLASSES} htmlFor="milestone-due">
            Due
          </label>
          <DateField
            id="milestone-due"
            value={draft.date}
            onChange={(date) => set({ date })}
            className="mt-2"
            aria-invalid={shown.includes('date') ? true : undefined}
            aria-describedby={shown.includes('date') ? 'milestone-problem' : undefined}
          />
        </div>
        <div>
          <span className={FIELD_LABEL_CLASSES} id="milestone-measure-label">
            Measures
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select
              label="What the milestone measures"
              aria-describedby="milestone-measure-label"
              value={draft.measure}
              onChange={(measure) => set({ measure, ...startingN(measure) })}
              options={options}
              className="min-w-0 flex-1"
            />
            {(draft.measure === 'chN' || draft.measure === 'minN') && (
              <NumberInput
                label={draft.measure === 'chN' ? 'How many chapters' : 'How many finished minutes'}
                {...nField(draft.measure === 'chN' ? 'chapters' : 'minutes')}
                min={1}
                holdRefused
                max={clamp(live[draft.measure === 'chN' ? 'chapters' : 'minutes'], 1, MAX_N)}
                stepFrom={1}
                invalid={shown.includes('n')}
                aria-describedby={shown.includes('n') ? 'milestone-problem' : undefined}
                className="w-20!"
              />
            )}
          </div>
          {alertText && (
            <p id="milestone-problem" role="alert" className="text-[0.88rem] text-[var(--danger-text)]">
              {alertText}
            </p>
          )}
        </div>
        <Field label="Note" textarea value={draft.note} onChange={(note) => set({ note })} autoFocus={focusNote} />
      </div>
      {/* Done shares the button row, at its left (R3SH-9), rather than a row of its own over a half-empty one. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto">
          <Checkbox checked={draft.done} onChange={(done) => set({ done })}>
            Done
          </Checkbox>
        </span>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" pending={saving}>
          {existing ? 'Save' : 'Add milestone'}
        </Button>
      </div>
    </form>
  );
}
