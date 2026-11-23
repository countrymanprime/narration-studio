import { pageOfPath } from './navigation/address';

/**
 * The key of the boundary around the routed page. It changes with the page and with the project, so React remounts the page when either changes: what a page holds in its
 * own state for the project that was open (a dialog whose confirm would act on that project's chapter, a draft) does not carry into the next project (#4057).
 */
export function pageBoundaryKey(projectFolder: string, pathname: string): string {
  return JSON.stringify([projectFolder, pageOfPath(pathname).slice(1) || 'production']);
}

/**
 * Whether an address written under `owner` is another project's in `current`. Only a known, different project says so: no owner yet (recorded before the bootstrap answered) or no
 * project yet is not a difference.
 */
export function isOtherProject(owner: string | undefined, current: string | undefined): boolean {
  return current !== undefined && owner !== undefined && owner !== current;
}

/** The part of `history.state` the router writes that these checks read. */
export type HistoryEntryState = { key?: string; idx?: unknown } | null;

/**
 * Whether history holds a move to another entry than the one on screen (a push or a Back waiting in a transition). A page's own replace stays on the same index and holds
 * nothing, and a state with no key or no index is not a move (#4059).
 */
export function historyHoldsMove(state: HistoryEntryState, locationKey: string, shown: { key: string; idx: unknown } | undefined): boolean {
  const sameIndex = shown?.key === locationKey && shown.idx !== undefined && shown.idx === state?.idx;
  if (state?.key === undefined) return state?.idx !== undefined && shown?.key === locationKey && shown.idx !== undefined && !sameIndex;
  return state.key !== locationKey && !sameIndex;
}
