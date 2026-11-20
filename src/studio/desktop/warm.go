package main

// warmProject fills the open project's read caches in the background, after the app starts or a project is attached and
// before the first page asks: the manuscript's parse, then what the chapter list reads of the recording checks
// (coverage.Service.Warm: the ledger, the saved project, the source identities and the result summaries). The host is
// otherwise idle between being configured and the window's first call. It reads through the same caches the bindings
// use and holds no host lock while it works, so a binding never waits on it for longer than the one computation both
// need; it stops when another project is attached (issue 3806).
func (h *Host) warmProject() {
	svc := h.services()
	if svc.config.projectFolder == "" || svc.manuscript == nil || svc.coverage == nil {
		return
	}
	if _, err := svc.manuscript.Load(); err != nil {
		return // no manuscript yet: nothing is checked
	}
	replaced := func() bool { return h.services().coverage != svc.coverage }
	svc.coverage.Warm(coverageSettings(svc.settings).Alignment, replaced)
}
