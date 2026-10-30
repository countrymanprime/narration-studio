import { useEffect, useState } from 'react';
import type { ProductionChapter, ProductionRateBasis } from '../../api/contracts/production';
import type { Measured } from '../../api/schemas/base';
import { usePort } from '../../ports/usePort';
import { useMeasured } from '../production/measured/useMeasured';
import { ownRate, wphOf, type PaceChapter } from '../production/target/pace.selectors';
import { MIN_OWN_RATE_CHAPTERS, WPH } from './estimates';

type Basis = ProductionRateBasis | undefined;
type Lengths = Measured<Readonly<Record<string, number>>>;

const listeners = new Set<(basis: Basis) => void>();

/** Tells every open `useRateBasis` which rate basis was just saved, so the hours on the open pages follow the toggle without a reload. */
export function announceRateBasis(basis: Basis): void {
  for (const listener of [...listeners]) listener(basis);
}

/** The chapters the pace is worked out over: the narrated ones, as the target popover lists them. */
export const paceChapters = (chapters: readonly ProductionChapter[]): PaceChapter[] =>
  chapters.filter((c) => c.contentKind !== 'reference').map((c) => ({ id: c.id, tag: c.title, words: c.wordCount }));

/** The basis the plan chose, from the plan the page already read; one saved from the toggle replaces it at once, until a different plan is read. */
export function useRateBasis(planBasis: Basis): Basis {
  const [saved, setSaved] = useState<{ over: Basis; basis: Basis }>();
  useEffect(() => {
    const listener = (basis: Basis) => setSaved({ over: planBasis, basis });
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, [planBasis]);
  return saved && saved.over === planBasis ? saved.basis : planBasis;
}

/**
 * Words per finished hour under the basis the plan chose (docs/research/ui-function-audit.md, cluster 5): the narrator's own rate when it was
 * chosen and is measured, else the standard `WPH`. Every hours figure on Production and Schedule divides by this one value, so the Schedule
 * basis toggle changes all of them. While the lengths are unread it is the standard.
 */
export const effectiveWph = (basis: Basis, chapters: readonly PaceChapter[], lengths: Lengths | undefined): number =>
  wphOf(basis, ownRate(chapters, lengths ?? { ok: false, reason: 'Reading the measured lengths…' }, MIN_OWN_RATE_CHAPTERS), WPH);

/** `effectiveWph` for a page that reads neither the overview nor the lengths itself (Schedule); the Production page passes its own reads to `effectiveWph`. */
export function useEffectiveWph(planBasis: Basis): number {
  const production = usePort('production');
  const measured = useMeasured(usePort('measurements'), '', []);
  const [chapters, setChapters] = useState<PaceChapter[]>([]);
  useEffect(() => {
    let live = true;
    void production.productionOverview().then(
      (overview) => live && setChapters(paceChapters(overview.chapters)),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [production]);
  return effectiveWph(useRateBasis(planBasis), chapters, measured.answers?.chapterLengths);
}
