package main

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-studio/shell/internal/dawport"
	"github.com/countrymanprime/narration-studio/shell/internal/dawport/audacity"
	"github.com/countrymanprime/narration-studio/shell/internal/persist"
	"github.com/countrymanprime/narration-studio/shell/internal/settings"
)

// audacityConn is the open project's one Audacity connection. Audacity's scripting pipe serves one client, so every role the
// host takes from the Audacity adapter (navigate, markers, backups, the edits made in steps) and the link state's heartbeat go
// through this one client; a second client would take the pipe from the first. A project switch closes it (closePipe) and the
// next project gets its own.
type audacityConn struct {
	client  *audacitybridge.Client
	adapter *audacity.Adapter
	backups audacityBackups
	closed  *atomic.Bool

	mu sync.Mutex
	// probing is true while a heartbeat probe runs, so a slow Audacity (a dialog holds an answer for the client's whole timeout)
	// never stacks probes.
	// +checklocks:mu
	probing bool
	// +checklocks:mu
	lastProbe time.Time
	// cached is the last link state a probe made.
	// +checklocks:mu
	cached *AudacityLink
	// lastEmitted is the cached state as last sent to the window, without its heard-ago, which moves every second.
	// +checklocks:mu
	lastEmitted string
	// lastSnap is the snapshot last written for this connection, and lastSnapAt when it was looked at: the snapshot is taken at most
	// every snapshotEvery unless a narrator's action forces it.
	// +checklocks:mu
	lastSnap *audacity.Snapshot
	// +checklocks:mu
	lastSnapAt time.Time
}

// newAudacityConn is the connection for the project at project: the pipe client, the adapter whose roles share it, and the backups
// role with its table under project and the narrator's window read from store on each backup. The pipe is opened on the first
// request, never here.
func newAudacityConn(project string, reporter *persist.Reporter, store *settings.Store) *audacityConn {
	return newAudacityConnOver(audacitybridge.New(audacitybridge.PipeTransport(), audacitybridge.Options{}), project, reporter, store)
}

// openAudacityConn is the connection for the project being attached: over the real pipe, or the fake one a test set.
func (h *Host) openAudacityConn(project string, store *settings.Store) *audacityConn {
	if h.audacityPipe != nil {
		return newAudacityConnOver(h.audacityPipe(), project, h.persist, store)
	}
	return newAudacityConn(project, h.persist, store)
}

// newAudacityConnOver is newAudacityConn over client, which a test gives a fake pipe.
func newAudacityConnOver(client *audacitybridge.Client, project string, reporter *persist.Reporter, store *settings.Store) *audacityConn {
	adapter := audacity.NewWithBackups(client, audacity.BackupsConfig{
		Project:       func() string { return project },
		Reporter:      reporter,
		WindowSetting: func() float64 { return backupWindowSeconds(store) },
	})
	closed := &atomic.Bool{}
	return &audacityConn{
		client:  client,
		adapter: adapter,
		backups: audacityBackups{Backups: adapter.Backups(), pipe: client, closed: closed},
		closed:  closed,
	}
}

// close marks the connection replaced and drops the pipe.
func (c *audacityConn) close() { c.backups.closePipe() }

// runtime is what the resolver needs of the connection: there is always a bridge to ask, answering while the last request got a
// complete reply.
func (c *audacityConn) runtime() dawport.Runtime { return c.adapter.Runtime() }
