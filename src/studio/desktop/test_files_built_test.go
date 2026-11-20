package main

import (
	"go/build"
	"strings"
	"testing"
)

// A test file whose name ends in _<GOARCH>_test.go or _<GOOS>_test.go is left out of the build on the other platforms: its tests silently never run
// (boothvoiceadd_arm_test.go was read as an arm-only file and none of its tests ran, #3714). Only the Windows-only files may be left out here.
func TestNoTestFileIsLeftOutOfTheBuildByItsName(t *testing.T) {
	pkg, err := build.ImportDir(".", 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range pkg.IgnoredGoFiles {
		if strings.HasSuffix(name, "_test.go") && !strings.Contains(name, "_windows") {
			t.Errorf("%s is not built on this platform: rename it so its tests run (a _test.go name must not end in a GOOS or GOARCH word)", name)
		}
	}
}
