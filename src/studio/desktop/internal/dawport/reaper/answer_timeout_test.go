package reaper

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// generousAnswerWait is how long every adapter built here waits for the fake bridge. The fake answers from a polling goroutine,
// and a loaded Windows runner starved it past the bridge's 3 s default three times (#3395); a test that wants a miss says so with
// its own short SetTimeout.
const generousAnswerWait = time.Minute

func TestMain(m *testing.M) {
	answerTimeout = generousAnswerWait
	os.Exit(m.Run())
}

// shortestFixedWait is the least a test may wait for the fake bridge on a fixed deadline.
const shortestFixedWait = 10 * time.Second

// No test in this package waits for the fake bridge on a short fixed deadline: context.WithTimeout, WithDeadline, time.After,
// time.NewTimer and time.AfterFunc with a constant duration under shortestFixedWait are what failed on loaded runners. Poll
// until a condition holds, or use generousAnswerWait.
func TestNoTestWaitsOnAShortFixedDeadline(t *testing.T) {
	if answerTimeout != generousAnswerWait {
		t.Fatalf("answerTimeout = %v, want %v: adapters built by tests would use the bridge's 3 s default", answerTimeout, generousAnswerWait)
	}
	units := map[string]time.Duration{"Nanosecond": 1, "Microsecond": time.Microsecond, "Millisecond": time.Millisecond, "Second": time.Second, "Minute": time.Minute}
	files, _ := filepath.Glob("*_test.go")
	for _, file := range files {
		fset := token.NewFileSet()
		tree, err := parser.ParseFile(fset, file, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(tree, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok || len(call.Args) == 0 {
				return true
			}
			pkg, ok := sel.X.(*ast.Ident)
			if !ok {
				return true
			}
			var arg ast.Expr
			switch pkg.Name + "." + sel.Sel.Name {
			case "context.WithTimeout", "context.WithDeadline":
				arg = call.Args[len(call.Args)-1]
			case "time.After", "time.NewTimer", "time.AfterFunc", "time.Tick":
				arg = call.Args[0]
			default:
				return true
			}
			if d, ok := constDuration(arg, units); ok && d < shortestFixedWait {
				t.Errorf("%s: %s.%s waits %v; use generousAnswerWait or poll (#3395)", fset.Position(call.Pos()), pkg.Name, sel.Sel.Name, d)
			}
			return true
		})
	}
}

// constDuration reads "N * time.Unit", "time.Unit" and "time.Duration(N) * time.Unit" with a literal N.
func constDuration(e ast.Expr, units map[string]time.Duration) (time.Duration, bool) {
	switch e := e.(type) {
	case *ast.SelectorExpr:
		if x, ok := e.X.(*ast.Ident); ok && x.Name == "time" {
			d, ok := units[e.Sel.Name]
			return d, ok
		}
	case *ast.BinaryExpr:
		if e.Op != token.MUL {
			return 0, false
		}
		if n, ok := literalInt(e.X); ok {
			u, ok := constDuration(e.Y, units)
			return time.Duration(n) * u, ok
		}
		if n, ok := literalInt(e.Y); ok {
			u, ok := constDuration(e.X, units)
			return time.Duration(n) * u, ok
		}
	}
	return 0, false
}

func literalInt(e ast.Expr) (int64, bool) {
	if c, ok := e.(*ast.CallExpr); ok && len(c.Args) == 1 {
		e = c.Args[0]
	}
	lit, ok := e.(*ast.BasicLit)
	if !ok || lit.Kind != token.INT {
		return 0, false
	}
	n, err := strconv.ParseInt(strings.ReplaceAll(lit.Value, "_", ""), 0, 64)
	return n, err == nil
}
