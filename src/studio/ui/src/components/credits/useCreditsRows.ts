import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../api/errorMessage';
import type { CreditsRenderResult } from '../../api/contracts/credits';
import type { SystemApi } from '../../api/contracts/system';
import { usePort } from '../../ports/usePort';
import type { ChapterStatus, CreditTemplate, RecordedUnavailable } from '../../types';
import { estimateCreditsSeconds, roomToneSeconds } from '../../state';

// The one template of a kind: the first in the library.
const firstOfKind = (templates: CreditTemplate[], kind: string) => templates.find((template) => template.kind === kind);

// The room tone setting (General > "Room tone per credits file"): a secondary
// read, 0 when it cannot be read.
async function readRoomTone(system: SystemApi): Promise<number> {
  try {
    const settings = await system.settingsForScope('global');
    return roomToneSeconds(settings.General?.find((field) => field.key === 'credits_room_tone_seconds')?.effectiveValue);
  } catch {
    return 0;
  }
}

export type CreditsKind = 'opening' | 'closing';

export type CreditsRow = {
  kind: CreditsKind;
  template?: CreditTemplate;
  words?: number;
  estimatedSeconds?: number;
  unresolved: string[];
  /** The template rendered: its text and the [Tokens] still to fill in. */
  preview?: CreditsRenderResult;
  status: ChapterStatus;
  /** The row's confirmed track's recorded audio in the saved project, in seconds: the same never-an-estimate measurement a manuscript chapter's own Recorded column shows. */
  recordedSeconds?: number;
  /** Set instead of `recordedSeconds` when the row has none, saying why. */
  recordedUnavailable?: RecordedUnavailable;
};

/**
 * The Production board's Opening/Closing credits rows. Reads the first template of each kind, each rendered
 * with its own room tone and status from the project manifest. `template` is undefined when the library
 * has none of that kind (the page draws no row for it). Undefined while loading or on any failure: a
 * credits problem leaves the rows out rather than toasting.
 *
 * `setStatus` calls the host's `setCreditsStatus` (never `manuscriptSetChapterStatus`, and it never touches stage
 * suggestions - credits are not assessed by the stage engine) and updates the row in place on success.
 */
export function useCreditsRows(
  refreshKey: string | undefined,
  onError: (error: unknown) => void,
): {
  rows?: Record<CreditsKind, CreditsRow>;
  /** Why the rows could not be read, when they could not; a page that must not guess without them (Delivery) says so. */
  failure?: string;
  setStatus: (kind: CreditsKind, status: ChapterStatus) => Promise<void>;
} {
  const credits = usePort('credits');
  const system = usePort('system');
  const [rows, setRows] = useState<Record<CreditsKind, CreditsRow>>();
  const [failure, setFailure] = useState<string>();
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [templates, statuses, roomTone, recordedLengths] = await Promise.all([
          credits.creditsTemplates(),
          credits.creditsStatuses(),
          readRoomTone(system),
          credits.creditsRecordedLengths(),
        ]);
        const build = async (kind: CreditsKind): Promise<CreditsRow> => {
          const status = (statuses[kind] as ChapterStatus | undefined) ?? 'not_started';
          const recorded = recordedLengths[kind];
          const template = firstOfKind(templates, kind);
          if (!template) return { kind, unresolved: [], status, ...recorded };
          const preview = await credits.creditsPreview(template.body);
          return {
            kind,
            template,
            words: preview.words,
            estimatedSeconds: estimateCreditsSeconds([preview.words], roomTone),
            unresolved: preview.unresolved,
            preview,
            status,
            ...recorded,
          };
        };
        const [opening, closing] = await Promise.all([build('opening'), build('closing')]);
        if (active) {
          setRows({ opening, closing });
          setFailure(undefined);
        }
      } catch (error) {
        if (active) {
          setRows(undefined);
          setFailure(apiErrorMessage(error));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [credits, system, refreshKey]);
  const setStatus = async (kind: CreditsKind, status: ChapterStatus) => {
    try {
      await credits.setCreditsStatus(kind, status);
      setRows((current) => (current ? { ...current, [kind]: { ...current[kind], status } } : current));
    } catch (error) {
      onError(error);
    }
  };
  return { rows, failure, setStatus };
}
