// Package extraction is the pure core of Story Bible extraction: the one review threshold, the reasons a suggestion
// needs verification, the evidence check that finds a quote in the manuscript, and the fingerprint that recognises the
// same suggestion offered twice (ADR 0803).
//
// It is a port of the Studio Next mock's extraction code and nothing else. It reads no file, crosses no binding and
// calls no provider: a suggestion store, a schema and an adapter for each source sit on top of it and persist the
// types defined here. Offsets are UTF-16 code units into a paragraph's text, the unit prepmarkup and the UI use, and
// are always computed here from the manuscript, never taken from a provider.
package extraction
