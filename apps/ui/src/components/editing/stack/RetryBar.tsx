import type { RetryLevel, RetryMode, RetryModeAnswer } from '../../../api/contracts/editStacks';
import { Button } from '../../primitives/Button';
import { SectionLabel } from '../../primitives/SectionLabel';
import { ToggleGroup } from '../../primitives/ToggleGroup';
import { TooltipTarget } from '../../primitives/Tooltip';
import { RETRY_LABEL, RETRY_SHORT, STACK_TEXT } from './stackText';
import { useRetryMode } from './useRetryMode';

export interface RetryBarProps {
  level: RetryLevel;
  chapterId: string;
  /** The passage, for the passage level; '' otherwise. */
  passageId?: string;
  /** How many retries could be stacked at this level. The count shows only while the mode is stack. */
  count: number;
  /** Why the stack action is off (the DAW cannot, or a take is kept), or undefined when it is on. */
  reason?: string;
  /** Asks to stack. The question comes first; this moves nothing. */
  onStack: () => void;
  /** Called with the host's answer after the choice is stored, so the page counts again. */
  onChange?: (answer: RetryModeAnswer) => void;
  /** The level's name for the group, "chapter" in "How retries are kept in this chapter". */
  scope?: string;
}

const MODES: readonly RetryMode[] = ['stack', 'leave'];

/**
 * How a project, a chapter or a passage keeps its retries (the mock's `RetryBar`): stacked on the first read's spot, or left where they were
 * recorded. Choosing stores the choice through the port and moves no audio. Under stack it shows how many retries can be stacked and the one
 * action that stacks them, behind a question; under leave there is neither. A passage can also follow its chapter.
 */
export function RetryBar({ level, chapterId, passageId = '', count, reason, onStack, onChange, scope = level }: RetryBarProps) {
  const { answer, choose, error } = useRetryMode(level, chapterId, passageId, onChange);
  const mode = answer?.mode;
  const follows = level === 'passage' && answer !== null && answer.set === undefined;
  const options = [
    ...(level === 'passage'
      ? [{ value: 'inherit', label: follows && answer ? `Chapter · ${RETRY_SHORT[answer.mode]}` : 'Chapter', title: 'Follow the chapter' }]
      : []),
    ...MODES.map((m) => ({ value: m, label: RETRY_SHORT[m], title: RETRY_LABEL[m] })),
  ];
  const value = follows ? 'inherit' : (answer?.set ?? mode ?? '');
  return (
    <div className="flex flex-wrap items-center gap-2" data-retry-bar={level}>
      <SectionLabel>{STACK_TEXT.howKept}</SectionLabel>
      <ToggleGroup
        label={`How retries are kept in this ${scope}`}
        look="segmented"
        value={value}
        options={answer ? options : options.map((o) => ({ ...o, disabled: true }))}
        onChange={(v) => void choose(v === 'inherit' ? '' : (v as RetryMode))}
      />
      <span className="flex-1" />
      {mode === 'stack' && count > 0 ? (
        <span className="rounded-full bg-[var(--info-soft)] px-2.5 py-0.5 text-sm" title="Later reads that can go on the first read’s spot" data-stack-count>
          {count} {count === 1 ? 'retry' : 'retries'} can be stacked
        </span>
      ) : null}
      {mode === 'stack' ? (
        reason !== undefined || count === 0 ? (
          <TooltipTarget text={reason ?? 'There are no retries to stack.'}>
            <Button variant="secondary" size="sm" disabled data-stack-all>
              {STACK_TEXT.action}
            </Button>
          </TooltipTarget>
        ) : (
          <Button variant="secondary" size="sm" data-stack-all onClick={onStack}>
            {STACK_TEXT.action}
          </Button>
        )
      ) : null}
      {error ? (
        <span role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </span>
      ) : null}
    </div>
  );
}
