import { Menu as BaseMenu } from '@base-ui/react/menu';
import type { CSSProperties } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { TooltipTarget } from './Tooltip';

// The value that stands for "All chapters" in `value` and in `onChange`, where the page allows it.
export const ALL_CHAPTERS = 'all';

export type Chapter = { id: string; name: string };

// The chapter bar of the mocks (`ChapterBar`): previous, a fixed-width picker listing every chapter, next. Presentational: the page
// owns the chapter and decides what a step means (leaving "all" for the chapter view comes first, as the mock's `stepChapter` does).
export function ChapterStepper({
  chapters,
  value,
  allowAll = false,
  stepKeys,
  disabled,
  onChange,
  onStep,
}: {
  chapters: Chapter[];
  // A chapter id, or `ALL_CHAPTERS`.
  value: string;
  // Adds "All chapters" on top of the list.
  allowAll?: boolean;
  // The keys the page binds to previous and next, named in the arrows' tips: `['←', '→']` on Proof, `['Alt+↑', 'Alt+↓']` elsewhere. A page
  // that binds none (the Booth) leaves it out, and the tips name no key: a tip never promises a shortcut that does nothing.
  stepKeys?: readonly [string, string];
  // Why the whole control is off right now (a take is running): the arrows and the picker are disabled and the tip says why instead of the key.
  disabled?: string;
  onChange: (id: string) => void;
  onStep: (direction: -1 | 1) => void;
}) {
  const isAll = value === ALL_CHAPTERS;
  const index = chapters.findIndex((chapter) => chapter.id === value);
  const label = isAll ? 'All chapters' : (chapters[index]?.name ?? '');
  const labels = [...(allowAll ? ['All chapters'] : []), ...chapters.map((chapter) => chapter.name)];
  const width = Math.max(...labels.map((text) => text.length));
  const items = [...(allowAll ? [{ id: ALL_CHAPTERS, name: 'All chapters' }] : []), ...chapters];

  const arrow = (direction: -1 | 1, name: string, icon: 'previousChapter' | 'nextChapter', key: string | undefined, atEnd: boolean) => {
    // The tip says why the arrow is off, or the key that does the same; with neither it is just the name.
    const reason = disabled ?? (atEnd ? (direction === -1 ? 'This is the first chapter' : 'This is the last chapter') : undefined);
    return (
      <TooltipTarget text={reason ?? (key ? `${name} (${key})` : name)}>
        <IconButton label={name} disabledReason={reason} onClick={() => onStep(direction)}>
          <Icon name={icon} />
        </IconButton>
      </TooltipTarget>
    );
  };

  return (
    <div role="group" aria-label="Chapter" className="flex max-w-full min-w-0 items-center gap-1">
      {arrow(-1, 'Previous chapter', 'previousChapter', stepKeys?.[0], !isAll && index <= 0)}
      <BaseMenu.Root modal={false} disabled={disabled !== undefined}>
        <BaseMenu.Trigger
          render={
            <Button
              variant="secondary"
              aria-label={`Chapter: ${label}. Change chapter`}
              // One width for the longest label, up to the mock's 340 px, once there is room for it; below 860 px the picker takes what is left.
              className="max-w-full min-w-0 justify-between gap-2 min-[860px]:min-w-[min(var(--chapter-ch),21.25rem)]"
              style={{ '--chapter-ch': `${width}ch` } as CSSProperties}
            />
          }
        >
          <span className="min-w-0 truncate">{label}</span>
          <span aria-hidden="true">▾</span>
        </BaseMenu.Trigger>
        <BaseMenu.Portal>
          <BaseMenu.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-[var(--z-popover)]">
            <BaseMenu.Popup className="max-h-[min(20rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto rounded-[0.4rem] border border-[var(--line-strong)] bg-[var(--surface)] p-[0.35rem] shadow-[var(--shadow-lg)] outline-none">
              <BaseMenu.RadioGroup value={value} onValueChange={(next) => onChange(String(next))}>
                {items.map((item) => (
                  <BaseMenu.RadioItem
                    key={item.id}
                    value={item.id}
                    closeOnClick
                    className="flex w-full cursor-pointer items-center gap-2 rounded-[0.3rem] px-[0.55rem] py-[0.45rem] text-left text-[0.82rem] outline-none data-[checked]:font-semibold data-[highlighted]:bg-[var(--surface-2)]"
                  >
                    {item.name}
                  </BaseMenu.RadioItem>
                ))}
              </BaseMenu.RadioGroup>
            </BaseMenu.Popup>
          </BaseMenu.Positioner>
        </BaseMenu.Portal>
      </BaseMenu.Root>
      {arrow(1, 'Next chapter', 'nextChapter', stepKeys?.[1], !isAll && index >= chapters.length - 1)}
    </div>
  );
}
