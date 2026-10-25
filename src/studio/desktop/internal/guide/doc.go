// Package guide is the host's side of the Story Bible: it reads src/studio/sidecars/manuscript-guide's file (manuscript_guide.json) and
// makes every edit to it itself, and runs the sidecar only for build, cues, pronounce, the pronunciation lookup, candidate and
// render-audio.
//
// A comment that says a function "is manuscript_guide.py X" names the Python it was written to match. For the edits (create, edit,
// rescan, status, merge, unmerge, split, delete, relate, unrelate, the review flags, the speaker colour, the cue correction, the
// narrator's own pronunciation and the type commands) that Python is gone: #2251 deleted it, and the cases it recorded in testdata and
// tests/fixtures/guide-edit are frozen, so the tests that replay them pin the host to what the sidecar did.
package guide
