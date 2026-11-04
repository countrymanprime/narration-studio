import { headingName } from '../../chapterHeading';
import { usePageCommands, type PageItem } from '../../input/pageCommands';
import type { ProductionChapter } from '../../api/contracts/production';
import { PIPELINE_AREA } from './useChapterTools';
import { revealRow } from './pipeline/rowWindow';

/**
 * Scrolls the pipeline row of chapter `id` (at `index` in the list) into view and puts focus on its first control, so the chapter chosen in the
 * menu is where the narrator is. A long book draws only the rows near the view: a row not drawn yet is scrolled to by its place, then found a
 * frame later.
 */
function focusPipelineRow(id: string, index: number): void {
  // After the jump menu has closed: it returns focus to what opened it when it closes, and a row already on screen was focused before that,
  // so the focus went back to the project button and the chapter chosen gave no cue (a far one was focused later and kept it).
  requestAnimationFrame(() => requestAnimationFrame(() => reachPipelineRow(id, index, 3)));
}

function reachPipelineRow(id: string, index: number, retries: number): void {
  const body = document.querySelector(`[${PIPELINE_AREA}] tbody`);
  if (!body) return;
  const row = [...body.querySelectorAll<HTMLElement>('tr[data-chapter-id]')].find((tr) => tr.dataset.chapterId === id);
  if (!row) {
    if (retries <= 0) return;
    revealRow(body, index);
    requestAnimationFrame(() => requestAnimationFrame(() => reachPipelineRow(id, index, retries - 1)));
    return;
  }
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
      label: headingName(row),
      group: 'Chapters',
      icon: 'goToChapter',
      run: () => focusPipelineRow(row.id, index),
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
