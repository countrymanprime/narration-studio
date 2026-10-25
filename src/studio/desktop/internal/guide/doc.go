// Package guide is the host's side of the Story Bible: it builds manuscript_guide.json (Build, build.go), makes every edit to it
// itself, runs the Story Bible's rules suggestion source (RuleSuggestions, rules.go) and writes the dialogue cues (RefreshCues, cues.go,
// also right after every build). It runs src/studio/sidecars/manuscript-guide only for model work: a build's language model spans and
// the pronunciations of its names (entities, pronunciation), the pronunciation lookup of a create or an alias edit, pronounce,
// candidate and render-audio. The sidecar writes the file only for pronounce.
//
// A comment that says a function "is manuscript_guide.py X" (or extraction_rules.py X) names the Python it was written to match. For
// the build, the edits (create, edit, rescan, status, merge, unmerge, split, delete, relate, unrelate, the review flags, the speaker
// colour, the cue correction, the narrator's own pronunciation and the type commands), the rules' suggestions and the dialogue cues
// that Python is gone: #2251 deleted it, and the cases it recorded in testdata, tests/fixtures/guide-edit, tests/fixtures/guide-rules,
// tests/fixtures/guide-cues and tests/fixtures/guide-build are frozen, so the tests that replay them pin the host to what the sidecar did.
package guide
