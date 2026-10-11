package marks

import (
	"errors"
	"time"
)

// Authors are who can write in a thread: the narrator, the author or the proofer. The mark's own text is the narrator's opening message
// and is not part of the thread.
var Authors = []string{"you", "author", "proofer"}

// Deleted is what a message delete answers: the mark as it now is, and the message removed, so the caller can put it back
// with RestoreMessage.
type Deleted struct {
	Mark    Resolved `json:"mark"`
	Message Message  `json:"message"`
}

var errNoMessage = errors.New("that message is no longer there")

// Reply adds a message to the end of a mark's thread, stamped with the host's time. Any mark has a thread; its inverse is
// DeleteMessage of the last message.
func (s *Service) Reply(id, who, text string) (Resolved, error) {
	if !contains(Authors, who) {
		return Resolved{}, errors.New("that is not one who can reply")
	}
	text, err := cleanText(text)
	if err != nil {
		return Resolved{}, err
	}
	if text == "" {
		return Resolved{}, errors.New("write the reply or note first")
	}
	at := s.now().UTC().Format(time.RFC3339)
	return s.change(id, func(mark *Mark, _ MarkType) error {
		mark.Thread = append(mark.Thread, Message{Who: who, Text: text, At: at})
		return nil
	})
}

// EditMessage replaces the text of the thread's message at index, keeping who wrote it and when. Its inverse is an edit back
// to the old text.
func (s *Service) EditMessage(id string, index int, text string) (Resolved, error) {
	text, err := cleanText(text)
	if err != nil {
		return Resolved{}, err
	}
	if text == "" {
		return Resolved{}, errors.New("write the message first")
	}
	return s.change(id, func(mark *Mark, _ MarkType) error {
		if index < 0 || index >= len(mark.Thread) {
			return errNoMessage
		}
		mark.Thread[index].Text = text
		return nil
	})
}

// DeleteMessage removes the thread's message at index and answers it with the mark; its inverse is RestoreMessage at the
// same index.
func (s *Service) DeleteMessage(id string, index int) (Deleted, error) {
	var removed Message
	mark, err := s.change(id, func(mark *Mark, _ MarkType) error {
		if index < 0 || index >= len(mark.Thread) {
			return errNoMessage
		}
		removed = mark.Thread[index]
		mark.Thread = append(mark.Thread[:index:index], mark.Thread[index+1:]...)
		return nil
	})
	if err != nil {
		return Deleted{}, err
	}
	return Deleted{Mark: mark, Message: removed}, nil
}

// RestoreMessage puts a deleted message back at index, from 0 to the thread's length: the undo of DeleteMessage. The message
// is checked as a stored one is.
func (s *Service) RestoreMessage(id string, index int, message Message) (Resolved, error) {
	if err := checkMessage(message); err != nil {
		return Resolved{}, err
	}
	return s.change(id, func(mark *Mark, _ MarkType) error {
		if index < 0 || index > len(mark.Thread) {
			return errNoMessage
		}
		thread := make([]Message, 0, len(mark.Thread)+1)
		thread = append(thread, mark.Thread[:index]...)
		thread = append(thread, message)
		mark.Thread = append(thread, mark.Thread[index:]...)
		return nil
	})
}

// SetStatus resolves or reopens a question: status is open or resolved, and only a mark whose type asks has one. Each is the
// other's inverse.
func (s *Service) SetStatus(id, status string) (Resolved, error) {
	if status != StatusOpen && status != StatusResolved {
		return Resolved{}, errors.New("a question is either open or resolved")
	}
	return s.change(id, func(mark *Mark, markType MarkType) error {
		if !markType.Asks {
			return errors.New("only a question can be resolved or reopened; this mark's kind does not ask")
		}
		mark.Status = status
		return nil
	})
}

// change applies edit to one mark under the file's lock and writes the file; a refused edit writes nothing.
func (s *Service) change(id string, edit func(*Mark, MarkType) error) (Resolved, error) {
	if s.config.Project == "" {
		return Resolved{}, errors.New("save the project first")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, _, err := s.read()
	if err != nil {
		return Resolved{}, err
	}
	for index := range file.Marks {
		mark := &file.Marks[index]
		if mark.ID != id {
			continue
		}
		markType, _ := findType(file.Types, mark.Type)
		if mark.Thread == nil {
			mark.Thread = []Message{}
		}
		if err := edit(mark, markType); err != nil {
			return Resolved{}, err
		}
		if err := s.write(file); err != nil {
			return Resolved{}, err
		}
		return resolve(*mark, s.manuscript()), nil
	}
	return Resolved{}, errors.New("that mark is no longer there")
}

// checkMessage reports whether a thread message keeps the rules: a known author, plain text within the cap that is not
// empty or padded, and the host's UTC time.
func checkMessage(message Message) error {
	if !contains(Authors, message.Who) {
		return errors.New("that is not one who can reply")
	}
	if cleaned, err := cleanText(message.Text); err != nil {
		return err
	} else if cleaned == "" || cleaned != message.Text {
		return errors.New("a message needs its text")
	}
	if at, err := time.Parse(time.RFC3339, message.At); err != nil || at.Location() != time.UTC {
		return errors.New("a message needs the time it was written")
	}
	return nil
}
