package main

// WindowCloseGuard tells the host whether the page holds a draft that closing the window would drop (the page's `pageHolds`): while it does, a
// close of the window is cancelled and put to the page as `window:close-requested` instead of going through (windowclose.go, #3526).
func (h *Host) WindowCloseGuard(held bool) (string, error) {
	if h.windowClose != nil {
		h.windowClose.arm(held)
	}
	return encodeBinding(nil, nil)
}

// WindowCloseAsked is the page saying it received `window:close-requested` and is asking the narrator: the host then waits for the narrator's
// answer instead of closing the window on its own after a few seconds.
func (h *Host) WindowCloseAsked() (string, error) {
	if h.windowClose != nil {
		h.windowClose.asked()
	}
	return encodeBinding(nil, nil)
}

// WindowCloseAnswer is the narrator's answer to the close question: true closes the window now (they saved, or chose Discard & continue), false
// keeps it open.
func (h *Host) WindowCloseAnswer(closeWindow bool) (string, error) {
	if h.windowClose != nil {
		h.windowClose.answer(closeWindow)
	}
	return encodeBinding(nil, nil)
}
