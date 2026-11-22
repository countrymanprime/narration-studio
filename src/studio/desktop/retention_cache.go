package main

import (
	"context"
	"errors"
	"time"

	"desktop/internal/coverage"
	"desktop/internal/editing"
	"desktop/internal/evidence"
	"desktop/internal/measure"
	"desktop/internal/passagetakes"
	"desktop/internal/retention"
)

const (
	megabyte = 1 << 20
	day      = 24 * time.Hour
)

// cacheRetentionPolicies bound the analysis cache by what wrote each entry (#3816). An entry whose key is a content hash of an input
// that does not change between sessions has no time limit, only a size cap; an entry that depends on what is in the DAW (an item's
// trim and move) expires after a day unused, a take's range after a week; an entry written before the envelope named its analyzer
// after a month and is taken last. The kinds are taken in the order the issue ranks them by what an entry costs to make again (#3816: peaks, editing scans, take
// evidence, delivery measurements, the recogniser's words last), so a pass cut short has trimmed the cheap kinds first. An analyzer missing from this table keeps every entry, so a newer build's entries survive.
var cacheRetentionPolicies = []evidence.CacheKindPolicy{
	{AnalyzerID: measure.PeaksAnalyzerID, MaxBytes: 64 * megabyte},
	{AnalyzerID: editing.AnalyzerSilence, MaxBytes: 64 * megabyte, MaxAge: day},
	{AnalyzerID: passagetakes.MeasureAnalyzerID, MaxBytes: 8 * megabyte, MaxAge: 7 * day},
	{AnalyzerID: measure.FileAnalyzerID, MaxBytes: 8 * megabyte},
	{AnalyzerID: coverage.WordsAnalyzerID, MaxBytes: 256 * megabyte},
	{AnalyzerID: "", MaxBytes: 256 * megabyte, MaxAge: 30 * day},
}

// cacheRetention is the retention step of the analysis cache: it removes the entries past their kind's time limit, then the least
// recently used over its size cap. Every entry is derived, so one removed too early is measured again; the step never touches the
// ledger, a result or a narrator's file.
type cacheRetention struct {
	cache    *evidence.CacheStore
	policies []evidence.CacheKindPolicy
	now      func() time.Time
}

func (c cacheRetention) Name() string { return "analysis cache" }

func (c cacheRetention) Run(ctx context.Context, stop func() bool) retention.Report {
	if c.cache == nil {
		return retention.Report{Kind: c.Name(), Err: errors.New("no analysis cache was removed: the step has no cache")}
	}
	now := time.Now
	if c.now != nil {
		now = c.now
	}
	pruned, err := c.cache.PruneKinds(c.policies, now(), func() bool { return (stop != nil && stop()) || (ctx != nil && ctx.Err() != nil) })
	return retention.Report{
		Kind:        c.Name(),
		BytesBefore: pruned.BytesBefore, BytesAfter: pruned.BytesAfter,
		FilesBefore: pruned.FilesBefore, FilesAfter: pruned.FilesAfter,
		Removed: pruned.Removed, Stopped: pruned.Stopped, Err: err,
	}
}
