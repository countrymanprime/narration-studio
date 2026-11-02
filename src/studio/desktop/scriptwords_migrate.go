package main

import (
	"fmt"

	"desktop/internal/guide"
	"desktop/internal/hostlog"
	"desktop/internal/manuscript"
	"desktop/internal/persist"
	"desktop/internal/scriptprep"
)

// A word's pronunciation has one home, its Story Bible name (#2595). The Script page used to keep the words the narrator flagged, with
// how each is said, in its own script-prep.json (schema 1). When a project opens, migrateScriptWords moves them: it gives the words to
// the Story Bible (guide.Service.ImportScriptWords), keeps the file as script-prep.v1.json (or script-prep.v1-<n>.json beside an earlier
// cycle's copy, never overwriting one) and rewrites the file as schema 2 with its chapter states. The schema-1 file is untouched until
// that rewrite, so backing it up after the import loses nothing, and a backup that holds the file byte for byte means its words were
// imported: a run cut short before the rewrite only retries the rewrite on the next open, and never imports the words again over
// names the narrator changed in between. The host log gets counts only, never a word.

// migrateScriptWords moves a schema-1 script-prep.json's words into the Story Bible. It reports whether there was anything to move.
func migrateScriptWords(prep *scriptprep.Service, bible *guide.Service) (guide.ScriptWordImport, bool, error) {
	words, err := prep.LegacyWords()
	if err != nil || len(words) == 0 {
		return guide.ScriptWordImport{}, false, err
	}
	done, err := prep.BackedUp()
	if err != nil {
		return guide.ScriptWordImport{}, true, err
	}
	if done {
		// The words in this exact file were imported before (the backup comes after the import): only the rewrite is left. Importing
		// them again would bring an old value back on a name the narrator has changed since.
		return guide.ScriptWordImport{}, true, prep.FinishMigration()
	}
	imported := make([]guide.ScriptWord, 0, len(words))
	for _, word := range words {
		name := word.Word
		if len(word.Flags) > 0 {
			name = word.Flags[0].Quote
		}
		imported = append(imported, guide.ScriptWord{Word: word.Word, Name: name, Say: word.Say, Source: word.Source})
	}
	result, err := bible.ImportScriptWords(imported)
	if err != nil {
		return result, true, err
	}
	if err := prep.Backup(); err != nil {
		return result, true, err
	}
	return result, true, prep.FinishMigration()
}

// migrateScriptWordsOnOpen runs migrateScriptWords for the project configureLocked has just built the services of, over those services.
// A failure is logged and leaves the schema-1 file as it is, so the next open tries again.
func migrateScriptWordsOnOpen(project string, manuscriptService *manuscript.Service, bible *guide.Service, reporter *persist.Reporter, log *hostlog.Log) {
	if project == "" || bible == nil {
		return
	}
	prep := scriptprep.New(scriptprep.Config{Project: project, Manuscript: scriptPrepBook(manuscriptService), Reporter: reporter})
	result, moved, err := migrateScriptWords(prep, bible)
	logScriptWordsMigration(log, result, moved, err)
}

func logScriptWordsMigration(log *hostlog.Log, result guide.ScriptWordImport, moved bool, err error) {
	switch {
	case err != nil:
		_ = log.Report("script_words_migration_failed", fmt.Sprintf("the Script page's words were not moved to the Story Bible and are kept for the next open: %v", err))
	case moved:
		_ = log.Report("script_words_migrated", fmt.Sprintf("filled %d, same %d, alternates %d, notes %d, created %d, locked %d (kept in the script-prep.v1 backup only)",
			result.Filled, result.Same, result.Alternates, result.Notes, result.Created, result.Locked))
	}
}
