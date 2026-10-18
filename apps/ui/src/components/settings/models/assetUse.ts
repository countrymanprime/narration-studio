import { computerValue, overrideValue } from '../data/values';
import { assetOfOption, ROWS, rowOf } from '../registry/rows';
import type { Scope as HostScope, ScopedSettingField } from '../../../types';
import type { SettingMeta } from '../registry/types';
import { assetKey, type AssetView } from './AssetsStore';

type Ref = { kind: string; id: string };
type Fields = (row: SettingMeta) => { global?: ScopedSettingField; project?: ScopedSettingField };

/** One setting whose chosen value points at an asset: the computer's value, or this project's override. */
export type Use = { row: SettingMeta; scope: HostScope; value: string };

/** A use of the asset moved to another installed choice. */
export type Move = { use: Use; to: string; toLabel: string };

export type RemovalPlan = { moves: Move[]; blocked: SettingMeta[] };

const refOf = (row: SettingMeta, value: string, fieldsOf: Fields): Ref | undefined => {
  const kindOf = (rowId: string): string => {
    const other = rowOf(rowId);
    return other ? computerValue(other, fieldsOf(other).global) : '';
  };
  return assetOfOption(row.options?.[value], kindOf);
};

/** Every setting whose chosen value (the computer's, or a project's own) is this asset. */
export function usesOf(ref: Ref, fieldsOf: Fields): Use[] {
  const uses: Use[] = [];
  for (const row of ROWS) {
    if (!row.field || !row.options) continue;
    const { global, project } = fieldsOf(row);
    if (!global) continue;
    const computer = computerValue(row, global);
    const target = refOf(row, computer, fieldsOf);
    if (target && assetKey(target) === assetKey(ref)) uses.push({ row, scope: 'global', value: computer });
    const own = overrideValue(row, project);
    const targetOwn = own === undefined ? undefined : refOf(row, own, fieldsOf);
    if (own !== undefined && targetOwn && assetKey(targetOwn) === assetKey(ref)) uses.push({ row, scope: 'project', value: own });
  }
  return uses;
}

/** What the setting says in words when it is the project's own. */
export const settingLabel = (use: Use): string => (use.scope === 'project' ? `${use.row.label} (this project)` : use.row.label);

/**
 * Where each use of an asset goes when it is removed: the smallest other choice of that setting that is installed. A setting with none is
 * `blocked`, and the asset stays.
 */
export function planRemoval(uses: readonly Use[], ref: Ref, fieldsOf: Fields, viewOf: (ref: Ref) => AssetView | undefined): RemovalPlan {
  const moves: Move[] = [];
  const blocked: SettingMeta[] = [];
  for (const use of uses) {
    let best: { value: string; size: number } | undefined;
    for (const value of Object.keys(use.row.options ?? {})) {
      const target = refOf(use.row, value, fieldsOf);
      if (!target || assetKey(target) === assetKey(ref)) continue;
      const view = viewOf(target);
      if (view?.status !== 'installed') continue;
      if (!best || view.item.diskSize < best.size) best = { value, size: view.item.diskSize };
    }
    if (best) moves.push({ use, to: best.value, toLabel: use.row.options?.[best.value]?.label ?? best.value });
    else if (!blocked.includes(use.row)) blocked.push(use.row);
  }
  return { moves, blocked };
}
