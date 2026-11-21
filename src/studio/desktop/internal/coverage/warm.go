package coverage

import (
	"sync"
	"sync/atomic"
)

// warmWorkers is how many chapters Warm evaluates at once: the measured gain of a pool flattens there (issue 3806).
const warmWorkers = 4

// Warm fills, ahead of the first page, what a read of every chapter needs: the ledger's decoded records, the saved
// project's parse, each source file's identity and the summary of each checked chapter's result, rebuilding a summary
// that is missing. It goes through the caches the reads use, so a read that arrives meanwhile waits for the same work
// or finds it done, and it changes no answer. It evaluates up to warmWorkers chapters at once and returns early once
// stop reports true (the project was closed). It starts no check. A panic while evaluating a chapter ends the fill and
// is raised from Warm itself once the workers are done.
func (s *Service) Warm(alignment AlignmentParams, stop func() bool) {
	if s.config.Project == "" || alignment.validate() != nil {
		return
	}
	read := s.shared()
	chapters := checkedChapters(read.ledger)
	if len(chapters) == 0 || stop() {
		return
	}
	project, projectFile, err := s.savedProject()
	if err != nil {
		return
	}
	queue := make(chan string)
	var workers sync.WaitGroup
	var failed atomic.Pointer[any] // the first panic of a worker, raised again once every worker is done
	for range min(warmWorkers, len(chapters)) {
		workers.Go(func() {
			// A worker that panics keeps draining, so the sender is never left blocked, and what it hit is raised again
			// below, on the caller's goroutine, where the caller can log it.
			defer func() {
				if failure := recover(); failure != nil {
					failed.CompareAndSwap(nil, &failure)
					for range queue {
					}
				}
			}()
			for chapterID := range queue {
				if stop() {
					continue // drain: the sender must not block on a pool that stopped
				}
				if basis, err := s.basis(read, chapterID); err == nil {
					_, _, _ = s.evaluateSummary(read, project, projectFile, basis, alignment)
				}
			}
		})
	}
	for _, chapterID := range chapters {
		queue <- chapterID
	}
	close(queue)
	workers.Wait()
	if failure := failed.Load(); failure != nil {
		panic(*failure)
	}
}
