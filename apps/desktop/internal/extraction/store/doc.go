// Package store is the project's extraction suggestions (ADR 0846): what a source offered for the Story Bible, each with
// the quote that backs it, the status the 75% rule gave it (ADR 0803) and, once the narrator has decided, the decision.
// A rejected suggestion stays in the file as a tombstone, so the same thing is not offered again.
//
// The file is <project>/ManuscriptGuide/suggestions.json, beside the Story Bible, so replacing the manuscript or Clear
// project data removes it with the Story Bible (the manuscript service's resetDerived). It is narrator data, read
// through persist: a corrupt file is kept aside and an empty list starts, a newer version is refused and never
// overwritten.
//
// This package only stores. It does not change the Story Bible: applying a suggestion is a later step, and a decision
// here changes the status and nothing else. It reads no file but its own, runs nothing and opens no connection; every
// quote, note and payload text is data.
package store
