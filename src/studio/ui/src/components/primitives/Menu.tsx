import { Menu as BaseMenu } from '@base-ui/react/menu';
import { useId, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { POPUP_MOTION_CLASSES } from './overlayMotion';

export type MenuItem = {
  key: string;
  label: string;
  // Drawn before the label (a colour dot, an icon).
  leading?: ReactNode;
  // Drawn muted at the end of the row (a count).
  trailing?: ReactNode;
  // In a section that chooses, whether this item is chosen.
  checked?: boolean;
  // Why the item cannot be chosen now. The item stays in the menu, off (`aria-disabled`, still reachable by keyboard), with this sentence
  // under its label; a press does nothing and the menu stays open. Only for a plain item (a section that chooses has none).
  disabledReason?: string;
  onSelect: () => void;
};

// A heading over its items. `many` makes the items checkboxes (menuitemcheckbox), `one` radios (menuitemradio); choosing one calls its
// `onSelect` and keeps the menu open, so several choices can be made in one visit, unless `closeOnSelect` (a sort order: one choice and done).
// Without `select` the items are plain and close the menu.
export type MenuSection = { key: string; label?: string; select?: 'many' | 'one'; items: MenuItem[]; closeOnSelect?: boolean };

const ITEM_CLASS =
  'flex w-full cursor-pointer items-center gap-2 rounded-[0.3rem] px-[0.55rem] py-[0.45rem] text-left text-[0.82rem] outline-none data-[highlighted]:bg-[var(--surface-2)]';

/** The mark of a checkbox or radio item: a box (or a circle) filled with the accent when chosen. */
function Mark({ round, checked }: { round: boolean; checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-3.5 flex-none place-items-center border ${round ? 'rounded-full' : 'rounded-[0.2rem]'} ${checked ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--line-strong)]'}`}
    >
      {checked && (
        <span
          className={`bg-[var(--surface)] ${round ? 'size-1.5 rounded-full' : 'h-1.5 w-1 -translate-y-px rotate-45 border-r-2 border-b-2 border-[var(--surface)] bg-transparent'}`}
        />
      )}
    </span>
  );
}

function ItemBody({ item, mark }: { item: MenuItem; mark?: 'box' | 'round' }) {
  return (
    <>
      {mark && <Mark round={mark === 'round'} checked={item.checked === true} />}
      {item.leading}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.trailing !== undefined && (
        <span className="text-[var(--text-muted)] tabular-nums">
          {/* Read as "Place, 96", not "Place96". */}
          <span className="sr-only">, </span>
          {item.trailing}
        </span>
      )}
    </>
  );
}

// A plain item. With a `disabledReason` it is drawn muted and answers a press with nothing, and the reason is its description.
function PlainItem({ item }: { item: MenuItem }) {
  const reasonId = useId();
  if (item.disabledReason === undefined)
    return (
      <BaseMenu.Item onClick={item.onSelect} className={ITEM_CLASS}>
        <ItemBody item={item} />
      </BaseMenu.Item>
    );
  return (
    <BaseMenu.Item
      closeOnClick={false}
      disabled
      aria-describedby={reasonId}
      className={`${ITEM_CLASS} cursor-default flex-col items-stretch gap-0.5 text-[var(--text-muted)]`}
    >
      <span className="flex w-full items-center gap-2">
        <ItemBody item={item} />
      </span>
      <span id={reasonId} className="text-[0.74rem] leading-snug [overflow-wrap:anywhere] whitespace-normal">
        {item.disabledReason}
      </span>
    </BaseMenu.Item>
  );
}

