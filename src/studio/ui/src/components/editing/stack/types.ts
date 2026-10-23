import type { StackPassage } from '../model/stacking';

/** A line of the script with the reads the stack works on: the model's passage plus what the dialog and the DAW name it by. */
export interface StackLine extends StackPassage {
  /** The script's words for the line, as the dialog shows it. */
  script: string;
  /** The range `hideTakes` names. */
  firstToken: number;
  lastToken: number;
  /** The take the DAW said it kept, or null. `kept` is true exactly when this is set. */
  keptId: string | null;
  /** Takes already hidden; the clean-up leaves them alone. */
  hidden: readonly string[];
}
