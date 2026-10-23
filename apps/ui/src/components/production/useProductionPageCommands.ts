import { chapterName } from '../../chapterName';
import { usePageCommands, type PageItem } from '../../input/pageCommands';
import type { ProductionChapter } from '../../api/contracts/production';
import { PIPELINE_AREA } from './useChapterTools';

/** Scrolls the pipeline row at `index` into view and puts focus on its first control, so the chapter chosen in the menu is where the narrator is. */
function focusPipelineRow(index: number): void {
  const row = document.querySelectorAll<HTMLElement>(`[${PIPELINE_AREA}] tbody tr`)[index];
  if (!row) return;
  row.scrollIntoView({ block: 'center' });
  row.querySelector<HTMLElement>('button')?.focus();
}

type Gate = { run: () => void; disabledReason?: string };

/**
 * What the jump menu lists while Production is showing: the pipeline's chapters (choosing one stays on the page, so they replace the global
 * "Go to <chapter>" rows), the checks and the header's actions. With no manuscript the page is the import, so that is all it offers: Replace
 * manuscript lives in Settings alone (ML-5).
 */
export function useProductionPageCommands(page: {
  found: boolean;
  /** The pipeline's rows in the order drawn, credits rows included. */
  rows: readonly ProductionChapter[];
  ready: boolean;
  /** The recording check: the chapters it would open with, and why it cannot start. */
  check: { chapterIds: readonly string[]; unavailable?: string; open: (chapterIds: string[]) => void };
  stages: { reading: boolean; refresh: () => void };
  report: () => void;
  session: Gate;
  timer: { running: boolean; stopping: boolean; stop: () => void };
  importing: { open: () => void; busy: boolean };
}): void {
  usePageCommands({ id: 'production', label: 'Production', supersedes: ['Chapters'] }, () => {
    if (!page.found) {
      return [
        {
          id: 'action.import',
          label: 'Import manuscript',
          group: 'Actions',
          icon: 'import',
          disabledReason: page.importing.busy ? 'A manuscript import is already open.' : undefined,
          run: page.importing.open,
        },
      ];
    }
    const items: PageItem[] = page.rows.map((row, index) => ({
      id: `chapter.${row.id}`,
      label: chapterName(row, 'full'),
      group: 'Chapters',
      icon: 'goToChapter',
      run: () => focusPipelineRow(index),
    }));

    const checkReason =
      page.check.unavailable ??
      (!page.ready ? 'Still reading the chapters.' : page.check.chapterIds.length === 0 ? 'Every chapter is checked as of the last save' : undefined);
    const loading = !page.ready ? 'Still reading the production figures.' : undefined;
    items.push(
      {
        id: 'check.recordings',
        label: 'Check recordings',
        group: 'Checks',
        hint: page.check.chapterIds.length > 0 ? `${page.check.chapterIds.length} to check` : undefined,
        icon: 'checkRecordings',
        disabledReason: checkReason,
        run: () => page.check.open([...page.check.chapterIds]),
      },
      {
        id: 'check.stages',
        label: 'Read the stage suggestions again',
        group: 'Checks',
        icon: 'retry',
        disabledReason: page.stages.reading ? 'The suggestions are being read now.' : undefined,
        run: page.stages.refresh,
      },
      { id: 'action.export', label: 'Export status report', group: 'Actions', icon: 'export', disabledReason: loading, run: page.report },
      { id: 'action.session', label: 'Start session', group: 'Actions', icon: 'record', disabledReason: page.session.disabledReason, run: page.session.run },
      {
        id: 'action.timer',
        label: 'Stop timer',
        group: 'Actions',
        icon: 'stop',
        disabledReason: !page.timer.running ? 'No stage timer is running.' : page.timer.stopping ? 'The timer is stopping.' : undefined,
        run: page.timer.stop,
      },
    );
    return items;
  });
}
