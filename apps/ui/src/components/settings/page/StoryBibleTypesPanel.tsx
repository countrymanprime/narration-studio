import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { GUIDE_TYPE_COLOURS, type GuideType, type GuideTypeColour } from '../../../types';
import { kindSwatch } from '../../storybible/entryList';
import { Checkbox } from '../../primitives/Checkbox';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { Select } from '../../primitives/Select';
import { Swatch } from '../../primitives/Swatch';
import { TextField } from '../../primitives/TextField';
import { TooltipTarget } from '../../primitives/Tooltip';

const COLOUR_LABELS: Record<GuideTypeColour, string> = { green: 'Green', blue: 'Blue', violet: 'Violet', amber: 'Amber', teal: 'Teal', rose: 'Rose' };
const COLOUR_OPTIONS = GUIDE_TYPE_COLOURS.map((colour) => ({ value: colour, label: COLOUR_LABELS[colour] }));
const NEW_NAME = 'Give the type a new name.';

export type StoryBibleTypesViewProps = {
  /** The host's types, in order; absent while they are read. */
  types?: readonly GuideType[];
  /** How many entries each type has; absent while the entries are read, and Remove waits for it. */
  counts?: Readonly<Record<string, number>>;
  busy?: boolean;
  /** A failed read or a refused change, in the host's words. */
  error?: string;
  /** Resolves true when the host renamed the type, false when it refused (the field then goes back). */
  onRename: (name: string, to: string) => Promise<boolean>;
  onColour: (name: string, colour: GuideTypeColour) => void;
  onSpeaks: (name: string, speaks: boolean) => void;
  onRemove: (name: string) => void;
  /** Resolves true when the host added the type, so the field is cleared. */
  onAdd: (name: string) => Promise<boolean>;
  /** An empty name, refused before it reaches the host. */
  onRefuse: (message: string) => void;
};

function TypeRow({
  type,
  count,
  last,
  busy,
  onRename,
  onColour,
  onSpeaks,
  onRemove,
  onRefuse,
}: { type: GuideType; count?: number; last: boolean; busy: boolean } & Pick<
  StoryBibleTypesViewProps,
  'onRename' | 'onColour' | 'onSpeaks' | 'onRemove' | 'onRefuse'
>) {
  const [value, setValue] = useState(type.name);
  useEffect(() => setValue(type.name), [type.name]);
  const commit = () => {
    const to = value.trim();
    if (to === type.name) return setValue(type.name);
    if (!to) {
      setValue(type.name);
      return onRefuse(NEW_NAME);
    }
    void onRename(type.name, to).then((renamed) => {
      if (!renamed) setValue(type.name);
    });
  };
  const blocked = count === undefined ? 'Reading the entries…' : count > 0 ? `${type.name} is in use` : last ? 'The last type stays' : undefined;
  return (
    // Below md the name takes the first line and the rest share the second.
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 md:flex-nowrap">
      <span className="flex min-w-0 basis-full items-center gap-3 md:flex-1 md:basis-auto">
        <Swatch colour={kindSwatch([type], type.name)} />
        <TextField
          label={`Type name: ${type.name}`}
          value={value}
          className="min-w-[8rem] flex-1"
          disabled={busy}
          onChange={setValue}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
      </span>
      <Select
        label={`Colour for ${type.name}`}
        className="w-[110px] md:w-[130px]"
        value={type.colour}
        disabled={busy}
        options={COLOUR_OPTIONS}
        onChange={(colour) => onColour(type.name, colour as GuideTypeColour)}
      />
      <TooltipTarget text="Entries of this type can be picked as the speaker of a quoted line">
        <Checkbox checked={type.speaks} disabled={busy} onChange={(speaks) => onSpeaks(type.name, speaks)}>
          <span className="whitespace-nowrap text-[var(--text-muted)]">
            Can speak<span className="sr-only">: {type.name}</span>
          </span>
        </Checkbox>
      </TooltipTarget>
      <span data-type-count={type.name} className="ml-auto text-sm text-[var(--text-muted)] md:ml-0 md:min-w-[70px]">
        {count === undefined ? '' : `${count} ${count === 1 ? 'entry' : 'entries'}`}
      </span>
      <IconButton
        action="remove"
        label={`Remove ${type.name}`}
        variant="danger"
        size="sm"
        disabledReason={blocked}
        pending={busy && !blocked}
        onClick={() => onRemove(type.name)}
      />
    </li>
  );
}

