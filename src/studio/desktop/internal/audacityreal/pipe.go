//go:build audacityreal && linux

package audacityreal

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"syscall"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
)

// PipePaths are mod-script-pipe's two FIFOs on Linux: the module creates both in /tmp, named for the user.
func PipePaths() (toSrv, fromSrv string) {
	uid := os.Getuid()
	return fmt.Sprintf("/tmp/audacity_script_pipe.to.%d", uid), fmt.Sprintf("/tmp/audacity_script_pipe.from.%d", uid)
}

// RemoveStalePipes deletes both FIFOs, as a crashed Audacity leaves them behind.
func RemoveStalePipes() {
	to, from := PipePaths()
	_ = os.Remove(to)
	_ = os.Remove(from)
}

// isFIFO is false for a missing path and for a regular file: opening a path that is not a FIFO for writing would create or clobber a
// file, so every open here checks first.
func isFIFO(path string) bool {
	st, err := os.Stat(path)
	return err == nil && st.Mode()&os.ModeNamedPipe != 0
}

// openTo opens the to-Audacity FIFO for writing without blocking. A FIFO that no process has open for reading (a stale one, left by
// a killed Audacity, or one whose server is between clients) refuses with ENXIO at once, where a blocking open waits for a reader
// for ever (docs/research/real-audacity3-ci-integration.md, finding 4: a write-open failed for 133 s).
func openTo(path string) (*os.File, error) {
	// After every client disconnect the server removes and recreates both FIFOs and opens the to-Audacity one for reading again,
	// so a live Audacity refuses with ENXIO for a moment (observed: a dial straight after another client closed). A stale FIFO
	// refuses for ever, so ENXIO is retried for ReopenGrace and only then called unreachable.
	deadline := time.Now().Add(ReopenGrace)
	for {
		if !isFIFO(path) {
			if time.Now().After(deadline) {
				return nil, audacitybridge.ErrNotReachable
			}
			time.Sleep(20 * time.Millisecond)
			continue
		}
		fd, err := syscall.Open(path, syscall.O_WRONLY|syscall.O_NONBLOCK|syscall.O_CLOEXEC, 0)
		if err == nil {
			return os.NewFile(uintptr(fd), path), nil
		}
		if !errors.Is(err, syscall.ENXIO) && !errors.Is(err, syscall.ENOENT) {
			return nil, err
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("%w: no reader on %s (ENXIO for %v)", audacitybridge.ErrNotReachable, path, ReopenGrace)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// ReopenGrace is how long a dial keeps retrying a FIFO with no reader before it calls Audacity unreachable.
var ReopenGrace = 1200 * time.Millisecond

// openFrom opens the from-Audacity FIFO for reading. It must be a goroutine with a deadline: Audacity's server opens it for writing
// only after it has seen a reader, and a non-blocking read open always succeeds, so this one is opened non-blocking and read with
// the file's own deadline support.
func openFrom(path string) (*os.File, error) {
	deadline := time.Now().Add(ReopenGrace)
	for {
		if isFIFO(path) {
			fd, err := syscall.Open(path, syscall.O_RDONLY|syscall.O_NONBLOCK|syscall.O_CLOEXEC, 0)
			if err == nil {
				return os.NewFile(uintptr(fd), path), nil
			}
			if !errors.Is(err, syscall.ENOENT) {
				return nil, err
			}
		}
		// The server recreates both FIFOs after every client; the from one can be missing for a moment after the to one is back.
		if time.Now().After(deadline) {
			return nil, audacitybridge.ErrNotReachable
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// FIFOTransport is the audacitybridge.Transport the Linux tests use (the shipped transport is Windows-only; see the CI note,
// finding 3). It dials with a deadline: a missing or stale FIFO is ErrNotReachable at once, never a hang.
func FIFOTransport() audacitybridge.Transport {
	to, from := PipePaths()
	return audacitybridge.TransportFunc(func(ctx context.Context) (audacitybridge.Conn, error) {
		w, err := openTo(to)
		if err != nil {
			return nil, err
		}
		r, err := openFrom(from)
		if err != nil {
			_ = w.Close()
			return nil, err
		}
		return fifoConn{r: r, w: w}, nil
	})
}

type fifoConn struct{ r, w *os.File }

func (c fifoConn) Read(p []byte) (int, error) {
	// A non-blocking FIFO read returns EAGAIN until Audacity writes; poll with a short sleep. The Client closes the conn on timeout,
	// which fails the next read, so this never outlives a request.
	for {
		n, err := c.r.Read(p)
		if n > 0 || (err != nil && !errors.Is(err, syscall.EAGAIN)) {
			if errors.Is(err, io.EOF) && n == 0 {
				// EOF on a non-blocking FIFO means no writer right now (Audacity has not opened it, or has just closed it).
				time.Sleep(5 * time.Millisecond)
				continue
			}
			return n, err
		}
		time.Sleep(2 * time.Millisecond)
	}
}
func (c fifoConn) Write(p []byte) (int, error) { return c.w.Write(p) }
func (c fifoConn) Close() error                { return errors.Join(c.r.Close(), c.w.Close()) }

// NewClient is the repository's own client over the FIFOs, with the Linux line end and a 20 s timeout (the shipped 5 s is for the
// narrator; a CI machine is slower and a test that wants 5 s passes its own).
func NewClient(timeout time.Duration) *audacitybridge.Client {
	if timeout <= 0 {
		timeout = 20 * time.Second
	}
	return audacitybridge.New(FIFOTransport(), audacitybridge.Options{LineEnd: "\n", Timeout: timeout})
}

// Pipe is a raw conversation over the FIFOs, for the tests that need the exact reply bytes and not the client's reading of them.
type Pipe struct{ w, r *os.File }

// DialPipe opens both FIFOs. ErrNotReachable when a FIFO is missing, stale or not a FIFO.
func DialPipe() (*Pipe, error) {
	to, from := PipePaths()
	w, err := openTo(to)
	if err != nil {
		return nil, err
	}
	r, err := openFrom(from)
	if err != nil {
		_ = w.Close()
		return nil, err
	}
	return &Pipe{w: w, r: r}, nil
}

// Close closes both ends.
func (p *Pipe) Close() { _ = p.w.Close(); _ = p.r.Close() }

// Exchange is one command's outcome as the wire showed it.
type Exchange struct {
	Command  string        // what was sent, without the line end
	Raw      []byte        // every byte read back, up to the end of the reply or the deadline
	Took     time.Duration // from the write to the last byte
	Complete bool          // the reply ended with the terminator (or was a lone blank line); false means the deadline passed
	Blank    bool          // the whole reply was a lone line feed: Audacity has no project window
	OK       bool          // the terminator said OK
	Failed   bool          // the terminator said Failed!
}

var (
	termOK     = []byte("BatchCommand finished: OK\n\n")
	termFailed = []byte("BatchCommand finished: Failed!\n\n")
)

// Send writes one command and reads until the terminator, a lone blank line followed by quiet, or the deadline.
func (p *Pipe) Send(timeout time.Duration, command string) Exchange {
	start := time.Now()
	ex := Exchange{Command: command}
	if _, err := p.w.Write([]byte(command + "\n")); err != nil {
		ex.Took = time.Since(start)
		return ex
	}
	deadline := start.Add(timeout)
	buf := make([]byte, 64<<10)
	lastData := time.Now()
	for time.Now().Before(deadline) {
		_ = p.r.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
		n, err := p.r.Read(buf)
		if n > 0 {
			ex.Raw = append(ex.Raw, buf[:n]...)
			lastData = time.Now()
			switch {
			case bytes.HasSuffix(ex.Raw, termOK):
				ex.Complete, ex.OK = true, true
			case bytes.HasSuffix(ex.Raw, termFailed):
				ex.Complete, ex.Failed = true, true
			}
			if ex.Complete {
				break
			}
		}
		if ex.Complete {
			break
		}
		if err != nil && !errors.Is(err, syscall.EAGAIN) && !errors.Is(err, io.EOF) && !errors.Is(err, os.ErrDeadlineExceeded) {
			break
		}
		// A lone line feed is "no project open": nothing follows it, so quiet for a moment ends that reply.
		if bytes.Equal(ex.Raw, []byte("\n")) && time.Since(lastData) > 400*time.Millisecond {
			ex.Complete, ex.Blank = true, true
			break
		}
		time.Sleep(2 * time.Millisecond)
	}
	ex.Took = time.Since(start)
	return ex
}

// Body is the reply without its terminator and the blank line Audacity writes first.
func (e Exchange) Body() string {
	b := bytes.TrimSuffix(bytes.TrimSuffix(e.Raw, termOK), termFailed)
	return string(bytes.TrimPrefix(b, []byte("\n")))
}
