import type { EditingApi } from '../../../api/contracts/editing';
import type { Finding, FindingsApi } from '../../../api/contracts/findings';

/** Every finding the Clean up tab works on for a chapter: the Proof findings and the editing candidates, one entry for each id. */
export async function readFindings(
  findings: Pick<FindingsApi, 'findingsList'>,
  editing: Pick<EditingApi, 'editingCandidates'>,
  chapterId: string,
): Promise<Finding[]> {
  const [page, candidates] = await Promise.all([findings.findingsList({ chapterId }), editing.editingCandidates(chapterId)]);
  const seen = new Set<string>();
  return [...page.findings, ...candidates].filter((f) => !seen.has(f.id) && !!seen.add(f.id));
}
