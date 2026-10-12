import { useState } from 'react';
import { useMarks, useScriptCommands, useScriptView } from '../../data/useScriptData';
import { Button } from '../../../../primitives/Button';
import { Dialog } from '../../../../primitives/Dialog';
import { Field } from '../../../../primitives/Field';
import { Select } from '../../../../primitives/Select';
import type { ReaderSelection } from '../../registry/contextProvider';

const TITLE_SHOWN = 60;
export const QUERY_NEEDED = 'Write the query first.';

/** The selected words as the dialog's title, shortened with an ellipsis past 60 characters. */
export const composerTitle = (quote: string): string => (quote.length > TITLE_SHOWN ? `${quote.slice(0, TITLE_SHOWN)}…` : quote);

/**
 * One composer for every kind of mark (the mock's `Composer`): pick a type, add a note if you want one. A type that asks needs
 * its question, and its mark starts open. The page mounts it while a mark is being made and unmounts it on `onClose`; focus
 * goes back to what opened it.
 */
export function MarkComposer({ type, selection, onClose }: { type: string; selection: ReaderSelection; onClose: () => void }) {
  const { types } = useMarks();
  const commands = useScriptCommands();
  const [, updateView] = useScriptView(() => null);
  const [chosen, setChosen] = useState(type);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const kind = types.find((row) => row.key === chosen) ?? types[0];
  const asks = kind?.asks ?? false;

  const save = async () => {
    if (asks && !text.trim()) {
      setProblem(QUERY_NEEDED);
      return;
    }
    setSaving(true);
    const mark = await commands.addMark(selection, chosen, text);
    setSaving(false);
    if (!mark) return;
    updateView({ tab: asks ? 'queries' : 'marks', sel: mark.id });
    onClose();
  };

  return (
    <Dialog
      title={composerTitle(selection.quote)}
      onClose={onClose}
      actionsAlign="end"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button pending={saving} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[0.88rem] font-medium text-[var(--text-muted)]" htmlFor="mark-type">
            Type
          </label>
          <div className="mt-2">
            <Select
              id="mark-type"
              fullWidth
              value={kind?.key ?? chosen}
              onChange={(next) => {
                setChosen(next);
                setProblem('');
              }}
              options={types.map((row) => ({ value: row.key, label: row.name + (row.asks ? ' (tracks a reply)' : '') }))}
            />
          </div>
        </div>
        <Field
          key={asks ? 'query' : 'note'}
          label={asks ? 'Your query' : 'Note (optional)'}
          textarea
          autoFocus
          value={text}
          onChange={(next) => {
            setText(next);
            setProblem('');
          }}
          placeholder={asks ? 'What do you need to ask the author?' : 'Anything you want to remember here'}
          error={problem}
        />
      </div>
    </Dialog>
  );
}