/** The mock's "Story Bible types" panel: a row per type (name, colour, Can speak, its entry count, Remove) and a New type field. Takes props only. */
export function StoryBibleTypesView({ types, counts, busy = false, error, onRename, onColour, onSpeaks, onRemove, onAdd, onRefuse }: StoryBibleTypesViewProps) {
  const [name, setName] = useState('');
  const add = () => {
    if (!name.trim()) return onRefuse(NEW_NAME);
    void onAdd(name).then((added) => {
      if (added) setName('');
    });
  };
  return (
    <Panel title="Story Bible types">
      <div className="flex flex-col gap-3">
        {types ? (
          <ul className="flex flex-col gap-3">
            {types.map((type) => (
              <TypeRow
                key={type.name}
                type={type}
                count={counts && (counts[type.name] ?? 0)}
                last={types.length < 2}
                busy={busy}
                onRename={onRename}
                onColour={onColour}
                onSpeaks={onSpeaks}
                onRemove={onRemove}
                onRefuse={onRefuse}
              />
            ))}
          </ul>
        ) : (
          !error && <p className="text-sm text-[var(--text-muted)]">Reading the Story Bible types…</p>
        )}
        {types && (
          <div className="flex items-center gap-3">
            <TextField
              label="New type"
              placeholder="New type"
              value={name}
              className="max-w-[200px]"
              disabled={busy}
              onChange={setName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') add();
              }}
            />
            <IconButton action="add" label="Add type" size="sm" pending={busy} onClick={add} />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-[var(--danger-text)]">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}

function countByType(entries: readonly { category: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) counts[entry.category] = (counts[entry.category] ?? 0) + 1;
  return counts;
}

/**
 * Settings > Story Bible types (SN-M53): the host's list of types (`guideTypes`, SN-B95), changed with its calls and read again after
 * each, so the Story Bible list, its chips and the Script's speaker choices follow. The host refuses a taken or reserved name, a type in
 * use and the last type; its sentence shows under the list.
 */
export function StoryBibleTypesPanel() {
  const port = usePort('storyBible');
  const [types, setTypes] = useState<GuideType[]>();
  const [counts, setCounts] = useState<Record<string, number>>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // `live` is false once the panel is gone, so a late answer is dropped.
  const read = useCallback(
    async (live: () => boolean = () => true) => {
      const [nextTypes, entries] = await Promise.all([port.guideTypes(), port.guideEntities()]);
      if (!live()) return;
      setTypes(nextTypes);
      setCounts(countByType(entries));
    },
    [port],
  );

  useEffect(() => {
    let live = true;
    read(() => live).catch((failure: unknown) => live && setError(`The Story Bible types could not be read: ${apiErrorMessage(failure)}`));
    return () => {
      live = false;
    };
  }, [read]);

  const change = async (call: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    try {
      await call();
      await read();
      setError(undefined);
      return true;
    } catch (failure) {
      setError(apiErrorMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <StoryBibleTypesView
      types={types}
      counts={counts}
      busy={busy}
      error={error}
      onRename={(name, to) => change(() => port.guideTypeRename(name, to))}
      onColour={(name, colour) => void change(() => port.guideTypeSetColour(name, colour))}
      onSpeaks={(name, speaks) => void change(() => port.guideTypeSetSpeaks(name, speaks))}
      onRemove={(name) => void change(() => port.guideTypeRemove(name))}
      onAdd={(name) => change(() => port.guideTypeAdd(name))}
      onRefuse={setError}
    />
  );
}
