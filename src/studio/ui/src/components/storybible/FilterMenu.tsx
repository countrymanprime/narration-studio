import type { GuideType } from '../../types';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { IconButton } from '../primitives/IconButton';
import { Menu, type MenuSection } from '../primitives/Menu';
import { Badge, toneColors } from '../primitives/StatusBadge';
import { Swatch } from '../primitives/Swatch';
import { kindSwatch } from './entryList';
import { filterCount, type EntryFilter } from './entryTable';

/** The choices the Filter menu sets; the search text is the box's. */
export type FilterChoice = Pick<EntryFilter, 'kinds' | 'pron' | 'show'>;
export const NO_FILTER: FilterChoice = { kinds: [], pron: 'any', show: 'all' };

/** What the menu counts beside each choice: entries per kind, with and without a pronunciation, to review and to verify. */
export type FilterCounts = { kinds: ReadonlyMap<string, number>; all: number; withPron: number; toReview: number; toVerify: number };

const SHOW_LABEL = { review: 'Needs review', verify: 'Needs verification' } as const;
const PRON_LABEL = { none: 'No pronunciation', set: 'Has a pronunciation' } as const;

/**
 * The Story Bible's Filter menu (SNB-D3): one icon button, its badge the number of filters on, over a menu of Kind (several at once),
 * Pronunciation and Show. Show offers Needs review and Needs verification only while some exist, or while one is chosen.
 */
export function FilterMenu({
  types,
  counts,
  value,
  onChange,
}: {
  types: readonly GuideType[];
  counts: FilterCounts;
  value: FilterChoice;
  onChange: (next: FilterChoice) => void;
}) {
  const on = filterCount({ ...value, query: '', suggestions: [] });
  const toggleKind = (name: string) =>
    onChange({ ...value, kinds: value.kinds.includes(name) ? value.kinds.filter((kind) => kind !== name) : [...value.kinds, name] });
  const sections: MenuSection[] = [
    ...(types.length > 0
      ? [
          {
            key: 'kind',
            label: 'Kind',
            select: 'many' as const,
            items: types.map((type) => ({
              key: type.name,
              label: type.name,
              leading: <Swatch colour={kindSwatch(types, type.name)} />,
              checked: value.kinds.includes(type.name),
              trailing: counts.kinds.get(type.name) ?? 0,
              onSelect: () => toggleKind(type.name),
            })),
          },
        ]
      : []),
    {
      key: 'pron',
      label: 'Pronunciation',
      select: 'one',
      items: [
        { key: 'any', label: 'Any', checked: value.pron === 'any', trailing: counts.all, onSelect: () => onChange({ ...value, pron: 'any' }) },
        {
          key: 'none',
          label: 'None yet',
          checked: value.pron === 'none',
          trailing: counts.all - counts.withPron,
          onSelect: () => onChange({ ...value, pron: 'none' }),
        },
        { key: 'set', label: 'Has one', checked: value.pron === 'set', trailing: counts.withPron, onSelect: () => onChange({ ...value, pron: 'set' }) },
      ],
    },
    {
      key: 'show',
      label: 'Show',
      select: 'one',
      items: [
        { key: 'all', label: 'All entries', checked: value.show === 'all', trailing: counts.all, onSelect: () => onChange({ ...value, show: 'all' }) },
        ...(counts.toReview > 0 || value.show === 'review'
          ? [
              {
                key: 'review',
                label: SHOW_LABEL.review,
                checked: value.show === 'review',
                trailing: counts.toReview,
                onSelect: () => onChange({ ...value, show: 'review' as const }),
              },
            ]
          : []),
        ...(counts.toVerify > 0 || value.show === 'verify'
          ? [
              {
                key: 'verify',
                label: SHOW_LABEL.verify,
                checked: value.show === 'verify',
                trailing: counts.toVerify,
                onSelect: () => onChange({ ...value, show: 'verify' as const }),
              },
            ]
          : []),
      ],
    },
  ];
  return (
    <Menu render={<IconButton action="filterList" label={on > 0 ? `Filter, ${on} on` : 'Filter'} className="relative" />} sections={sections}>
      <Icon name="filterList" />
      {/* The count is said by the button's name ("Filter, 2 on"); the badge is what a sighted narrator sees. */}
      {on > 0 && (
        <span aria-hidden className="absolute -top-2 -right-2">
          <Badge label={on} colors={toneColors('accent')} />
        </span>
      )}
    </Menu>
  );
}

/** The filters on, each a chip that removes it, then Clear all. Drawn only while a filter is on. */
export function FilterChips({ value, onChange }: { value: FilterChoice; onChange: (next: FilterChoice) => void }) {
  const chips = [
    ...value.kinds.map((kind) => ({ key: `kind:${kind}`, label: kind, remove: () => onChange({ ...value, kinds: value.kinds.filter((k) => k !== kind) }) })),
    ...(value.pron === 'any' ? [] : [{ key: 'pron', label: PRON_LABEL[value.pron], remove: () => onChange({ ...value, pron: 'any' }) }]),
    ...(value.show === 'all' ? [] : [{ key: 'show', label: SHOW_LABEL[value.show], remove: () => onChange({ ...value, show: 'all' }) }]),
  ];
  if (chips.length === 0) return null;
  return (
    <div role="group" aria-label="Filters on" className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          colors={toneColors('neutral')}
          onClick={chip.remove}
          label={
            <>
              <span className="sr-only">Remove filter</span> {chip.label}
              <span aria-hidden className="ml-1 text-[0.7em]">
                <Icon name="close" />
              </span>
            </>
          }
        />
      ))}
      <Button variant="link" onClick={() => onChange(NO_FILTER)}>
        Clear all
      </Button>
    </div>
  );
}
