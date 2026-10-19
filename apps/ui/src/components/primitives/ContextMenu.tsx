import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu';
import { Menu as BaseMenu } from '@base-ui/react/menu';
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
  // The items a row opens beside itself ("Add FX" > the chains), one level. A row with a submenu is a trigger: it opens on a click, Enter, the
  // right arrow or a hover, and runs nothing itself (`onSelect` is not called). An `unavailable` row has no submenu and says why.
  submenu?: ContextMenuItem[];
  onSelect: () => void;
};

const ROW =
  'flex w-full cursor-pointer flex-col gap-0.5 rounded-[0.3rem] px-[0.55rem] py-[0.45rem] text-left text-[0.82rem] outline-none data-[disabled]:cursor-default data-[disabled]:text-[var(--text-muted)] data-[highlighted]:bg-[var(--surface-2)]';
const POPUP =
  'max-h-[var(--available-height)] w-64 overflow-y-auto rounded-[0.4rem] border border-[var(--line-strong)] bg-[var(--surface)] p-[0.35rem] shadow-[var(--shadow-lg)] outline-none';

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

/** One row: an item, or a trigger with the submenu it opens beside it. */
function Row({ item, reasonId }: { item: ContextMenuItem; reasonId: string }) {
  const why = item.unavailable === undefined ? undefined : `${reasonId}-${item.key}`;
  const label = (
    <>
      {item.label}
      {item.unavailable !== undefined && (
        <span id={why} className="text-[0.72rem] text-[var(--text-muted)]">
          {item.unavailable}
        </span>
      )}
    </>
  );
  if (!item.submenu || item.unavailable !== undefined) {
    return (
      <BaseContextMenu.Item disabled={item.unavailable !== undefined} aria-describedby={why} onClick={item.onSelect} className={ROW}>
        {label}
      </BaseContextMenu.Item>
    );
  }
  return (
    <BaseMenu.SubmenuRoot>
      <BaseMenu.SubmenuTrigger className={`${ROW} data-[popup-open]:bg-[var(--surface-2)]`}>
        <span className="flex items-center justify-between gap-2">
          {item.label}
          <span aria-hidden="true">›</span>
        </span>
      </BaseMenu.SubmenuTrigger>
      <BaseMenu.Portal container={document.querySelector('main') ?? undefined}>
        <BaseMenu.Positioner collisionPadding={8} alignOffset={-4} className="z-[var(--z-popover)]">
          <BaseMenu.Popup aria-label={item.label} className={`${POPUP} ${POPUP_MOTION_CLASSES}`}>
            {item.submenu.map((sub) => (
              <Row key={sub.key} item={sub} reasonId={reasonId} />
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.SubmenuRoot>
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
          <BaseContextMenu.Popup tabIndex={0} className={`${POPUP} ${POPUP_MOTION_CLASSES}`}>
            {runsOf(items).map((run, at) => {
              const rows = run.items.map((item) => <Row key={item.key} item={item} reasonId={reasonId} />);
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
