import { FIELD_LABEL_CLASSES } from '../primitives/Field';
import { Select } from '../primitives/Select';
import { PLATFORM_PROFILES } from '../schedule/profiles';

const OPTIONS = PLATFORM_PROFILES.map((profile) => ({ value: profile.id, label: profile.label }));

/**
 * The delivery profile asked for in the import review of a project that has none chosen yet (SNM-Q1). The choices are the platform
 * table's, so a platform added there appears here; it is changed later in Settings and on Master & QC, so nothing here locks it.
 */
export function ImportProfileField({ value, onChange }: { value: string; onChange: (profile: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className={FIELD_LABEL_CLASSES}>Delivery profile</span>
      <Select label="Delivery profile" value={value} options={OPTIONS} onChange={onChange} />
    </label>
  );
}
