import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu';
import { useId } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { faCheck, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { KeyChord } from './KeyCap';
import { POPUP_MOTION_CLASSES } from './overlayMotion';

export type ContextMenuItem = {
  key: string;
  label: string;
  // Why the item is off, shown under the label and read as its description. An item with a reason is disabled.
  unavailable?: string;
  // The heading of the group this item belongs to ("Mark as"). Neighbouring items with the same group share one labelled group; the label
  // gives them their context, so each item's own label is only its name. Items with no group stay in one unlabelled run.
  group?: string;
  /** The keys that run it from anywhere, drawn at the row's end ("Ctrl", "K"). */
  shortcut?: string[];
  /** Draws a check before the label (the page you are on) and reads as a checked menu item. Absent draws no check and no state. */
  checked?: boolean;
  /** Makes the row a submenu that opens beside it; its own `onSelect` is not used. */
  items?: ContextMenuItem[];
  onSelect: () => void;
};

type Run = { group: string | undefined; items: ContextMenuItem[] };

/** The items as runs of neighbours that share a group, in order. */
function runsOf(items: ContextMenuItem[]): Run[] {
  const runs: Run[] = [];
  for (const item of items) {
    const last = runs.at(-1);
    if (last && last.group === item.group) last.items.push(item);
    else runs.push({ group: item.group, items: [item] });
  }
  return runs;
}

const ITEM_CLASS =
  'flex w-full cursor-pointer flex-col gap-0.5 rounded-[0.3rem] px-[0.55rem] py-[0.45rem] text-left text-[0.82rem] outline-none data-[disabled]:cursor-default data-[disabled]:text-[var(--text-muted)] data-[highlighted]:bg-[var(--surface-2)]';
const POPUP_CLASS = `max-h-[var(--available-height)] w-64 overflow-y-auto rounded-[0.4rem] border border-[var(--line-strong)] bg-[var(--surface)] p-[0.35rem] shadow-[var(--shadow-lg)] outline-none ${POPUP_MOTION_CLASSES}`;

/** A row's line: the check slot (drawn for any row that has a `checked` state, empty when unchecked), the label, then the keys or the submenu arrow. */
function RowLine({ item, submenu = false }: { item: ContextMenuItem; submenu?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      {item.checked !== undefined && (
        <span className="w-3 flex-none text-[0.7rem]" aria-hidden="true">
          {item.checked && <FontAwesomeIcon icon={faCheck} />}
        </span>
      )}
      <span className="min-w-0 flex-1">{item.label}</span>
      {item.shortcut && <KeyChord keys={item.shortcut} />}
      {submenu && <FontAwesomeIcon icon={faChevronRight} className="flex-none text-[0.7rem] text-[var(--text-muted)]" aria-hidden="true" />}
    </span>
  );
}

function renderItem(item: ContextMenuItem, reasonId: string) {
  const reason =
    item.unavailable !== undefined ? (
      <span id={`${reasonId}-${item.key}`} className="text-[0.72rem] text-[var(--text-muted)]">
        {item.unavailable}
      </span>
    ) : null;
  if (item.items) {
    return (
      <BaseContextMenu.SubmenuRoot key={item.key}>
        <BaseContextMenu.SubmenuTrigger className={ITEM_CLASS}>
          <RowLine item={item} submenu />
        </BaseContextMenu.SubmenuTrigger>
        <BaseContextMenu.Portal container={document.querySelector('main') ?? undefined}>
          <BaseContextMenu.Positioner collisionPadding={8} className="z-[var(--z-popover)]">
            <BaseContextMenu.Popup tabIndex={0} className={POPUP_CLASS}>
              {item.items.map((child) => renderItem(child, reasonId))}
            </BaseContextMenu.Popup>
          </BaseContextMenu.Positioner>
        </BaseContextMenu.Portal>
      </BaseContextMenu.SubmenuRoot>
    );
  }
  const shared = {
    disabled: item.unavailable !== undefined,
    'aria-describedby': item.unavailable === undefined ? undefined : `${reasonId}-${item.key}`,
    className: ITEM_CLASS,
  };
  return item.checked === undefined ? (
    <BaseContextMenu.Item key={item.key} {...shared} onClick={item.onSelect}>
      <RowLine item={item} />
      {reason}
    </BaseContextMenu.Item>
  ) : (
    <BaseContextMenu.CheckboxItem key={item.key} {...shared} checked={item.checked} closeOnClick onClick={item.onSelect}>
      <RowLine item={item} />
      {reason}
    </BaseContextMenu.CheckboxItem>
  );
}

// An area that opens a menu of actions at the pointer on a right click, a long press, or the keyboard's Menu key or
// Shift+F10. It is `Menu`'s sibling: the same popup, the same items,
// the same roles and keys, but opened by the area instead of a button. `onOpen` runs on the contextmenu event, before the
// menu opens, so the caller can choose what the menu acts on (the word under the pointer) and the items reflect it. A menu
// with no items leaves the browser's own menu alone. An item that cannot run says why instead of vanishing, and is not
// selectable. The popup is portalled into the page's <main> (else to <body>), so screen readers and axe place it inside a
// landmark like the page it belongs to. The area keeps its own layout (`className`); the popup sits between the slide-over and the dialogs.
export function ContextMenu({
  items,
  onOpen,
  className,
  children,
}: {
  items: ContextMenuItem[];
  onOpen?: (event: MouseEvent) => void;
  className?: string;
  children: ReactNode;
}) {
  const reasonId = useId();
  return (
    <BaseContextMenu.Root>
      <BaseContextMenu.Trigger className={className} onContextMenu={items.length > 0 || onOpen ? onOpen : undefined}>
        {children}
      </BaseContextMenu.Trigger>
      <BaseContextMenu.Portal container={document.querySelector('main') ?? undefined}>
        <BaseContextMenu.Positioner collisionPadding={8} className="z-[var(--z-popover)]">
          <BaseContextMenu.Popup tabIndex={0} className={POPUP_CLASS}>
            {runsOf(items).map((run, at) => {
              const rows = run.items.map((item) => renderItem(item, reasonId));
              return run.group === undefined ? (
                <div key={`run-${at}`} className={at > 0 ? 'mt-1 border-t border-[var(--line-strong)] pt-1' : undefined}>
                  {rows}
                </div>
              ) : (
                <BaseContextMenu.Group key={`run-${at}`} className={at > 0 ? 'mt-1 border-t border-[var(--line-strong)] pt-1' : undefined}>
                  <BaseContextMenu.GroupLabel className="px-[0.55rem] pt-1 pb-0.5 font-['Barlow_Condensed',sans-serif] text-[0.7rem] font-semibold tracking-[0.14em] text-[var(--text-muted)] uppercase">
                    {run.group}
                  </BaseContextMenu.GroupLabel>
                  {rows}
                </BaseContextMenu.Group>
              );
            })}
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  );
}
