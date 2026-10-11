import { useState } from 'react';
import type { ProductionMilestone } from '../../api/contracts/production';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Field, FIELD_LABEL_CLASSES } from '../primitives/Field';
import { Select } from '../primitives/Select';
import { TextField } from '../primitives/TextField';
import { blankDraft, draftOf, type DraftBounds, type MilestoneDraft } from './draft';
import { measureOptions } from './measures';
import type { PlatformCapability } from './profiles';

export type MilestoneDialogProps = {
  /** The milestone being edited; none adds a new one. */
  existing?: ProductionMilestone;
  /** The project's delivery profile, which decides whether the checkpoint is offered. */
  profileId: string | undefined;
  reportedCapabilities?: readonly PlatformCapability[];
  bounds: DraftBounds;
  /** Opens with the note ready to type in, from the note button. */
  focusNote?: boolean;
  /** Saves the draft: the sentence saying why it was refused, or nothing when it was saved. */
  onSave: (draft: MilestoneDraft) => Promise<string | undefined>;
  onCancel: () => void;
};

const digits = (text: string): number => Number(text.replace(/\D/g, ''));

/**
 * Add or change every detail of a milestone (the mock's MilestoneDialog): name, due date, what it measures with its N, a note and done.
 * Saving is one undoable command and Cancel changes nothing. The N is kept between 1 and what the book has.
 */
export function MilestoneDialog({ existing, profileId, reportedCapabilities, bounds, focusNote, onSave, onCancel }: MilestoneDialogProps) {
  const [draft, setDraft] = useState<MilestoneDraft>(() => (existing ? draftOf(existing) : blankDraft()));
  const [problem, setProblem] = useState<string>();
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<MilestoneDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const options = measureOptions(profileId, existing?.measure, reportedCapabilities);
  const save = async () => {
    setSaving(true);
    setProblem(await onSave(draft));
    setSaving(false);
  };
  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Field label="Name" value={draft.name} onChange={(name) => set({ name })} autoFocus={!focusNote} />
      <Field label="Due" value={draft.date} onChange={(date) => set({ date })} placeholder="YYYY-MM-DD" />
      <div>
        <span className={FIELD_LABEL_CLASSES} id="milestone-measure-label">
          Measures
        </span>
        <div className="mt-2 flex items-center gap-2">
          <Select
            label="What the milestone measures"
            aria-describedby="milestone-measure-label"
            value={draft.measure}
            onChange={(measure) => set({ measure })}
            options={options}
            className="min-w-0 flex-1"
          />
          {draft.measure === 'chN' && (
            <TextField
              label="How many chapters"
              mono
              inputMode="numeric"
              value={String(draft.chapters)}
              onChange={(text) => set({ chapters: digits(text) })}
              onBlur={() => set({ chapters: Math.max(1, Math.min(Math.max(1, bounds.chapters), draft.chapters)) })}
              className="w-20!"
            />
          )}
          {draft.measure === 'minN' && (
            <TextField
              label="How many finished minutes"
              mono
              inputMode="numeric"
              value={String(draft.minutes)}
              onChange={(text) => set({ minutes: digits(text) })}
              onBlur={() => set({ minutes: Math.max(1, Math.min(bounds.minutes, draft.minutes)) })}
              className="w-20!"
            />
          )}
        </div>
      </div>
      <Field label="Note" textarea value={draft.note} onChange={(note) => set({ note })} autoFocus={focusNote} />
      <Checkbox checked={draft.done} onChange={(done) => set({ done })}>
        Done
      </Checkbox>
      {problem && (
        <p role="alert" className="text-[0.88rem] text-[var(--danger-text)]">
          {problem}
        </p>
      )}
      <div className="flex justify-end gap-2">
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
