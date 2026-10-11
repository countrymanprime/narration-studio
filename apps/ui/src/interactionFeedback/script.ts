// The interaction feedback rows for the Script call sites (see interactionFeedback.catalog.ts for what a row says). The Script slices append their rows.
import { type FeedbackRow, row } from './row';

// prettier-ignore
export const scriptFeedback: Record<string, FeedbackRow> = {
  // Bookmarks (SNB-6a): the journalled commands of studio/commands/bookmarks.ts, called by useBookmarks. No ribbon or editor draws here yet (SN-B62), so the acknowledgment is the one that slice's control gives.
  'src/studio/slots.ts::bookmarksList#1': row('effect', 'file-io', 'na', 'na', 'ui', 'toast', 'na', 'exempt', 'The store\'s bookmarks slot, loaded when a page with bookmarks mounts and again after each bookmark change, undo and window focus: a failed read keeps the last list and the store records it.'),
  'src/studio/commands/bookmarks.ts::bookmarksList#1': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Bookmark here reads the list first, to answer a spot that already has one without journalling; a small file read, and a failure is the host\'s sentence in a toast.'),
  'src/studio/commands/bookmarks.ts::bookmarksAdd#1': row('click', 'file-io', 'none', 'none', 'toast', 'toast', 'na', 'ok', 'Bookmark here: a small file write, one journal entry; the ribbon appears when the list reloads, or the host says why not.'),
  'src/studio/commands/bookmarks.ts::bookmarksUpdate#1': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Saving a label and note: a small file write, one journal entry; a host refusal is its own sentence in a toast and nothing is journalled.'),
  'src/studio/commands/bookmarks.ts::bookmarksRemove#1': row('click', 'file-io', 'none', 'none', 'toast', 'toast', 'na', 'ok', 'Delete: a small file write, one journal entry whose undo adds the spot back.'),
  'src/studio/commands/bookmarks.ts::bookmarksList#2': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Undo of a delete reads the list to refuse a spot that has a bookmark again; a failure is the host\'s sentence.'),
  'src/studio/commands/bookmarks.ts::bookmarksUpdate#2': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Undo of an edit puts the earlier label and note back: a small file write.'),
  'src/studio/commands/bookmarks.ts::bookmarksRemove#2': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Undo of an add removes the bookmark: a small file write.'),
  'src/studio/commands/bookmarks.ts::bookmarksAdd#2': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Undo of a delete adds the spot back: a small file write.'),
  'src/studio/commands/bookmarks.ts::bookmarksUpdate#3': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Undo of a delete restores the label and note on the recreated bookmark: a small file write.'),
};
