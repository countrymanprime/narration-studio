import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu';
import { useId } from 'react';
import type { MouseEvent, ReactNode } from 'react';
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

/** A row's label and, when it is off, the reason under it. */
function RowText({ item, reasonId }: { item: ContextMenuItem; reasonId: string }) {
  return (
    <>
      {item.label}
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
    return (
      <BaseContextMenu.Item key={item.key} disabled={off} aria-describedby={described} onClick={item.onSelect} className={ROW_CLASSES}>
        <RowText item={item} reasonId={reasonId} />
      </BaseContextMenu.Item>
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

// An area that opens a menu of actions at the pointer on a right click, a long press, or the keyboard's Menu key or
// Shift+F10. It is `Menu`'s sibling: the same popup, the same items,
// the same roles and keys, but opened by the area instead of a button. `onOpen` runs on the contextmenu event, before the
// menu opens, so the caller can choose what the menu acts on (the word under the pointer) and the items reflect it. A menu
// with no items leaves the browser's own menu alone. An item that cannot run says why instead of vanishing, and is not
// selectable. An item with `submenu` opens a nested list beside it. The popup is portalled into the page's <main> (else to <body>), so screen readers and axe place it inside a
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
