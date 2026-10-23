//go:build spike

package guidemutation

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"sync"
)

// Worker is the host side of serve_worker.py: one warm Python process, started on the first call and started again on the next call
// after it exited (idle, crashed or killed). Calls are answered in order, one at a time, the way the guide file's single writer needs.
//
// A real one would start through process.Supervisor so the process joins the Windows job object and dies with the app, and would pass
// the run id the supervisor puts in the environment; the spike starts it with exec directly.
type Worker struct {
	program string
	args    []string

	mu sync.Mutex
	// +checklocks:mu
	cmd *exec.Cmd
	// +checklocks:mu
	stdin io.WriteCloser
	// +checklocks:mu
	stdout *bufio.Reader
	// +checklocks:mu
	next int
	// +checklocks:mu
	starts int
}

// Result is what one command produced: the exit code and both streams, the same as process.Supervisor.Run returns for a spawn.
type Result struct {
	Code   int    `json:"code"`
	Stdout string `json:"stdout"`
	Stderr string `json:"stderr"`
}

// NewWorker returns a worker for program args... (python and the script, or a frozen worker executable). Nothing starts until Run.
func NewWorker(program string, args ...string) *Worker {
	return &Worker{program: program, args: args}
}

// Run sends one sidecar command line (the argv guide.Service.Run builds) and returns its result. A worker that is not running is
// started; one that died between calls is started again and the command sent once more, so an idle exit costs a start, never a
// failed call. A worker that dies during a command is not retried: the command may have written the file.
func (w *Worker) Run(argv ...string) (Result, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.cmd == nil {
		if err := w.start(); err != nil {
			return Result{}, err
		}
	}
	result, sent, err := w.send(argv)
	if err != nil && !sent {
		w.stop()
		if err := w.start(); err != nil {
			return Result{}, err
		}
		result, _, err = w.send(argv)
	}
	if err != nil {
		w.stop()
	}
	return result, err
}

// Starts is how many processes the worker has started, for the tests and the measurement.
func (w *Worker) Starts() int {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.starts
}

// Close ends the worker: its stdin closes and it exits.
func (w *Worker) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.stop()
	return nil
}

// +checklocks:w.mu
func (w *Worker) start() error {
	cmd := exec.Command(w.program, w.args...) //nolint:gosec // the caller names the worker executable, as guide.Service names the sidecar
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("could not start the worker: %w", err)
	}
	w.cmd, w.stdin, w.stdout = cmd, stdin, bufio.NewReader(stdout)
	w.starts++
	return nil
}

// +checklocks:w.mu
func (w *Worker) stop() {
	if w.cmd == nil {
		return
	}
	_ = w.stdin.Close()
	_ = w.cmd.Process.Kill()
	_ = w.cmd.Wait()
	w.cmd, w.stdin, w.stdout = nil, nil, nil
}

// send writes one request and reads its response. sent is false when the request never reached a live worker (the write failed, or
// the worker had already closed its stdout), which is the only case Run retries.
//
// +checklocks:w.mu
func (w *Worker) send(argv []string) (result Result, sent bool, err error) {
	w.next++
	request, err := json.Marshal(map[string]any{"id": w.next, "argv": argv})
	if err != nil {
		return Result{}, false, err
	}
	if _, err := w.stdin.Write(append(request, '\n')); err != nil {
		return Result{}, false, err
	}
	line, err := w.stdout.ReadBytes('\n')
	if errors.Is(err, io.EOF) && len(line) == 0 {
		// An idle exit races the write: the request was accepted by the pipe but nobody read it.
		return Result{}, false, err
	}
	if err != nil {
		return Result{}, true, err
	}
	var response struct {
		ID int `json:"id"`
		Result
	}
	if err := json.Unmarshal(line, &response); err != nil {
		return Result{}, true, fmt.Errorf("the worker's answer could not be read: %w", err)
	}
	if response.ID != w.next {
		return Result{}, true, fmt.Errorf("the worker answered request %d, not %d", response.ID, w.next)
	}
	return response.Result, true, nil
}
