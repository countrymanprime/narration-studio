package main

import "github.com/countrymanprime/narration-utils/shell/internal/editlog"

// The stack record and the retry choice (ADR 0858), kept in <project>/narration-utils/editing/stacks.json apart from the
// passage list. A stack is the host's memory of the takes the DAW stacked on a passage's first read and where each began
// before, in seconds after the first read's start, so un-stacking can put it back after a restart. It is recorded only after
// the DAW accepted stackTakes and forgotten after unstackTakes; recording or removing one changes nothing in the DAW. The
// retry mode (stack or leave) is set for the project, a chapter or a passage, and decides only what the page offers. The
// bindings take ids (the passage and take ids the Takes panel offers), numbers and plain text, never a GUID to act on or a
// path.

// EditingStacksList returns a chapter's stacks by passage id.
func (h *Host) EditingStacksList(chapterID string) (string, error) {
	return encodeBinding(h.editLog().StacksList(chapterID))
}

// EditingStackRecord stores the takes the DAW stacked on a passage's first read, after it accepted stackTakes. It is refused,
// with nothing saved, when the first read or a moved take is not among the passage's takes, an offset is negative or not
// finite, there is no move, a take is already stacked on the passage, or the DAW's result is missing (its undo steps, and for a
// steps DAW its steps and the backup taken first).
func (h *Host) EditingStackRecord(chapterID string, stack editlog.StackRecordRequest) (string, error) {
	return encodeBinding(h.editLog().StackRecord(chapterID, stack))
}

// EditingStackRemove forgets a passage's stacked takes once the DAW put them back (unstackTakes), or when the journal undoes
// the stack: some of them for a partial un-stack, and the stack goes with its last take.
func (h *Host) EditingStackRemove(chapterID, passageID string, takeIDs []string) (string, error) {
	return encodeBinding(h.editLog().StackRemove(chapterID, passageID, takeIDs))
}

// EditingRetryModeGet answers how retries are kept at a level ("project", "chapter" or "passage"): the passage's own mode,
// else its chapter's, else the project's, else leave.
func (h *Host) EditingRetryModeGet(level, chapterID, passageID string) (string, error) {
	return encodeBinding(h.editLog().RetryModeGet(level, chapterID, passageID))
}

// EditingRetryModeSet sets how retries are kept at a level ("stack" or "leave"), or with an empty mode takes it back so the
// level follows the one above.
func (h *Host) EditingRetryModeSet(level, chapterID, passageID, mode string) (string, error) {
	return encodeBinding(h.editLog().RetryModeSet(level, chapterID, passageID, editlog.RetryMode(mode)))
}
