package main

import (
	"fmt"
	"strings"

	"desktop/internal/guide"
	"desktop/internal/hostlog"
	"desktop/internal/manuscript"
	"desktop/internal/persist"
	"desktop/internal/scriptprep"
	"desktop/internal/userdictionary"
)

// The Script page used to keep the words the narrator flagged, with how each is said, in its own script-prep.json (schema 1). A word's
// pronunciation now comes from dictionary sources, the project's user dictionary among them, and a Story Bible name keeps the one the
// narrator picked (#2595). When a project opens, migrateScriptWords moves the old values: each word with a value goes to the user
// dictionary as a "Script (imported)" record (userdictionary.Import), and fills the Story Bible name that has it when that name has no
// pronunciation and its entry is not locked (guide.Service.ImportScriptWords); a word with no value has nothing to keep and is dropped.
// No Story Bible entry is ever made. Then it keeps the file as script-prep.v1.json (or script-prep.v1-<n>.json beside an earlier
// cycle's copy, never overwriting one) and rewrites the file as schema 2 with its chapter states. The schema-1 file is untouched until
// that rewrite, so backing it up after the import loses nothing, and a backup that holds the file byte for byte means its words were
// imported: a run cut short before the rewrite only retries the rewrite on the next open, and never imports the words again over
// values the narrator changed in between. A run cut short before the backup imports again, which adds nothing: the dictionary keeps
// one record per value and a filled name has a value. The host log gets counts only, never a word.

// scriptWordsMigration counts what a migration did.
type scriptWordsMigration struct {
	guide.ScriptWordImport
	// Recorded is the Script values added to the user dictionary.
	Recorded int
	// Dropped is words that had no value.
	Dropped int
}

// migrateScriptWords moves a schema-1 script-prep.json's words. It reports whether there was anything to move.
func migrateScriptWords(prep *scriptprep.Service, bible *guide.Service, dictionary *userdictionary.Service) (scriptWordsMigration, bool, error) {
	var result scriptWordsMigration
	words, err := prep.LegacyWords()
	if err != nil || len(words) == 0 {
		return result, false, err
	}
	done, err := prep.BackedUp()
	if err != nil {
		return result, true, err
	}
	if done {
		// The words in this exact file were imported before (the backup comes after the import): only the rewrite is left. Importing
		// them again would bring back a value the narrator has removed or changed since.
		return result, true, prep.FinishMigration()
	}
	imported := make([]guide.ScriptWord, 0, len(words))
	for _, word := range words {
		say := strings.TrimSpace(word.Say)
		if say == "" {
			result.Dropped++
			continue
		}
		spelling := word.Word
		if len(word.Flags) > 0 {
			spelling = word.Flags[0].Quote
		}
		added, err := dictionary.Import(spelling, say)
		if err != nil {
			return result, true, err
		}
		if added {
			result.Recorded++
		}
		imported = append(imported, guide.ScriptWord{Word: spelling, Say: say})
	}
	result.ScriptWordImport, err = bible.ImportScriptWords(imported)
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
	dictionary := userdictionary.New(userdictionary.Config{Project: project, Reporter: reporter})
	result, moved, err := migrateScriptWords(prep, bible, dictionary)
	logScriptWordsMigration(log, result, moved, err)
}

func logScriptWordsMigration(log *hostlog.Log, result scriptWordsMigration, moved bool, err error) {
	switch {
	case err != nil:
		_ = log.Report("script_words_migration_failed", fmt.Sprintf("the Script page's words were not moved to the user dictionary and are kept for the next open: %v", err))
	case moved:
		_ = log.Report("script_words_migrated", fmt.Sprintf("recorded %d in the user dictionary, filled %d names, kept %d, locked %d, unmatched %d, dropped %d without a value",
			result.Recorded, result.Filled, result.Kept, result.Locked, result.Unmatched, result.Dropped))
	}
}
