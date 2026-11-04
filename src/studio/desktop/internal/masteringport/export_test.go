package masteringport

import "time"

// SetRenderChainWait shortens how long a DAW master waits for the chain it reads before rendering, for a test; it returns the restore.
func SetRenderChainWait(wait time.Duration) (restore func()) {
	previous := renderChainWait
	renderChainWait = wait
	return func() { renderChainWait = previous }
}
