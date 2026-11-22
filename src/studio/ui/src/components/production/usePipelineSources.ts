import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Finding } from '../../api/contracts/findings';
import type { ManuscriptChapter, MeasureFileResult, MeasureJob } from '../../types';
import { usePort } from '../../ports/usePort';
import { useOptionalStoreHandle } from '../../studio/StudioProvider';
import { chapterIdOfPrepId } from '../credits/creditsEntries';
import { fileOf } from '../master/chapterFile';
import { fileVerdict } from '../master/fileVerdict';
import type { NextUpInputs } from './pipeline/nextUpRanking';
import { failingChapter } from './pipeline/nextUpSources';
import type { PipelineSources } from './pipeline/pipelineRows';

type Proof = NonNullable<PipelineSources['proof']>;
type Master = NonNullable<PipelineSources['master']>;
type Prep = NonNullable<PipelineSources['prep']>;

/** The notes of the latest run per chapter: all of them, and the cleared ones (dismissed, which includes waived: docs/guides/using-the-app/proof.md, as `proofProgress` counts). */
function proofByChapter(findings: readonly Finding[]): Proof {
  const byChapter: Record<string, { cleared: number; total: number }> = {};
  for (const finding of findings) {
    const id = finding.manuscript?.chapter_id;
    if (!id || finding.not_in_latest_run) continue;
    const entry = (byChapter[id] ??= { cleared: 0, total: 0 });
    entry.total += 1;
    if (finding.review.status === 'dismissed') entry.cleared += 1;
  }
  return byChapter;
}

/**
 * The delivery review per chapter, from the host's per-file judgement (the one rule Delivery and Master & QC pair a file with its chapter by).
 * The credits files are paired the same way: the chapter list holds the credits. A chapter with no measured file has no entry; a file with no verdict is not mastered and not checked. Several failing checks read as `FAIL`,
 * not one check's name (the mock's QC cell).
 */
export function masterByChapter(chapters: readonly Pick<ManuscriptChapter, 'id' | 'title' | 'index'>[], files: readonly MeasureFileResult[]): Master {
  const byChapter: Record<string, { mastered: boolean; qc: string | null }> = {};
  for (const chapter of chapters) {
    const file = fileOf(chapter, files, chapters);
    if (!file) continue;
    const verdict = fileVerdict(file);
    byChapter[chapter.id] = { mastered: verdict !== 'none', qc: verdict === 'pass' ? 'PASS' : verdict === 'fail' ? 'FAIL' : null };
  }
  return byChapter;
}

/**
 * The Proof and Master cells' sources for the pipeline, read through the ports the Proof and Master & QC pages use. A source the host
 * cannot answer, or that has no reading for a chapter, stays absent so its cell reads "Not measured yet". It reads again when
 * `refreshKey` changes, and the chapter list is read with the measurement under that key (from the store's shared list, which is not read again while it is held), so Master and Next up
 * pair a list and a measurement read for the same book. Prep is the Script page's prep record. `failing` is Next up's first chapter that fails the delivery check, from the same measured files.
 */
const noSubscribe = () => () => undefined;

/** How long a project switch waits for the new project's refresh key before it reads for the same key. */
const SWITCH_WAIT_MS = 400;

export function usePipelineSources(
  active: boolean,
  refreshKey: string,
): Pick<PipelineSources, 'proof' | 'master' | 'prep'> & { failing: NextUpInputs['failing'] } {
  const findings = usePort('findings');
  const measure = usePort('measure');
  const scriptPrep = usePort('scriptPrep');
  const manuscript = usePort('manuscript');
  const store = useOptionalStoreHandle();
  // Each reset of the store is a project switch: what was read before it is the old project's, whatever the refresh key says.
  const generation = useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    () => store?.generation() ?? 0,
    () => 0,
  );
  const held = useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    () => store?.getState().slots.chapters,
    () => undefined,
  );
  const [proofRead, setProofRead] = useState<{ value: Proof | undefined; generation: number }>();
  const [prepRead, setPrepRead] = useState<{ value: Prep | undefined; generation: number }>();
  // The list and the measurement answer together under one tag, and only that pair is shown. The list then follows the store's slot, as Master & QC's does.
  const [pair, setPair] = useState<{ tag: string; chapters: readonly ManuscriptChapter[] | undefined; job: MeasureJob | undefined }>();
  const asked = useRef<{ generation: number; key: string }>(undefined);

  useEffect(() => {
    if (!active) return;
    let live = true;
    const read = () => {
      findings.findingsList({}).then(
        (page) => live && setProofRead({ value: proofByChapter(page.findings), generation }),
        () => live && setProofRead({ value: undefined, generation }),
      );
      scriptPrep.scriptPrepList().then(
        (record) =>
          live &&
          setPrepRead({ value: Object.fromEntries(record.chapters.map((chapter) => [chapterIdOfPrepId(chapter.chapterId), chapter.state])), generation }),
        () => live && setPrepRead({ value: undefined, generation }),
      );
      // A held list is served on a first ask and in a new project (the store was emptied: it reads); a new refresh key in the same project reads it now.
      const previous = asked.current;
      asked.current = { generation, key: refreshKey };
      const readList = async () => {
        if (!store) return manuscript.manuscriptChapters();
        if (previous && previous.generation === generation && previous.key !== refreshKey) await store.load('chapters');
        else await store.ensure('chapters');
        return store.getState().slots.chapters;
      };
      const tag = `${generation}:${refreshKey}`;
      void Promise.all([readList().catch(() => undefined), measure.measureState().catch(() => undefined)]).then(
        ([chapters, job]) => live && setPair({ tag, chapters, job }),
      );
    };
    // A project switch resets the store, and the new project's key follows from the bootstrap a moment later, which reads everything for that key. Reading
    // at the reset too would read it all twice: it waits for the key, and reads on its own only when none comes (a copy of the project has the same key).
    const switched = asked.current !== undefined && asked.current.generation !== generation && asked.current.key === refreshKey;
    const timer = setTimeout(read, switched ? SWITCH_WAIT_MS : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active, refreshKey, generation, store, findings, measure, scriptPrep, manuscript]);

  const proof = proofRead?.generation === generation ? proofRead.value : undefined;
  const prep = prepRead?.generation === generation ? prepRead.value : undefined;
  const current = pair?.tag === `${generation}:${refreshKey}` ? pair : undefined;
  // Once the pair is the current one the list follows the store's slot: a refresh of it (a rename, a recovery after a failed read) re-pairs the cells.
  const chapters = store ? (current ? held : undefined) : current?.chapters;
  const job = current?.job;
  const master = useMemo<Master | undefined>(() => (chapters && job?.files.length ? masterByChapter(chapters, job.files) : undefined), [chapters, job]);
  const failing = useMemo<NextUpInputs['failing']>(() => (chapters && job ? failingChapter(chapters, job.files, job.profile ?? null) : null), [chapters, job]);

  return { proof, master, prep, failing };
}
