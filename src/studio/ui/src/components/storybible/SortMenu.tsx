import { IconButton } from '../primitives/IconButton';
import { Menu } from '../primitives/Menu';
import { Icon } from '../primitives/Icon';
import type { ColumnKey, EntrySort } from './entryTable';

const ORDERS: readonly { key: ColumnKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'kind', label: 'Kind' },
  { key: 'book', label: 'Book order' },
  { key: 'mentions', label: 'Most mentioned' },
];

/**
 * The Story Bible's Sort menu (SNB-D3): Name and Kind (which the headers also sort), Book order (by the chapter each entry first appears in)
 * and Most mentioned. Its button names the order in force; the list draws no count, so the order is how the main cast comes up.
 */
export function SortMenu({ sort, onPick }: { sort: EntrySort; onPick: (column: ColumnKey) => void }) {
  const current = ORDERS.find((order) => order.key === sort[0]?.column) ?? ORDERS[0]!;
  return (
    <Menu
      render={<IconButton action="sortList" label={`Sort: ${current.label}`} />}
      sections={[
        {
          key: 'order',
          label: 'Sort by',
          select: 'one',
          closeOnSelect: true,
          items: ORDERS.map((order) => ({ key: order.key, label: order.label, checked: order.key === current.key, onSelect: () => onPick(order.key) })),
        },
      ]}
    >
      <Icon name="sortList" />
    </Menu>
  );
}
