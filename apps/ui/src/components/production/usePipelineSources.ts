import { useEffect, useState } from 'react';
import type { Finding } from '../../api/contracts/findings';
import type { ManuscriptChapter, MeasureFileResult } from '../../types';
import { usePort } from '../../ports/usePort';
import { fileOf } from '../master/chapterFile';
import { fileVerdict } from '../master/fileVerdict';
import { CREDITS_FILE_CHAPTERS } from '../credits/creditsEntries';
import type { PipelineSources } from './pipeline/pipelineRows';

type Proof = NonNullable<PipelineSources['proof']>;
type Master = NonNullable<PipelineSources['master']>;

/** The notes of the latest run per chapter: all of them, and the cleared ones (dismissed, which includes waived: ADR 0793, as `proofProgress` counts). */
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
 * The two credits files are paired the same way. A chapter with no measured file has no entry; a file with no verdict is not mastered and not checked. Several failing checks read as `FAIL`,
 * not one check's name (the mock's QC cell).
 */
function masterByChapter(chapters: readonly Pick<ManuscriptChapter, 'id' | 'title' | 'index'>[], files: readonly MeasureFileResult[]): Master {
  const byChapter: Record<string, { mastered: boolean; qc: string | null }> = {};
  for (const chapter of chapters) {
    const file = fileOf(chapter, files);
    if (!file) continue;
    const verdict = fileVerdict(file);
    byChapter[chapter.id] = { mastered: verdict !== 'none', qc: verdict === 'pass' ? 'PASS' : verdict === 'fail' ? 'FAIL' : null };
  }
  return byChapter;
}

/**
 * The Proof and Master cells' sources for the pipeline, read through the ports the Proof and Master & QC pages use. A source the host
 * cannot answer, or that has no reading for a chapter, stays absent so its cell reads "Not measured yet" (ADR 0015). It reads again when
 * `refreshKey` changes.
 */
export function usePipelineSources(active: boolean, refreshKey: string): Pick<PipelineSources, 'proof' | 'master'> {
  const findings = usePort('findings');
  const measure = usePort('measure');
  const manuscript = usePort('manuscript');
  const [proof, setProof] = useState<Proof>();
  const [master, setMaster] = useState<Master>();

  useEffect(() => {
    if (!active) return;
    let live = true;
    findings.findingsList({}).then(
      (page) => live && setProof(proofByChapter(page.findings)),
      () => live && setProof(undefined),
    );
    Promise.all([measure.measureState(), manuscript.manuscriptChapters()]).then(
      ([job, chapters]) => live && setMaster(job.files.length ? masterByChapter([...chapters, ...CREDITS_FILE_CHAPTERS], job.files) : undefined),
      () => live && setMaster(undefined),
    );
    return () => {
      live = false;
    };
  }, [active, refreshKey, findings, measure, manuscript]);

  return { proof, master };
}
