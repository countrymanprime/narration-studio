import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu';
import { useId, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
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
  // Makes the item a submenu: its row opens these items beside it (Right arrow or hover) and `onSelect` is not used. A submenu with a
  // `unavailable` reason is off like any item; its items are plain rows or groups, and may nest.
  submenu?: ContextMenuItem[];
  /** The keys that run it from anywhere, drawn at the row's end ("Ctrl", "K"). */
  shortcut?: string[];
  /** Draws a check before the label (the page you are on) and reads as a checked menu item that closes the menu when chosen. Absent: no check, no state. */
  checked?: boolean;
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

const POPUP_CLASSES = `max-h-[var(--available-height)] w-64 overflow-y-auto rounded-[0.4rem] border border-[var(--line-strong)] bg-[var(--surface)] p-[0.35rem] shadow-[var(--shadow-lg)] outline-none ${POPUP_MOTION_CLASSES}`;
const ROW_CLASSES =
  'flex w-full cursor-pointer flex-col gap-0.5 rounded-[0.3rem] px-[0.55rem] py-[0.45rem] text-left text-[0.82rem] outline-none data-[disabled]:cursor-default data-[disabled]:text-[var(--text-muted)] data-[highlighted]:bg-[var(--surface-2)]';

/** A row's label, with its check slot and key hint, and when it is off the reason under it. */
function RowText({ item, reasonId }: { item: ContextMenuItem; reasonId: string }) {
  return (
    <>
      <span className="flex items-center gap-2">
        {item.checked !== undefined && (
          <span className="w-3 flex-none text-[0.7rem]" aria-hidden="true">
            {item.checked && <FontAwesomeIcon icon={faCheck} />}
          </span>
        )}
        <span className="min-w-0 flex-1">{item.label}</span>
        {item.shortcut && <KeyChord keys={item.shortcut} />}
      </span>
      {item.unavailable !== undefined && (
        <span id={`${reasonId}-${item.key}`} className="text-[0.72rem] text-[var(--text-muted)]">
          {item.unavailable}
        </span>
      )}
    </>
  );
}

/** One row: a plain item, or the trigger of its submenu. */
function Row({ item, reasonId }: { item: ContextMenuItem; reasonId: string }) {
  const off = item.unavailable !== undefined;
  const described = off ? `${reasonId}-${item.key}` : undefined;
  if (!item.submenu) {
    return item.checked === undefined ? (
      <BaseContextMenu.Item key={item.key} disabled={off} aria-describedby={described} onClick={item.onSelect} className={ROW_CLASSES}>
        <RowText item={item} reasonId={reasonId} />
      </BaseContextMenu.Item>
    ) : (
      <BaseContextMenu.CheckboxItem
        key={item.key}
        disabled={off}
        checked={item.checked}
        closeOnClick
        aria-describedby={described}
        onClick={item.onSelect}
        className={ROW_CLASSES}
      >
        <RowText item={item} reasonId={reasonId} />
      </BaseContextMenu.CheckboxItem>
    );
  }
  return (
    <BaseContextMenu.SubmenuRoot key={item.key}>
      <BaseContextMenu.SubmenuTrigger
        disabled={off}
        aria-describedby={described}
        className={`${ROW_CLASSES} relative pr-6 data-[popup-open]:bg-[var(--surface-2)]`}
      >
        <RowText item={item} reasonId={reasonId} />
        <span aria-hidden className="absolute top-1/2 right-2 -translate-y-1/2 text-[var(--text-muted)]">
          ›
        </span>
      </BaseContextMenu.SubmenuTrigger>
      <BaseContextMenu.Portal container={document.querySelector('main') ?? undefined}>
        <BaseContextMenu.Positioner collisionPadding={8} sideOffset={2} className="z-[var(--z-popover)]">
          <BaseContextMenu.Popup className={POPUP_CLASSES}>
            <Runs items={item.submenu} reasonId={reasonId} />
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.SubmenuRoot>
  );
}

/** The items as runs of neighbours that share a group: a labelled group, or an unlabelled run, with a rule between two runs. */
function Runs({ items, reasonId }: { items: ContextMenuItem[]; reasonId: string }) {
  return runsOf(items).map((run, at) => {
    const rows = run.items.map((item) => <Row key={item.key} item={item} reasonId={reasonId} />);
    const rule = at > 0 ? 'mt-1 border-t border-[var(--line-strong)] pt-1' : undefined;
    return run.group === undefined ? (
      <div key={`run-${at}`} className={rule}>
        {rows}
      </div>
    ) : (
      <BaseContextMenu.Group key={`run-${at}`} className={rule}>
        <BaseContextMenu.GroupLabel className="px-[0.55rem] pt-1 pb-0.5 font-['Barlow_Condensed',sans-serif] text-[0.7rem] font-semibold tracking-[0.14em] text-[var(--text-muted)] uppercase">
          {run.group}
        </BaseContextMenu.GroupLabel>
        {rows}
      </BaseContextMenu.Group>
    );
  });
}

/** A box the popup is placed against: what floating positioning reads of an anchor. */
type VirtualAnchor = { getBoundingClientRect: () => DOMRect };

const contains = (box: DOMRect, x: number, y: number) => x >= box.left - 1 && x <= box.right + 1 && y >= box.top - 1 && y <= box.bottom + 1;

/**
 * The text the menu was opened on, as a box at the pointer's x as tall as that text: the selection when the pointer is inside it (it may
 * run over several lines), else the line of text under the pointer. Undefined when the pointer is not on text (empty space, a button
 * row), and the menu opens at the pointer as before.
 */
export function textBoxAt(x: number, y: number): DOMRect | undefined {
  const selection = window.getSelection?.();
  if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if ([...range.getClientRects()].some((box) => contains(box, x, y))) {
      const box = range.getBoundingClientRect();
      return new DOMRect(x, box.top, 0, box.height);
    }
  }
  const caret = document.caretRangeFromPoint?.(x, y);
  const line = caret?.getClientRects()[0] ?? caret?.getBoundingClientRect();
  if (!line || line.height === 0 || !contains(new DOMRect(line.left - 1e4, line.top, 2e4, line.height), x, y)) return undefined;
  return new DOMRect(x, line.top, 0, line.height);
}

