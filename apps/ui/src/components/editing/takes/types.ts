import type { TakeEvidence as TakeEvidenceData } from '../../../api/contracts/takeEvidence';

/** One take of a line as the inline view shows it: what the workspace offers, what was measured on it, and what it said. */
export interface LineTake {
  /** The candidate id `workspaceUseTake` takes back. */
  id: string;
  label: string;
  /** What plays in the DAW now. */
  active: boolean;
  usable: boolean;
  /** Why a take that is not usable cannot be heard or chosen. */
  reason?: string;
  sourceFile: string;
  sourceStart: number;
  sourceLength: number;
  /** What the take said, as the transcript has it; the Diff against the script is drawn only when it is known. */
  said?: string;
  evidence?: TakeEvidenceData;
}

/** A line of the script that has takes, with the range `useTake` names. */
export interface LinePassage {
  id: string;
  chapterId: string;
  firstToken: number;
  lastToken: number;
  /** The script's words for the line. */
  script: string;
  takes: LineTake[];
}

/** Whether the DAW can choose a take now, and the DAW's own sentence when it cannot. */
export type TakesGate = { ok: true } | { ok: false; reason: string };
