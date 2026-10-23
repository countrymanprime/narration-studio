package brand_test

import (
	"testing"

	"desktop/internal/brand"
)

func TestGoldenReplacesTheDisplayNameAndNothingElse(t *testing.T) {
	text := "Downloading " + brand.Name + " 0.2.7 into " + brand.DataFolder
	want := "Downloading " + brand.NamePlaceholder + " 0.2.7 into " + brand.DataFolder
	if got := string(brand.Golden([]byte(text))); got != want {
		t.Fatalf("Golden(%q) = %q, want %q", text, got, want)
	}
}
