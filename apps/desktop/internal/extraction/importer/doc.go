// Package importer reads a Story Bible written outside the app (a spreadsheet or a JSON file made by any tool or LLM)
// and works out what importing it would do. It is the `storybible-import` v1 format of
// docs/architecture/storybible-import-format.md, ported from the Studio Next mock.
//
// The file is untrusted, so the package only ever sees bytes it is handed: it imports no os, io/fs or network
// package (a test checks the imports), refuses a file over the byte, row or field caps before it builds a row, and
// stores every cell as text, never following a formula, path or URL. Review status comes from the extraction package
// (ReasonsOf, AutoStatus, VerifyEvidence, Fingerprint), so the threshold is written in one place.
package importer
