import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { useRef, type ComponentPropsWithRef, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { TextField } from './TextField';
import { TooltipTarget } from './Tooltip';

// A text field for filtering a list or the manuscript, with a clear button inside it once there is something to clear. The
// clear button returns focus to the field, so typing can continue. Named by `label` (aria-label); controlled.
export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  clearLabel = 'Clear search',
  autoFocus = false,
  onKeyDown,
  combobox,
  leadingIcon = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearLabel?: string;
  autoFocus?: boolean;
  // Enter, in the manuscript search, fires the debounced query immediately (R1) instead of waiting.
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  // The field is the text box of a combobox whose list it drives (the Booth's speaker picker): its role and the attributes that name the list and the active row.
  combobox?: Pick<ComponentPropsWithRef<'input'>, 'role' | 'aria-controls' | 'aria-activedescendant' | 'aria-expanded'>;
  /** Draws a magnifier inside the box at its left, for a field that has no other sign it searches (alignment audit XSE1-19, R4SE2-2). */
  leadingIcon?: boolean;
}) {
  const fieldRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative w-full">
      <TextField
        ref={fieldRef}
        label={label}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        {...combobox}
        style={{ ...(value ? { paddingRight: '2.25rem' } : {}), ...(leadingIcon ? { paddingLeft: '2.25rem' } : {}) }}
      />
      {leadingIcon && (
        <span data-search-icon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]">
          <Icon name="find" />
        </span>
      )}
      {value && (
        // A quiet 28 px button inside the box, not a bordered 36 px square drawn 4 px inside the field's own border (alignment audit R4SE2-2, XPF-21).
        <TooltipTarget text={clearLabel} style={{ position: 'absolute', right: '.25rem', top: '50%', transform: 'translateY(-50%)' }}>
          <IconButton
            variant="ghost"
            size="xs"
            label={clearLabel}
            onClick={() => {
              onChange('');
              fieldRef.current?.focus();
            }}
          >
            <FontAwesomeIcon icon={faXmark} />
          </IconButton>
        </TooltipTarget>
      )}
    </div>
  );
}
