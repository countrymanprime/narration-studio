package findings

import (
	"fmt"
	"strings"
)

// ThreadOp is what one thread entry does to a finding's thread of notes.
type ThreadOp string

// The four thread entries. An add starts a message; an edit replaces its text; a delete hides it and a restore brings
// it back where it was. Each is its own line in the review history, so the Undo of any of them is another line.
const (
	ThreadAdd     ThreadOp = "add"
	ThreadEdit    ThreadOp = "edit"
	ThreadDelete  ThreadOp = "delete"
	ThreadRestore ThreadOp = "restore"
)

// Who wrote a message: the narrator, or a proofer's reply the narrator pasted in.
const (
	ThreadYou     = "you"
	ThreadProofer = "proofer"
)

// ThreadEntry is one line of the append-only thread history (PF-1 part 7, beside the decisions and the type choices of
// ADR 0844). MessageID names the message an edit, delete or restore acts on; an add gets the next id for its finding.
type ThreadEntry struct {
	FindingID string   `json:"finding_id"`
	Op        ThreadOp `json:"op"`
	MessageID string   `json:"message_id,omitempty"`
	Who       string   `json:"who,omitempty"`
	Text      string   `json:"text,omitempty"`
	Timestamp string   `json:"timestamp"`
}

// ThreadMessage is one note on a finding as the page shows it: who wrote it, its text, when it was added and, once
// edited, when it last was.
type ThreadMessage struct {
	ID       string `json:"id"`
	Who      string `json:"who"`
	Text     string `json:"text"`
	At       string `json:"at"`
	EditedAt string `json:"edited_at,omitempty"`
}

type threadState struct {
	message ThreadMessage
	deleted bool
}

// foldThreads replays the thread history into each finding's current messages, in the order they were added. A deleted
// message is kept aside so a restore puts it back in place.
func foldThreads(history []ThreadEntry) map[string][]threadState {
	threads := map[string][]threadState{}
	for _, entry := range history {
		thread := threads[entry.FindingID]
		switch entry.Op {
		case ThreadAdd:
			thread = append(thread, threadState{message: ThreadMessage{ID: entry.MessageID, Who: entry.Who, Text: entry.Text, At: entry.Timestamp}})
		case ThreadEdit, ThreadDelete, ThreadRestore:
			for i := range thread {
				if thread[i].message.ID != entry.MessageID {
					continue
				}
				switch entry.Op {
				case ThreadEdit:
					thread[i].message.Text, thread[i].message.EditedAt = entry.Text, entry.Timestamp
				case ThreadDelete:
					thread[i].deleted = true
				case ThreadRestore:
					thread[i].deleted = false
				}
			}
		}
		threads[entry.FindingID] = thread
	}
	return threads
}

// shown is the thread as the page shows it: the messages not deleted, or nil for a finding with none.
func shown(thread []threadState) []ThreadMessage {
	var out []ThreadMessage
	for _, state := range thread {
		if !state.deleted {
			out = append(out, state.message)
		}
	}
	return out
}

// applyThread puts a finding's current thread on its review state. Call it after applyDecision, which rebuilds the review
// state. Unlike a decision, the thread does not follow the evidence version: a re-check keeps the conversation about the spot.
func applyThread(f Finding, thread []threadState) Finding {
	f.Review.Thread = shown(thread)
	return f
}

// checkThreadEntry refuses an entry that cannot apply to thread, before anything is written, and fills in the id of an add.
func checkThreadEntry(entry *ThreadEntry, thread []threadState) error {
	switch entry.Op {
	case ThreadAdd:
		if entry.Who != ThreadYou && entry.Who != ThreadProofer {
			return fmt.Errorf("a note is written by %q or %q, not %q", ThreadYou, ThreadProofer, entry.Who)
		}
		entry.MessageID = fmt.Sprintf("m%d", len(thread)+1)
	case ThreadEdit, ThreadDelete, ThreadRestore:
		entry.Who = ""
		at := -1
		for i := range thread {
			if thread[i].message.ID == entry.MessageID {
				at = i
			}
		}
		if at < 0 {
			return fmt.Errorf("this finding has no note %q", entry.MessageID)
		}
		if entry.Op == ThreadDelete && thread[at].deleted || entry.Op == ThreadRestore && !thread[at].deleted {
			return fmt.Errorf("note %q is already %sd", entry.MessageID, entry.Op)
		}
	default:
		return fmt.Errorf("thread change %q is not one of add, edit, delete or restore", entry.Op)
	}
	entry.Text = strings.TrimSpace(entry.Text)
	if entry.Op == ThreadAdd || entry.Op == ThreadEdit {
		if entry.Text == "" {
			return fmt.Errorf("a note needs some text")
		}
	} else {
		entry.Text = ""
	}
	return nil
}

// RecordThread appends one change to a finding's thread of notes to the review history and, when a finding with id
// exists, applies it so the change shows at once. It never changes the decision, the type or the counts. found is false
// when no stored finding has id; the entry is still recorded. A refused entry writes nothing.
func (s *Store) RecordThread(id string, entry ThreadEntry, timestamp string) (finding Finding, found bool, err error) {
	if id == "" {
		return Finding{}, false, fmt.Errorf("a finding id is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	current, err := s.readHistory()
	if err != nil {
		return Finding{}, false, err
	}
	entry.FindingID, entry.Timestamp = id, timestamp
	if err := checkThreadEntry(&entry, foldThreads(current.Thread)[id]); err != nil {
		return Finding{}, false, err
	}
	history, err := s.appendHistory(func(h *reviewHistory) { h.Thread = append(h.Thread, entry) })
	if err != nil {
		return Finding{}, false, err
	}
	path, findingsInFile, index, err := s.locate(id)
	if err != nil || path == "" {
		return Finding{}, false, err
	}
	findingsInFile[index] = applyThread(findingsInFile[index], foldThreads(history.Thread)[id])
	if err := writeJSONFile(path, findingsInFile); err != nil {
		return Finding{}, false, err
	}
	return findingsInFile[index], true, nil
}
