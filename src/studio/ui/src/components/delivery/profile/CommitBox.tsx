import { useState } from 'react';
import { TextField } from '../../primitives/TextField';

/**
 * A text box that keeps what is typed and reports it on Enter or when focus leaves, only if it changed (the mock's CommitInput).
 * `accept` turns the text into a value to commit or declines it; a declined entry reverts the box to the last value.
 */
export function CommitBox({
  label,
  value,
  onCommit,
  mono = false,
  inputMode,
  className = '',
}: {
  label: string;
  value: string;
  onCommit: (text: string) => void;
  mono?: boolean;
  /** The keyboard a number box asks for: `decimal` for a limit, which stays a text box so "-" and a half-typed number are not refused. */
  inputMode?: 'decimal';
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const settle = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <TextField
      label={label}
      value={draft ?? value}
      onChange={setDraft}
      onBlur={settle}
      onKeyDown={(event) => {
        if (event.key === 'Enter') settle();
        if (event.key === 'Escape') setDraft(null);
      }}
      mono={mono}
      inputMode={inputMode}
      className={className}
    />
  );
}
