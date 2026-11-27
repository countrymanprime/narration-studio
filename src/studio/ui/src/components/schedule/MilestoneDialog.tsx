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

/**
 * Add or change every detail of a milestone (the mock's MilestoneDialog): name, due date, what it measures with its N, a note and done.
 * Saving is one undoable command and Cancel changes nothing. The N is saved as typed, or refused with the range the book allows.
 */
export function MilestoneDialog({ existing, profileId, reportedCapabilities, bounds, focusNote, onSave, onCancel }: MilestoneDialogProps) {
  const [draft, setDraft] = useState<MilestoneDraft>(() => (existing ? draftOf(existing) : blankDraft()));
  const [refused, setRefused] = useState<{ text: string; field?: RefusedField }>();
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
  // A refusal stands while its own field still earns it: filling in the name does not lift the mark on an N that is still wrong, and a book that grows past a typed N lifts it.
  const problems = fieldRefusals(draft, existing, live);
  const standing = refused && (!refused.field || problems[refused.field] === refused.text) ? refused : undefined;
  const marked = standing?.field;
  /** What a field the refusal is about is given: marked invalid and described by the alert. */
  const about = (field: RefusedField) => ({ invalid: marked === field, describedBy: marked === field ? 'milestone-problem' : undefined });
  // A refusal is brought into view. Focus goes to the field it is about and that field is kept in view (the alert announces the reason by itself); the alert is scrolled to only when
  // the N box is the field, which sits in the same row as it.
  useEffect(() => {
    if (!refusals || !form.current) return;
    const field = refused?.field;
    const target =
      field === 'name'
        ? form.current.querySelector<HTMLElement>('input')
        : field === 'date'
          ? form.current.querySelector<HTMLElement>('#milestone-due')
          : field === 'n'
            ? form.current.querySelector<HTMLElement>('input[aria-invalid="true"]')
            : null;
    target?.focus({ preventScroll: true });
    if (field === 'n' || !target) form.current.querySelector('[role="alert"]')?.scrollIntoView?.({ block: 'nearest' });
    else target.scrollIntoView?.({ block: 'nearest' });
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
    setRefused(text ? { text, ...('refusal' in made && made.refusal === text && made.field ? { field: made.field } : {}) } : undefined);
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
            aria-invalid={marked === 'date' ? true : undefined}
            aria-describedby={marked === 'date' ? 'milestone-problem' : undefined}
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
                invalid={marked === 'n'}
                aria-describedby={marked === 'n' ? 'milestone-problem' : undefined}
                className="w-20!"
              />
            )}
          </div>
          {refused && (!refused.field || standing) && (
            <p id="milestone-problem" role="alert" className="text-[0.88rem] text-[var(--danger-text)]">
              {refused.text}
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
