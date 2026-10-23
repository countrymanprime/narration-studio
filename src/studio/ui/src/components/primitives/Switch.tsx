import { Switch as BaseSwitch } from '@base-ui/react/switch';
import type { ReactNode } from 'react';

// An on/off setting: a track with a thumb, then its label, and pressing the label toggles it. It is a `role="switch"`
// (Base UI), which announces "on" and "off", the right semantics for a setting that takes effect at once, where a checkbox
// says "checked". The Settings `bool` kind is a row of it (ScopedSetting). Controlled.
export function Switch({
  checked,
  onChange,
  disabled,
  className = '',
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Added to the label, for a switch that fills a row. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${disabled ? '' : 'cursor-pointer'} ${className}`.trim()}>
      <BaseSwitch.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="inline-flex h-5 w-9 flex-none items-center rounded-full border border-[var(--border)] bg-[var(--surface-3)] p-0.5 data-[checked]:border-[var(--accent)] data-[checked]:bg-[var(--accent)] data-[disabled]:opacity-40 motion-ok:transition-colors"
      >
        <BaseSwitch.Thumb className="size-3.5 rounded-full bg-[var(--surface)] shadow-[var(--shadow)] data-[checked]:translate-x-4 motion-ok:transition-transform" />
      </BaseSwitch.Root>
      {/* min-w-0: a long label shrinks and clips inside its column instead of running behind the next one. */}
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}
