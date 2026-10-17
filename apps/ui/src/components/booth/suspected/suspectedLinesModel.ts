import type { TeleprompterFlagKind, TeleprompterFlagSave } from '../../../api/contracts/teleprompter';

/**
 * A line the live speech check suspects was skipped or read again (Studio Next mock `providers/speech.ts` `liveFlags`). The host raises
 * it, the narrator never does. `script` is the manuscript words it covers and `heard` what the check heard in their place.
 */
export type SuspectedFlag = {
  chapterId: string;
  paragraphId: string;
  kind: TeleprompterFlagKind;
  /** [wordStart, wordEnd) within the paragraph's own word split. */
  wordStart: number;
  wordEnd: number;
  /** The same span in chapter word indices, kept as evidence. */
  scriptStart: number;
  scriptEnd: number;
  script: string;
  heard: string;
};

/**
 * The same suspicion read twice is one line: the key is the chapter, paragraph, kind and words, and which of those it is (`ordinal`).
 * It follows the host's finding id rule (`teleprompterflags.go`), so a dismissed place comes back dismissed.
 */
export const suspectedKey = (flag: SuspectedFlag, ordinal = 0): string =>
  ['f', flag.chapterId, flag.paragraphId, flag.kind, flag.wordStart, flag.wordEnd, ordinal].join(':');

/** The flags that fall in the paragraphs the take read (all of them when none are named), each place once, in the order given. */
export function suspectedLines(flags: readonly SuspectedFlag[], readParagraphIds?: ReadonlySet<string>): SuspectedFlag[] {
  const seen = new Set<string>();
  return flags.filter((flag) => {
    const key = suspectedKey(flag);
    if ((readParagraphIds && !readParagraphIds.has(flag.paragraphId)) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** How many are still open: the side panel's badge. */
export const suspectedCount = (flags: readonly SuspectedFlag[], dismissed: ReadonlySet<string>): number =>
  flags.filter((flag) => !dismissed.has(suspectedKey(flag))).length;

/** The flag in the shape `TeleprompterSaveFlags` keeps (ADR 0117). */
export const toFlagSave = (flag: SuspectedFlag, dismissed: boolean): TeleprompterFlagSave => ({
  kind: flag.kind,
  paragraphId: flag.paragraphId,
  wordStart: flag.wordStart,
  wordEnd: flag.wordEnd,
  scriptStart: flag.scriptStart,
  scriptEnd: flag.scriptEnd,
  heard: flag.heard,
  dismissed,
});

export const KIND_LABELS: Record<TeleprompterFlagKind, string> = {
  skipped: 'Skipped',
  restart: 'Read again',
  misread: 'Misread',
  extra: 'Extra words',
};
