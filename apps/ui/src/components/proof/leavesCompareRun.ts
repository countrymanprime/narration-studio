/** Whether a move leaves a Proof chapter view while its compare run is under way or showing results
 * (leaving resets the run). `to` is undefined for Back/Forward, which always leave the page. */
export function leavesCompareRun(from: string, to: string | undefined, phase: string): boolean {
  return from.startsWith('/proof/') && to !== from && phase !== 'idle';
}
