import { apiErrorMessage } from '../../api/errorMessage';
import { changedButUnread } from './useChapterLinkActions';

/** What a screen was doing when a link write failed. */
export type LinkFailureKind = 'set' | 'unlink' | 'create' | 'unread';

/**
 * The one sentence for a failed link write, whichever screen made it (#3365). A failure is raised as an error toast with this text, never as a
 * line in the page: `noun` is the project's word for what a chapter links to ("track", or "folder" in a Voice folders project).
 * `unread` is a change that was written and could not be read again, so it is not told as a failure.
 */
export function linkFailureSentence(kind: LinkFailureKind, reason: unknown, noun = 'track'): string {
  if (kind === 'unread') return changedButUnread(reason);
  const what = kind === 'set' ? 'The link could not be made' : kind === 'unlink' ? 'The link could not be removed' : `The ${noun} could not be added`;
  return `${what}: ${apiErrorMessage(reason)}`;
}
