import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductionPlan, ProductionRateBasis } from '../../../api/contracts/production';
import { usePort } from '../../../ports/usePort';
import { IconButton } from '../../primitives/IconButton';
import { Popover, POPOVER_POPUP_SELECTOR } from '../../primitives/Popover';
import { useMeasured } from '../measured/useMeasured';
import { MIN_OWN_RATE_CHAPTERS, WPH } from '../../schedule/estimates';
import { basisOf, ownRate, targetHours, type PaceChapter } from './pace.selectors';
import { TargetPopover } from './TargetPopover';

/** How long the pointer may be off both the icon and the popover before a hover-opened popover closes (the mock's 250 ms). */
const LEAVE_MS = 250;

const tagOf = (id: string, title: string): string => (/^\d+$/.test(id) ? `Ch ${id}` : title);

/**
 * The info icon beside the Recording KPI (the mock's `TargetInfoButton`). It sits on the KPI's corner out of the flow, so the KPI
 * must be `relative`. Hover and keyboard focus open the popover, a click keeps it open, and one opened by hover closes when the
 * pointer leaves both the icon and the popover. Choosing a basis writes the plan's rate basis: a setting, not an undo step.
 */
export function TargetInfoButton() {
  const production = usePort('production');
  const measurements = usePort('measurements');
  const measured = useMeasured(measurements, '', []);
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [chapters, setChapters] = useState<PaceChapter[]>([]);
  const [open, setOpen] = useState(false);
  const byHover = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  // Closing returns focus to the icon, which must not read as a keyboard arrival and open it again.
  const closing = useRef(false);
  // A press on the icon is under way, so the toggle Base UI reports is the click and not an outside press or Escape.
  const pressed = useRef(false);

  useEffect(() => {
    let live = true;
    void Promise.all([production.productionPlan(), production.productionOverview()]).then(
      ([p, overview]) => {
        if (!live) return;
        setPlan(p);
        setChapters(overview.chapters.filter((c) => c.contentKind !== 'reference').map((c) => ({ id: c.id, tag: tagOf(c.id, c.title), words: c.wordCount })));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [production]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const lengths = measured.answers?.chapterLengths ?? { ok: false as const, reason: 'Reading the measured lengths…' };
  const own = ownRate(chapters, lengths, MIN_OWN_RATE_CHAPTERS);
  const basis = basisOf(plan?.rateBasis, own);

  const show = (hover: boolean): void => {
    clearTimeout(timer.current);
    if (!open) byHover.current = hover;
    setOpen(true);
  };
  const leave = (): void => {
    if (!byHover.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const overIcon = trigger.current?.matches(':hover') ?? false;
      if (byHover.current && !overIcon && !document.querySelector(`${POPOVER_POPUP_SELECTOR}:hover`)) setOpen(false);
    }, LEAVE_MS);
  };
  const choose = useCallback(
    (next: ProductionRateBasis): void => {
      void production.setProductionRateBasis(next).then(setPlan, () => undefined);
    },
    [production],
  );

  return (
    <Popover
      label="Finished-hour target"
      open={open}
      onOpenChange={(next) => {
        // A click on the icon while a hover opened the popover keeps it open instead of toggling it shut.
        if (!next && pressed.current && byHover.current) {
          byHover.current = false;
          return;
        }
        if (next) byHover.current = false;
        else {
          closing.current = true;
          setTimeout(() => (closing.current = false), 0);
        }
        setOpen(next);
      }}
      trigger={
        <IconButton
          ref={trigger}
          label="Finished-hour target"
          aria-haspopup="dialog"
          size="sm"
          className="absolute top-1 right-1 border-transparent bg-transparent"
          onPointerDown={() => {
            pressed.current = true;
            setTimeout(() => (pressed.current = false), 0);
          }}
          onMouseEnter={() => show(true)}
          onMouseLeave={leave}
          onFocus={(event) => {
            if (!closing.current && event.currentTarget.matches(':focus-visible')) show(false);
          }}
        >
          <span aria-hidden="true" className="font-serif text-sm leading-none font-bold italic">
            i
          </span>
        </IconButton>
      }
    >
      <div onMouseLeave={leave} onMouseEnter={() => clearTimeout(timer.current)}>
        <TargetPopover own={own} hours={targetHours(chapters, own, WPH)} basis={basis} onBasis={choose} />
      </div>
    </Popover>
  );
}
