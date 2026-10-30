package project

import (
	"strings"
	"testing"

	"desktop/internal/contractfile"
	"desktop/internal/pathfixtures"
)

// nameCase is one row of tests/fixtures/contracts/project-name-cases.json: a name, whether the host takes it (judged trimmed, as
// ProjectCreateIn does) and the message it gives when it does not. The UI's projectName.ts mirrors this rule and its test reads the
// same file, so the two cannot drift. Two edges are not aligned and not in the file: strings.TrimSpace trims U+0085 where JS trim()
// trims U+FEFF, and strings.ToUpper and toUpperCase can fold an exotic letter differently; neither can change a device name.
type nameCase struct {
	Name    string `json:"name"`
	Value   string `json:"value"`
	Valid   bool   `json:"valid"`
	Message string `json:"message"`
}

func TestValidateNameContract(t *testing.T) {
	var cases []nameCase
	add := func(name, value string) {
		message := ""
		err := ValidateName(strings.TrimSpace(value))
		if err != nil {
			message = err.Error()
		}
		cases = append(cases, nameCase{Name: name, Value: value, Valid: err == nil, Message: message})
	}
	for _, fixture := range pathfixtures.Names() {
		add(fixture.Name, fixture.Value)
	}
	add("colon-in-the-middle", "Bad:name")
	add("reserved-mixed-case", "Com3")
	add("reserved-with-trailing-spaces", "NUL  ")
	contractfile.Check(t, "project-name-cases", cases)
}

func TestValidateNameAcceptsAnOrdinaryName(t *testing.T) {
	if err := ValidateName("Alice's Adventures"); err != nil {
		t.Fatalf("ValidateName() error = %v, want nil", err)
	}
}

func TestValidateNameTrimsSurroundingWhitespace(t *testing.T) {
	if err := ValidateName("  Alice  "); err != nil {
		t.Fatalf("ValidateName() error = %v, want nil", err)
	}
}

func TestValidateNameRejectsEmpty(t *testing.T) {
	if err := ValidateName(""); err == nil {
		t.Fatal("ValidateName(\"\") error = nil, want an error")
	}
}

func TestValidateNameRejectsWhitespaceOnly(t *testing.T) {
	if err := ValidateName("   "); err == nil {
		t.Fatal("ValidateName(\"   \") error = nil, want an error")
	}
}

func TestValidateNameRejectsDotAndDotDot(t *testing.T) {
	for _, name := range []string{".", ".."} {
		if err := ValidateName(name); err == nil {
			t.Fatalf("ValidateName(%q) error = nil, want an error", name)
		}
	}
}

func TestValidateNameRejectsWindowsIllegalCharacters(t *testing.T) {
	for _, illegal := range []string{"<", ">", ":", `"`, "/", `\`, "|", "?", "*"} {
		name := "Alice" + illegal
		if err := ValidateName(name); err == nil {
			t.Fatalf("ValidateName(%q) error = nil, want an error for the illegal character %q", name, illegal)
		}
	}
}

func TestValidateNameRejectsControlCharacters(t *testing.T) {
	if err := ValidateName("Alice\x01book"); err == nil {
		t.Fatal("ValidateName() error = nil, want an error for a control character")
	}
}

func TestValidateNameRejectsReservedWindowsDeviceNames(t *testing.T) {
	for _, name := range []string{"CON", "con", "PRN", "AUX", "NUL", "COM1", "com9", "LPT1", "lpt9"} {
		if err := ValidateName(name); err == nil {
			t.Fatalf("ValidateName(%q) error = nil, want an error for a reserved device name", name)
		}
	}
}

func TestValidateNameRejectsAReservedNameWithAnExtension(t *testing.T) {
	if err := ValidateName("CON.txt"); err == nil {
		t.Fatal("ValidateName(\"CON.txt\") error = nil, want an error")
	}
}

func TestValidateNameAcceptsANameThatOnlyStartsWithAReservedPrefix(t *testing.T) {
	if err := ValidateName("Constantinople"); err != nil {
		t.Fatalf("ValidateName() error = %v, want nil (not an exact reserved-name match)", err)
	}
}
