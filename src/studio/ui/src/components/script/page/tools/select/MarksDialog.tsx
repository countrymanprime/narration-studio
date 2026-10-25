import { useEffect, useRef, useState } from 'react';
import { MARK_COLOURS, MARK_STYLES, MARK_TYPE_NAME_MAX, type MarkColour, type MarkStyle, type MarkType } from '../../../../../api/contracts/marks';
import { overlay } from '../../../../../overlay/overlayService';
import { Button } from '../../../../primitives/Button';
import { Checkbox } from '../../../../primitives/Checkbox';
import { Dialog } from '../../../../primitives/Dialog';
import { Icon } from '../../../../primitives/Icon';
import { IconButton } from '../../../../primitives/IconButton';
import { SectionLabel } from '../../../../primitives/SectionLabel';
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
// One grid for the column heads and every mark (the rows are subgrids of it, so the heads sit over their columns whatever the
// Asks and remove cells hold): swatch, name, colour, line, Asks, remove. Below 640 px a mark takes two lines, swatch, name and
// remove on the first, colour, line and Asks under the name, so remove never drops onto a line of its own.
const GRID = 'grid gap-x-2 grid-cols-[18px_minmax(8rem,1fr)_7.5rem_8.5rem_auto_auto] max-[639px]:grid-cols-[18px_minmax(0,1fr)_minmax(0,1fr)_auto_auto]';
const ROW_GRID = 'col-span-full grid grid-cols-subgrid items-center gap-y-2';
const NARROW = {
  name: 'max-[639px]:col-span-3',
  colour: 'max-[639px]:col-start-2 max-[639px]:row-start-2',
  line: 'max-[639px]:col-start-3 max-[639px]:row-start-2',
  asks: 'max-[639px]:col-span-2 max-[639px]:col-start-4 max-[639px]:row-start-2',
  remove: 'max-[639px]:col-start-5 max-[639px]:row-start-1',
};
const ASKS_HINT = 'Tracks a reply, like a question for the author';
export const KEEP_ONE = 'Keep at least one mark.';

export type SaveMarkTypes = (types: MarkType[], removeUses: boolean) => Promise<MarkType[] | null>;

/**
 * "Define how you mark up" (the mock's `MarksDialog`): each type's name, colour, line and Asks under named columns, a remove button,
 * and Add a mark.
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
      <div className={GRID}>
        <div aria-hidden="true" className={`${ROW_GRID} mb-1.5 max-[639px]:hidden`}>
          <SectionLabel className="col-start-2">Name</SectionLabel>
          <SectionLabel>Colour</SectionLabel>
          <SectionLabel>Line</SectionLabel>
          <SectionLabel>Asks</SectionLabel>
        </div>
        <ul className={`${ROW_GRID} m-0 list-none gap-y-2 p-0`}>
          {types.map((type, index) => (
            <li key={type.key || `new-${index}`} className={ROW_GRID}>
              <span
                aria-hidden="true"
                data-testid="mark-swatch"
                className="inline-block size-[18px] shrink-0 rounded-[3px]"
                style={{ background: `var(--${markSwatch(type.colour)})` }}
              />
              <div className={`min-w-0 ${NARROW.name}`}>
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
                fullWidth
                className={NARROW.colour}
                value={type.colour}
                onChange={(colour) => void edit(index, { colour: colour as MarkColour })}
                options={MARK_COLOURS.map((value) => ({ value, label: COLOUR_LABELS[value] }))}
              />
              <Select
                label="Line"
                fullWidth
                className={NARROW.line}
                value={type.style}
                onChange={(style) => void edit(index, { style: style as MarkStyle })}
                options={MARK_STYLES.map((value) => ({ value, label: STYLE_LABELS[value] }))}
              />
              <div className={NARROW.asks} title={ASKS_HINT}>
                <Checkbox checked={type.asks} onChange={(asks) => void edit(index, { asks })}>
                  Asks
                </Checkbox>
              </div>
              <div className={`justify-self-end ${NARROW.remove}`}>
                {sure === type.key ? (
                  <Button variant="danger" size="sm" onClick={() => remove(type)}>
                    {`Remove ${used(type.key)} uses too?`}
                  </Button>
                ) : (
                  <IconButton action="delete" label="Remove" variant="danger" onClick={() => remove(type)} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3">
        <Button variant="secondary" onClick={() => void commit([...types, { key: '', name: 'New mark', colour: 'bad', style: 'box', asks: false }])}>
          <Icon name="addMark" />
          Add a mark
        </Button>
      </div>
    </Dialog>
  );
}