function Section({ section, first }: { section: MenuSection; first: boolean }) {
  const heading = section.label && (
    <BaseMenu.GroupLabel className="px-[0.55rem] pt-[0.35rem] pb-[0.2rem] text-[0.7rem] font-semibold tracking-[0.06em] text-[var(--text-muted)] uppercase">
      {section.label}
    </BaseMenu.GroupLabel>
  );
  const separator = first ? null : <BaseMenu.Separator className="mx-[0.35rem] my-[0.3rem] border-t border-[var(--line-strong)]" />;
  if (section.select === 'one')
    return (
      <>
        {separator}
        <BaseMenu.RadioGroup
          value={section.items.find((item) => item.checked)?.key ?? null}
          onValueChange={(key: string) => section.items.find((item) => item.key === key)?.onSelect()}
        >
          {heading}
          {section.items.map((item) => (
            <BaseMenu.RadioItem key={item.key} value={item.key} closeOnClick={section.closeOnSelect === true} className={ITEM_CLASS}>
              <ItemBody item={item} mark="round" />
            </BaseMenu.RadioItem>
          ))}
        </BaseMenu.RadioGroup>
      </>
    );
  return (
    <>
      {separator}
      <BaseMenu.Group>
        {heading}
        {section.items.map((item) =>
          section.select === 'many' ? (
            <BaseMenu.CheckboxItem
              key={item.key}
              checked={item.checked === true}
              onCheckedChange={item.onSelect}
              closeOnClick={section.closeOnSelect === true}
              className={ITEM_CLASS}
            >
              <ItemBody item={item} mark="box" />
            </BaseMenu.CheckboxItem>
          ) : (
            <PlainItem key={item.key} item={item} />
          ),
        )}
      </BaseMenu.Group>
    </>
  );
}

// A menu button: the trigger (its content is `children`) opens a menu of items. Base UI supplies what the hand-rolled
// `role="menu"` lacked: arrow keys, Home and End, typeahead, Enter and Space, Escape, `aria-haspopup`/`aria-expanded`, and
// focus returning to the button. Choosing an item calls its `onSelect` and closes the menu. The trigger keeps the caller's
// look (`triggerClassName`, `triggerStyle`); the popup sits between the slide-over and the dialogs.
export function Menu({
  items = [],
  sections,
  disabled,
  pageMenu = false,
  onOpenChange,
  label,
  triggerClassName,
  triggerStyle,
  render,
  children,
}: {
  items?: MenuItem[];
  // Headed groups of items, drawn after `items` (a filter menu: one section per thing it filters by). The popup widens to hold them.
  sections?: MenuSection[];
  disabled?: boolean;
  // A menu opened from a page's own header, not from inside a dialog or a slide-over: it is modal (the page behind is inert while it shows, a press outside closes
  // it) and its popup sits in the page's `<main>`, so it is inside a landmark, as `ContextMenu`'s is. The default menu is not modal and is portalled to the body.
  pageMenu?: boolean;
  // Told when the menu opens or closes, for a caller that reads what the menu shows only once it is wanted (the DAW tools menu).
  onOpenChange?: (open: boolean) => void;
  // An accessible name for the trigger, for an icon-only trigger whose `children` carries no text of its own. Ignored
  // when `render` is given: that element owns its own accessible name (an `IconButton`'s `label`).
  label?: string;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  // Renders the trigger as another component instead of a plain button, the same pattern as `TooltipTarget` - pass
  // `<IconButton label="..." />` for an icon-only trigger instead of pasting the icon-button look here.
  render?: ReactElement;
  children: ReactNode;
}) {
  const [main, setMain] = useState<HTMLElement>();
  return (
    // Not modal unless it is a page menu: the page behind stays scrollable and clickable, as with the menu this replaced (a press outside closes it).
    <BaseMenu.Root
      modal={pageMenu}
      onOpenChange={(isOpen) => {
        // Looked up as it opens: the page's `<main>` need not be in the document when the menu is first drawn.
        if (isOpen && pageMenu) setMain(document.querySelector('main') ?? undefined);
        onOpenChange?.(isOpen);
      }}
    >
      <BaseMenu.Trigger disabled={disabled} {...(render ? { render } : { 'aria-label': label, className: triggerClassName, style: triggerStyle })}>
        {children}
      </BaseMenu.Trigger>
      <BaseMenu.Portal container={pageMenu ? main : undefined}>
        <BaseMenu.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-[var(--z-popover)]">
          <BaseMenu.Popup
            className={`max-h-[var(--available-height)] ${sections ? 'w-60' : 'w-44'} overflow-y-auto rounded-[0.4rem] border border-[var(--line-strong)] bg-[var(--surface)] p-[0.35rem] shadow-[var(--shadow-lg)] outline-none ${POPUP_MOTION_CLASSES}`}
          >
            {items.map((item) =>
              item.disabledReason !== undefined ? (
                <PlainItem key={item.key} item={item} />
              ) : (
                <BaseMenu.Item key={item.key} onClick={item.onSelect} className={ITEM_CLASS}>
                  {item.leading}
                  {item.label}
                </BaseMenu.Item>
              ),
            )}
            {sections?.map((section, index) => (
              <Section key={section.key} section={section} first={index === 0 && items.length === 0} />
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
