import { Field, FIELD_LABEL_CLASSES } from '../primitives/Field';

// One text part of an entry, as the mock draws it: the read view is the label over the text (a dash when empty), Edit turns it into the
// field. The parent's draft holds the value, so a Cancel puts it back.
export function EntryText({ label, value, editing, onChange }: { label: string; value: string; editing: boolean; onChange: (value: string) => void }) {
  if (editing) return <Field label={label} textarea value={value} onChange={onChange} />;
  return (
    <div>
      <div className={`mb-1.5 ${FIELD_LABEL_CLASSES}`}>{label}</div>
      <div className={`text-[0.88rem] break-words whitespace-pre-wrap ${value ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{value || '—'}</div>
    </div>
  );
}