// An area that opens a menu of actions at the pointer on a right click, a long press, or the keyboard's Menu key or
// Shift+F10. It is `Menu`'s sibling: the same popup, the same items,
// the same roles and keys, but opened by the area instead of a button. `onOpen` runs on the contextmenu event, before the
// menu opens, so the caller can choose what the menu acts on (the word under the pointer) and the items reflect it. A menu
// with no items leaves the browser's own menu alone. An item that cannot run says why instead of vanishing, and is not
// selectable. An item with `submenu` opens a nested list beside it. The popup is portalled into the page's <main> (else to <body>), so screen readers and axe place it inside a
// landmark like the page it belongs to. The area keeps its own layout (`className`); the popup sits between the slide-over and the dialogs.
// Opened on text, the popup starts 4 px below the line (or the selection) at the pointer's x, and above it when there is more room
// there, so it never covers the words it acts on (alignment audit R3SC-2); anywhere else it opens at the pointer.
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
  const [anchor, setAnchor] = useState<VirtualAnchor>();
  const opened = (event: MouseEvent) => {
    const box = textBoxAt(event.clientX, event.clientY);
    setAnchor(box ? { getBoundingClientRect: () => box } : undefined);
    onOpen?.(event);
  };
  const beside = anchor ? { anchor, side: 'bottom' as const, align: 'start' as const, sideOffset: 4 } : {};
  return (
    <BaseContextMenu.Root>
      <BaseContextMenu.Trigger className={className} onContextMenu={items.length > 0 || onOpen ? opened : undefined}>
        {children}
      </BaseContextMenu.Trigger>
      <BaseContextMenu.Portal container={document.querySelector('main') ?? undefined}>
        <BaseContextMenu.Positioner collisionPadding={8} className="z-[var(--z-popover)]" {...beside}>
          <BaseContextMenu.Popup
            tabIndex={0}
            className={`max-h-[var(--available-height)] w-64 overflow-y-auto rounded-[0.4rem] border border-[var(--line-strong)] bg-[var(--surface)] p-[0.35rem] shadow-[var(--shadow-lg)] outline-none ${POPUP_MOTION_CLASSES}`}
          >
            <Runs items={items} reasonId={reasonId} />
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  );
}
