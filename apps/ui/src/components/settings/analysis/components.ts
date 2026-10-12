import type { AssetCatalog, AssetInstallJob, AssetItem } from '../../../types';

/** The registry kind the optional Story Bible analysis tools are listed under (ADR 0847). */
export const ANALYSIS_KIND = 'analysis';

/** Where a tool is, as its row's pill says it. */
export type ToolStatus = 'installed' | 'downloading' | 'verifying' | 'failed' | 'not-installed' | 'unavailable';

/** What the section knows about a tool beyond the registry row: the install running for it, or the sentence its last one failed with. */
export type ToolRun = { job?: Pick<AssetInstallJob, 'phase'>; starting?: boolean; failure?: string };

/** The analysis tools of the registry, in the registry's order. */
export const analysisTools = (catalog: Pick<AssetCatalog, 'assets'>): AssetItem[] => catalog.assets.filter((item) => item.kind === ANALYSIS_KIND);

export function statusOf(item: Pick<AssetItem, 'installState' | 'unavailableReason'>, run: ToolRun = {}): ToolStatus {
  if (run.starting || run.job?.phase === 'downloading') return 'downloading';
  if (run.job?.phase === 'verifying') return 'verifying';
  if (run.job?.phase === 'success') return 'installed';
  if (item.installState === 'installed') return 'installed';
  if (item.unavailableReason) return 'unavailable';
  if (run.failure) return 'failed';
  return 'not-installed';
}

/** The tools offered together on the first scan: the host's `recommended` flag, never a list kept here. */
export const recommended = (tools: AssetItem[]): AssetItem[] => tools.filter((tool) => tool.recommended && !tool.unavailableReason);

/** Whether any tool that can be used is on this computer. */
export const anyInstalled = (tools: AssetItem[]): boolean => tools.some((tool) => !tool.unavailableReason && tool.installState === 'installed');

/** The tools a consent can offer, in the order asked for: known, and not unavailable. */
export const offerable = (tools: AssetItem[], ids: string[]): AssetItem[] =>
  ids.flatMap((id) => tools.filter((tool) => tool.id === id && !tool.unavailableReason));

export const totalDownload = (tools: Pick<AssetItem, 'downloadSize'>[]): number => tools.reduce((sum, tool) => sum + tool.downloadSize, 0);

/** The memory a tool needs, the same words in the row and the consent. */
export const memoryText = (gb: number): string => `about ${gb} GB of memory`;

/** How long a book takes, in plain words. */
export const minutesText = (minutes: number): string =>
  minutes >= 60 ? `about ${Math.round(minutes / 60)} h` : `about ${Math.max(1, Math.round(minutes))} min`;
