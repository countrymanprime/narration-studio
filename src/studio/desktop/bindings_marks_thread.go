package main

import "github.com/countrymanprime/narration-utils/shell/internal/marks"

// A mark's thread: replies after the mark's own text, each by the narrator ("you"), the author or the proofer, with the
// host's time. Each call is one command the UI journals with its inverse: a reply's is deleting the last message, an edit's
// is an edit back, a delete's is MarksRestoreMessage at the same index, and resolve and reopen undo each other
// (docs/reference/script-marks.md).

// MarksReply adds a message to the end of a mark's thread and returns the mark. who is "you", "author" or "proofer"; an empty
// reply is refused.
func (h *Host) MarksReply(id, who, text string) (string, error) {
	return encodeBinding(h.marks().Reply(id, who, text))
}

// MarksEditMessage replaces the text of the thread's message at index and returns the mark.
func (h *Host) MarksEditMessage(id string, index int, text string) (string, error) {
	return encodeBinding(h.marks().EditMessage(id, index, text))
}

// MarksDeleteMessage removes the thread's message at index and returns {mark, message}: the mark as it now is and the
// message removed, for MarksRestoreMessage to put back.
func (h *Host) MarksDeleteMessage(id string, index int) (string, error) {
	return encodeBinding(h.marks().DeleteMessage(id, index))
}

// MarksRestoreMessage puts a deleted message back at index (0 to the thread's length) and returns the mark.
func (h *Host) MarksRestoreMessage(id string, index int, message marks.Message) (string, error) {
	return encodeBinding(h.marks().RestoreMessage(id, index, message))
}

// MarksSetStatus resolves or reopens a question: status is "open" or "resolved", and a mark whose kind does not ask refuses.
func (h *Host) MarksSetStatus(id, status string) (string, error) {
	return encodeBinding(h.marks().SetStatus(id, status))
}
