import { Menu as BaseMenu } from '@base-ui/react/menu';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
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
  onSelect: () => void;
};

// A heading over its items. `many` makes the items checkboxes (menuitemcheckbox), `one` radios (menuitemradio); choosing one calls its
// `onSelect` and keeps the menu open, so several choices can be made in one visit. Without `select` the items are plain and close the menu.
export type MenuSection = { key: string; label?: string; select?: 'many' | 'one'; items: MenuItem[] };

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

function Section({ section, first }: { section: MenuSection; first: boolean }) {
  const heading = section.label && (
    <BaseMenu.GroupLabel className="px-[0.55rem] pt-[0.35rem] pb-[0.2rem] text-[0.7rem] font-semibold tracking-[0.06em] text-[var(--text-muted)] uppercase">
      {section.label}
    </BaseMenu.GroupLabel>
  );
  const separator = first ? null : <BaseMenu.Separator className="mx-[0.35rem] my-[0.3rem] border-t border-[var(--border)]" />;
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
            <BaseMenu.RadioItem key={item.key} value={item.key} closeOnClick={false} className={ITEM_CLASS}>
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
            <BaseMenu.CheckboxItem key={item.key} checked={item.checked === true} onCheckedChange={item.onSelect} closeOnClick={false} className={ITEM_CLASS}>
              <ItemBody item={item} mark="box" />
            </BaseMenu.CheckboxItem>
          ) : (
            <BaseMenu.Item key={item.key} onClick={item.onSelect} className={ITEM_CLASS}>
              <ItemBody item={item} />
            </BaseMenu.Item>
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
  return (
    // Not modal: the page behind stays scrollable and clickable, as with the menu this replaced (a press outside closes it).
    <BaseMenu.Root modal={false}>
      <BaseMenu.Trigger disabled={disabled} {...(render ? { render } : { 'aria-label': label, className: triggerClassName, style: triggerStyle })}>
        {children}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-[var(--z-popover)]">
          <BaseMenu.Popup
            className={`max-h-[var(--available-height)] ${sections ? 'w-60' : 'w-44'} overflow-y-auto rounded-[0.4rem] border border-[var(--line-strong)] bg-[var(--surface)] p-[0.35rem] shadow-[var(--shadow-lg)] outline-none ${POPUP_MOTION_CLASSES}`}
          >
            {items.map((item) => (
              <BaseMenu.Item key={item.key} onClick={item.onSelect} className={ITEM_CLASS}>
                {item.leading}
                {item.label}
              </BaseMenu.Item>
            ))}
            {sections?.map((section, index) => (
              <Section key={section.key} section={section} first={index === 0 && items.length === 0} />
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
