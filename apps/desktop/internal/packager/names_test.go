package packager

import (
	"strings"
	"testing"
)

func TestIsReservedDeviceName(t *testing.T) {
	reserved := []string{"CON", "con", "Prn", "AUX", "NUL", "COM1", "com9", "LPT1", "lpt9", "COM¹", "LPT³", "CONIN$", "CONOUT$",
		"NUL.txt", "con.tar.gz", "NUL .txt", "NUL "}
	for _, name := range reserved {
		if !IsReservedDeviceName(name) {
			t.Errorf("IsReservedDeviceName(%q) = false, want true", name)
		}
	}
	ordinary := []string{"", "CONSOLE", "COM10", "COM", "LPT", "NULL", "xNUL", "my.NUL", "Kobo", "コン", "ACX"}
	for _, name := range ordinary {
		if IsReservedDeviceName(name) {
			t.Errorf("IsReservedDeviceName(%q) = true, want false", name)
		}
	}
}

func TestNameUnitsCountsUTF16(t *testing.T) {
	for name, tc := range map[string]struct {
		in   string
		want int
	}{"empty": {"", 0}, "ascii": {"abc", 3}, "emoji": {"🐇", 2}, "cjk": {"本本", 2}, "rtl": {"שלום", 4}} {
		if got := NameUnits(tc.in); got != tc.want {
			t.Errorf("%s: NameUnits(%q) = %d, want %d", name, tc.in, got, tc.want)
		}
	}
}

func TestSafeSegment(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"plain", "Kobo", "Kobo"},
		{"invalid characters", `Kobo: "Books"/2026`, `Kobo_ _Books__2026`},
		{"blank", "   ", "package"},
		{"dots only", " .. ", "package"},
		{"reserved CON", "CON", "CON_"},
		{"reserved lower nul", "nul", "nul_"},
		{"reserved with extension", "NUL.txt", "NUL_.txt"},
		{"reserved COM1", "COM1", "COM1_"},
		{"reserved LPT9 with extension", "LPT9.mp3", "LPT9_.mp3"},
		{"reserved CON then trailing dot", "CON.", "CON_"},
		{"not reserved", "CONSOLE", "CONSOLE"},
		{"trailing dot", "Foo.", "Foo"},
		{"trailing dots", "Foo...", "Foo"},
		{"trailing space after dot", "Foo. ", "Foo"},
		{"inner dot space", "Foo .", "Foo"},
		{"trailing space after an inner sequence", "Foo. . ", "Foo"},
		{"emoji", "Books 🐇", "Books 🐇"},
		{"right-to-left", "الفصل הספר", "الفصل הספר"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := SafeSegment(tc.in); got != tc.want {
				t.Fatalf("SafeSegment(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestSafeSegmentCapsAt255UTF16Units(t *testing.T) {
	for name, in := range map[string]string{
		"300 letters":      strings.Repeat("a", 300),
		"300 CJK":          strings.Repeat("本", 300),
		"200 emoji":        strings.Repeat("🐇", 200),
		"emoji at the cut": strings.Repeat("a", 254) + "🐇",
		"cut leaves a dot": strings.Repeat("a", 254) + ". more",
		"reserved + long":  "NUL." + strings.Repeat("b", 400),
	} {
		t.Run(name, func(t *testing.T) {
			got := SafeSegment(in)
			if units := NameUnits(got); units > 255 || units == 0 {
				t.Fatalf("SafeSegment is %d units, want 1..255", units)
			}
			if strings.HasSuffix(got, ".") || strings.HasSuffix(got, " ") || strings.ContainsRune(got, '�') {
				t.Fatalf("SafeSegment(%q) = %q ends in a dot or space or holds a split character", name, got)
			}
			if IsReservedDeviceName(got) {
				t.Fatalf("SafeSegment(%q) = %q is a device name", name, got)
			}
		})
	}
	if got := SafeSegment(strings.Repeat("a", 255)); NameUnits(got) != 255 {
		t.Fatalf("a name of exactly 255 units was shortened to %d", NameUnits(got))
	}
}
