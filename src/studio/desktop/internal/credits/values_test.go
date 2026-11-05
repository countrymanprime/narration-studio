package credits

import "testing"

func TestResolveFillsNarratorFromTheGlobalDefaultWhenTheProjectHasNoOverride(t *testing.T) {
	values := Values{Title: "Neon"}
	resolved := values.Resolve("Global Narrator")
	if resolved["Narrator"] != "Global Narrator" {
		t.Fatalf("Narrator = %q, want the global default", resolved["Narrator"])
	}
	if resolved["Title"] != "Neon" {
		t.Fatalf("Title = %q", resolved["Title"])
	}
}

func TestResolvePrefersTheProjectsOwnNarratorOverride(t *testing.T) {
	values := Values{Narrator: "Project Narrator"}
	resolved := values.Resolve("Global Narrator")
	if resolved["Narrator"] != "Project Narrator" {
		t.Fatalf("Narrator = %q, want the project override to win", resolved["Narrator"])
	}
}

func TestIsSetIsTrueOnlyWhenSomeValueHasText(t *testing.T) {
	if (Values{}).IsSet() || (Values{Title: "  ", Narrator: "\t"}).IsSet() {
		t.Fatal("empty or blank values are not set")
	}
	if !(Values{Publisher: "Acme"}).IsSet() || !(Values{Narrator: "Me"}).IsSet() {
		t.Fatal("a value with text is set")
	}
}
