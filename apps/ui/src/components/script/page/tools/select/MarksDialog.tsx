import { useEffect, useRef, useState } from 'react';
import { MARK_COLOURS, MARK_STYLES, MARK_TYPE_NAME_MAX, type MarkColour, type MarkStyle, type MarkType } from '../../../../../api/contracts/marks';
import { overlay } from '../../../../../overlay/overlayService';
import { Button } from '../../../../primitives/Button';
import { Checkbox } from '../../../../primitives/Checkbox';
import { Dialog } from '../../../../primitives/Dialog';
import { IconButton } from '../../../../primitives/IconButton';
import { Select } from '../../../../primitives/Select';
import { TextField } from '../../../../primitives/TextField';
import { useMarks } from '../../data/useScriptData';
import { markSwatch } from '../../rail/threads/markSwatch';

const COLOUR_LABELS: Record<MarkColour, string> = { copper: 'Copper', info: 'Blue', ok: 'Green', warn: 'Amber', bad: 'Red', violet: 'Violet' };
const STYLE_LABELS: Record<MarkStyle, string> = {
  highlight: 'Highlight',
  underline: 'Underline',
  double: 'Double line',
  dotted: 'Dotted',
  wavy: 'Wavy',
  box: 'Box',
};
export const KEEP_ONE = 'Keep at least one mark.';

export type SaveMarkTypes = (types: MarkType[], removeUses: boolean) => Promise<MarkType[] | null>;

/**
 * "Define how you mark up" (the mock's `MarksDialog`): each type's name, colour, line and Asks, a remove button, and Add a mark.
 * Every change is saved at once through `saveMarkTypes`, which answers the types as the host now has them (a new type has its
 * key) or null when the host refused. Removing a type that marks use asks once, "Remove N uses too?", then removes its marks too.
 * At least one type is kept.
 */
export function MarksDialog({ saveMarkTypes, onClose }: { saveMarkTypes: SaveMarkTypes; onClose: () => void }) {
  const { types: stored, marks } = useMarks();
  const [types, setTypes] = useState<MarkType[]>(stored);
  const [sure, setSure] = useState<string | null>(null);
  const saved = useRef(stored);
  useEffect(() => {
    saved.current = stored;
    setTypes(stored);
  }, [stored]);
  const used = (key: string): number => marks.filter((mark) => mark.type === key).length;

  const commit = async (next: MarkType[], removeUses = false): Promise<void> => {
    setTypes(next);
    const answer = await saveMarkTypes(next, removeUses);
    if (answer) saved.current = answer;
    setTypes(saved.current);
  };
  const edit = (index: number, change: Partial<MarkType>): Promise<void> => commit(types.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const rename = (index: number, name: string): void => setTypes((current) => current.map((row, i) => (i === index ? { ...row, name } : row)));
  const remove = (type: MarkType): void => {
    if (types.length < 2) {
      overlay.toast(KEEP_ONE);
      return;
    }
    if (used(type.key) && sure !== type.key) {
      setSure(type.key);
      return;
    }
    setSure(null);
    void commit(
      types.filter((row) => row.key !== type.key),
      used(type.key) > 0,
    );
  };

  return (
    <Dialog dismissOnOutsidePress={true} title="Define how you mark up" onClose={onClose} actionsAlign="end" actions={<Button onClick={onClose}>Done</Button>}>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {types.map((type, index) => (
          <li key={type.key || `new-${index}`} className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              data-testid="mark-swatch"
              className="inline-block size-[18px] shrink-0 rounded-[3px]"
              style={{ background: `var(--${markSwatch(type.colour)})` }}
            />
            <div className="min-w-[10rem] flex-1">
              <TextField
                label="Mark name"
                value={type.name}
                maxLength={MARK_TYPE_NAME_MAX}
                onChange={(name) => rename(index, name)}
                onBlur={() => {
                  if (type.name !== stored.find((row) => row.key === type.key)?.name) void commit(types);
                }}
              />
            </div>
            <Select
              label="Colour"
              value={type.colour}
              onChange={(colour) => void edit(index, { colour: colour as MarkColour })}
              options={MARK_COLOURS.map((value) => ({ value, label: COLOUR_LABELS[value] }))}
            />
            <Select
              label="Line"
              value={type.style}
              onChange={(style) => void edit(index, { style: style as MarkStyle })}
              options={MARK_STYLES.map((value) => ({ value, label: STYLE_LABELS[value] }))}
            />
            <Checkbox checked={type.asks} onChange={(asks) => void edit(index, { asks })}>
              Asks
            </Checkbox>
            {sure === type.key ? (
              <Button variant="danger" size="sm" onClick={() => remove(type)}>
                {`Remove ${used(type.key)} uses too?`}
              </Button>
            ) : (
              <IconButton action="delete" label="Remove" variant="danger" onClick={() => remove(type)} />
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <IconButton action="addMark" onClick={() => void commit([...types, { key: '', name: 'New mark', colour: 'bad', style: 'box', asks: false }])} />
      </div>
    </Dialog>
  );
}
