import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu';
import { useId } from 'react';
import type { MouseEvent, ReactNode } from 'react';

export type ContextMenuItem = {
  key: string;
  label: string;
  // Why the item is off, shown under the label and read as its description. An item with a reason is disabled.
  unavailable?: string;
  // The heading of the group this item belongs to ("Mark as"). Neighbouring items with the same group share one labelled group; the label
  // gives them their context, so each item's own label is only its name. Items with no group stay in one unlabelled run.
  group?: string;
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
          <BaseContextMenu.Popup
            tabIndex={0}
            className="max-h-[var(--available-height)] w-64 overflow-y-auto rounded-[0.4rem] border border-[var(--line-strong)] bg-[var(--surface)] p-[0.35rem] shadow-[var(--shadow-lg)] outline-none"
          >
            {runsOf(items).map((run, at) => {
              const rows = run.items.map((item) => (
                <BaseContextMenu.Item
                  key={item.key}
                  disabled={item.unavailable !== undefined}
                  aria-describedby={item.unavailable === undefined ? undefined : `${reasonId}-${item.key}`}
                  onClick={item.onSelect}
                  className="flex w-full cursor-pointer flex-col gap-0.5 rounded-[0.3rem] px-[0.55rem] py-[0.45rem] text-left text-[0.82rem] outline-none data-[disabled]:cursor-default data-[disabled]:text-[var(--text-muted)] data-[highlighted]:bg-[var(--surface-2)]"
                >
                  {item.label}
                  {item.unavailable !== undefined && (
                    <span id={`${reasonId}-${item.key}`} className="text-[0.72rem] text-[var(--text-muted)]">
                      {item.unavailable}
                    </span>
                  )}
                </BaseContextMenu.Item>
              ));
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
