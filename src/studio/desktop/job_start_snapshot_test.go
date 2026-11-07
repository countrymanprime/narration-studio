package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestJobStartersSnapshotBeforeTheGoroutine guards the class of #3076: a binding that starts a background job with
// `go h.runX(...)` and then returns a snapshot of the job can report a job that already finished (a fast encode, a
// cached measure) instead of the one it started. Every start function takes its snapshot first. The check reads the
// package's source: a `go` statement that is directly followed by a `return` whose value calls a function or method
// with "snapshot" in its name fails.
func TestJobStartersSnapshotBeforeTheGoroutine(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	fset := token.NewFileSet()
	var found []string
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		source, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		parsed, err := parser.ParseFile(fset, file, source, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(parsed, func(node ast.Node) bool {
			block, ok := node.(*ast.BlockStmt)
			if !ok {
				return true
			}
			for i := 0; i+1 < len(block.List); i++ {
				if _, isGo := block.List[i].(*ast.GoStmt); !isGo {
					continue
				}
				ret, isReturn := block.List[i+1].(*ast.ReturnStmt)
				if isReturn && callsSnapshot(ret) {
					found = append(found, fset.Position(ret.Pos()).String())
				}
			}
			return true
		})
	}
	if len(found) > 0 {
		t.Fatalf("a job start returns a snapshot taken after its goroutine started, so it can report a finished job (#3076); take it before `go`: %v", found)
	}
}

// callsSnapshot reports whether a return statement's values call anything whose name contains "snapshot".
func callsSnapshot(ret *ast.ReturnStmt) bool {
	hit := false
	for _, result := range ret.Results {
		ast.Inspect(result, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			var name string
			switch fn := call.Fun.(type) {
			case *ast.Ident:
				name = fn.Name
			case *ast.SelectorExpr:
				name = fn.Sel.Name
			}
			if strings.Contains(strings.ToLower(name), "snapshot") {
				hit = true
			}
			return true
		})
	}
	return hit
}
