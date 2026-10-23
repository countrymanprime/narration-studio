// Package guidemutation is a spike, not part of the app: two ways a Story Bible mutation could avoid starting a Python process per
// command, measured against the spawn the app uses today. docs/research/story-bible-mutation-path.md has the question, the
// numbers and the recommendation.
//
//   - Worker drives src/studio/sidecars/manuscript-guide/spikes/serve_worker.py, one warm Python process speaking NDJSON over stdin and stdout.
//   - Edit is the same `edit` command (setLocked is an edit of "locked") written in Go against the real manuscript_guide.json schema.
//
// Every other file is under the "spike" build tag, so the gate neither builds nor runs them and nothing in the app can import them.
// The measurement is in latency_test.go, under the further "spikelatency" tag; how to run it is at its top.
package guidemutation
