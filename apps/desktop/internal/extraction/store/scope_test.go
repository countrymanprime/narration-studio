package store

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// goFiles are the package's non-test sources.
func goFiles(t *testing.T) []string {
	t.Helper()
	files, err := filepath.Glob("*.go")
	if err != nil || len(files) == 0 {
		t.Fatalf("no sources: %v", err)
	}
	var out []string
	for _, f := range files {
		if !strings.HasSuffix(f, "_test.go") {
			out = append(out, f)
		}
	}
	return out
}

func TestNoPathOrCodeIsFollowed(t *testing.T) {
	banned := map[string]bool{"os/exec": true, "net": true, "net/http": true, "net/url": true, "plugin": true, "syscall": true, "html/template": true, "text/template": true}
	// The only os calls: make the folder, write the temporary file, rename it into place.
	allowed := map[string]bool{"MkdirAll": true, "WriteFile": true, "Rename": true}
	banPath := map[string]bool{"Glob": true, "Walk": true, "WalkDir": true}
	for _, name := range goFiles(t) {
		file, err := parser.ParseFile(token.NewFileSet(), name, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		for _, imp := range file.Imports {
			path, _ := strconv.Unquote(imp.Path.Value)
			if banned[path] {
				t.Errorf("%s imports %s", name, path)
			}
		}
		ast.Inspect(file, func(n ast.Node) bool {
			sel, ok := n.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			if pkg, ok := sel.X.(*ast.Ident); ok {
				if pkg.Name == "os" && !allowed[sel.Sel.Name] {
					t.Errorf("%s calls os.%s", name, sel.Sel.Name)
				}
				if pkg.Name == "filepath" && banPath[sel.Sel.Name] {
					t.Errorf("%s calls filepath.%s", name, sel.Sel.Name)
				}
			}
			return true
		})
	}
}

func TestFileIsUnderTheDirectoryReplaceRemoves(t *testing.T) {
	project := filepath.Join("some", "project")
	if got, want := File(project), filepath.Join(project, "ManuscriptGuide", "suggestions.json"); got != want {
		t.Fatalf("File = %s, want %s", got, want)
	}
	// Read-only: the manuscript service's reset removes the whole ManuscriptGuide folder, so nothing is added to it here.
	source, err := os.ReadFile(filepath.Join("..", "..", "manuscript", "service.go"))
	if err != nil {
		t.Fatal(err)
	}
	file, err := parser.ParseFile(token.NewFileSet(), "service.go", source, 0)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Name.Name != "resetDerived" {
			continue
		}
		ast.Inspect(fn, func(n ast.Node) bool {
			if lit, ok := n.(*ast.BasicLit); ok && lit.Value == `"ManuscriptGuide"` {
				found = true
			}
			return true
		})
	}
	if !found {
		t.Fatal("resetDerived no longer removes ManuscriptGuide, so a replace would keep the suggestions")
	}
}
