package main

import (
	"context"
	"time"

	"desktop/internal/comparerun"
	"desktop/internal/guide"
	"desktop/internal/persist"
	"desktop/internal/retention"
)

// The previews and the Transcript Compare files (#3816). Nothing persisted names either: a preview that is gone is rendered again, and
// the diff is read once, right after its run writes it, so what is removed here is derived and costs a render at worst.

// previewRule bounds the rendered TTS previews to 64 MB, the least recently used first (a preview served from the cache moves its file's
// time, guide.Service.render). A preview used within ten minutes is not removed to meet the cap, which keeps a file a render has just
// finished out of the pass. A name that is not a preview's (the sidecar's <name>.<pid>.part file of a render in flight) is not touched.
var previewRule = persist.PruneRule{
	Group:     func(name string) (string, bool) { return name, guide.IsPreviewFile(name) },
	MaxBytes:  64 * megabyte,
	SizeGuard: 10 * time.Minute,
}

// compareRule keeps the newest 20 Transcript Compare runs and drops those older than 7 days (the rule logs/runs has had, now the same
// helper): a run is the diff and the two text files written beside it. Nothing else in the folder is a run's, and
// the narrator's decisions in the folder above it (equivalences.csv, vocab_hints.json) are not in it.
var compareRule = persist.PruneRule{
	Group:      comparerun.RunOfFile,
	KeepGroups: 20,
	MaxAge:     7 * day,
}

// folderRetention is the retention step of one flat folder of the project: persist.PruneFolder by a rule.
type folderRetention struct {
	name    string
	project string
	folder  string
	rule    persist.PruneRule
	now     func() time.Time
}

func (f folderRetention) Name() string { return f.name }

func (f folderRetention) Run(ctx context.Context, stop func() bool) retention.Report {
	now := time.Now
	if f.now != nil {
		now = f.now
	}
	pass, err := persist.PruneFolder(f.project, f.folder, f.rule, now(), func() bool { return (stop != nil && stop()) || (ctx != nil && ctx.Err() != nil) })
	return retention.Report{
		Kind:        f.name,
		BytesBefore: pass.BytesBefore, BytesAfter: pass.BytesAfter,
		FilesBefore: pass.FilesBefore, FilesAfter: pass.FilesAfter,
		Removed: pass.Removed, Stopped: pass.Stopped, Err: err,
	}
}

func previewRetention(project string) folderRetention {
	return folderRetention{name: "tts previews", project: project, folder: guide.PreviewFolder(), rule: previewRule}
}

func compareRetention(project string) folderRetention {
	return folderRetention{name: "transcript compare files", project: project, folder: comparerun.DiffFolder(), rule: compareRule}
}
