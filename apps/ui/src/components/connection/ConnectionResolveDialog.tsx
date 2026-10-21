import { ChapterLinkDialog, type ChapterLinkDialogProps } from './ChapterLinkDialog';
import { ReaperOffDialog, type ReaperOffDialogProps } from './ReaperOffDialog';

/**
 * The one dialog both connection problems open: `reaper-off` (the DAW is not connected: Start it, or Check again) and `chapter-unlinked` (the
 * chapter has no REAPER track: pick one and link it). Pages draw it from a `useOpenOnce` flag and a `ConnectionIndicator`, never as a banner.
 */
export type ConnectionResolveDialogProps = ({ variant: 'reaper-off' } & ReaperOffDialogProps) | ({ variant: 'chapter-unlinked' } & ChapterLinkDialogProps);

export function ConnectionResolveDialog(props: ConnectionResolveDialogProps) {
  // The `variant` tag only picks the dialog; the props that follow are the dialog's own.
  if (props.variant === 'reaper-off') return <ReaperOffDialog {...props} />;
  return <ChapterLinkDialog {...props} />;
}
