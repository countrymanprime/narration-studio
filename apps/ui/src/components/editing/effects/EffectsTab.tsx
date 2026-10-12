import { useMemo, useState } from 'react';
import type { EditCut } from '../../../api/contracts/editCuts';
import type { WordFx } from '../../../api/contracts/wordFx';
import { useDawKind } from '../../../useDawKind';
import { summarize, type ChapterDoc } from '../model';
import { docCutsOf } from '../range/common/locate';
import { BUILT_IN } from '../range/common/rangePlan';
import type { FxWords } from '../range/fx/useFxWords';
import { AddEffect } from './AddEffect';
import { CoverageStrip } from './CoverageStrip';
import { EffectInspector } from './EffectInspector';
import { EffectsList } from './EffectsList';
import { impactOf } from './effectsMath';
import { OnWords } from './OnWords';
import { useFxCap } from './useFxCap';

export interface EffectsTabProps {
  doc: ChapterDoc;
  /** The chapter's effects on words as the page last read them, in time order. */
  effects: readonly WordFx[];
  /** The chapter's stored cuts, so each effect is placed where it sounds now. */
  cuts: readonly EditCut[];
  /** The chapter's length now, in seconds. */
  total: number;
  /** The keys of the words selected on the page. */
  selected: readonly string[];
  /** Add FX and Remove from the page's `useFxWords` (SN-E64): the question, the DAW and the history are its. */
  fx: Pick<FxWords, 'list' | 'ask' | 'remove' | 'refusalOf'>;
  /** Selects these words in the script. */
  onSelectWords: (keys: string[]) => void;
}

/** The count the drawer's Effects tab wears. */
export const effectsCount = (effects: readonly WordFx[]): number => effects.length;

/**
 * The Effects tab: the effects put on words, the coverage strip with its cap, the list, Add effect, and the one picked in the inspector. The
 * cap is the project's Editing.fx_cap_pct; the strip's state and Add effect's warning follow it.
 */
export function EffectsTab({ doc, effects, cuts, total, selected, fx, onSelectWords }: EffectsTabProps) {
  const kind = useDawKind();
  const dawName = kind === undefined ? 'the DAW' : kind === 'none' || kind === 'Built-in' ? BUILT_IN : kind;
  const fxCap = useFxCap();
  const [pick, setPick] = useState<string | null>(null);
  const current = effects.find((f) => f.id === pick) ?? effects[0] ?? null;
  const docCuts = useMemo(() => docCutsOf(cuts), [cuts]);
  const summary = useMemo(() => (selected.length ? summarize(doc, [...selected], docCuts, (t) => t) : null), [doc, selected, docCuts]);
  const range = summary?.ranges.length === 1 ? summary.ranges[0] : null;
  const impact = useMemo(() => (range ? impactOf(effects, cuts, total, range, fxCap.cap) : null), [range, effects, cuts, total, fxCap.cap]);
  return (
    <div className="flex flex-col gap-4">
      <OnWords effects={effects} cuts={cuts} onSelect={(f) => onSelectWords(f.keys)} onRemove={(f) => void fx.remove(f)} />
      <CoverageStrip
        effects={effects}
        cuts={cuts}
        total={total}
        selectedId={current?.id ?? null}
        onSelect={setPick}
        cap={fxCap.cap}
        onCapChange={fxCap.ready ? fxCap.setCap : undefined}
        capError={fxCap.error}
      />
      <EffectsList effects={effects} cuts={cuts} total={total} selectedId={current?.id ?? null} onSelect={setPick} />
      {current ? <EffectInspector fx={current} cuts={cuts} total={total} dawName={dawName} onRemove={(f) => void fx.remove(f)} /> : null}
      <AddEffect
        hasSelection={selected.length > 0}
        reason={summary ? fx.refusalOf(summary) : ''}
        impact={impact}
        cap={fxCap.cap}
        list={fx.list}
        onAdd={() => fx.ask(selected)}
      />
    </div>
  );
}
