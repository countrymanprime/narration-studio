package extraction

import "strings"

// Payload is what a suggestion offers; Kind says which fields it uses. An entry is named by its id, name or any of
// its names.
//
//	entry:        Name, Type, Aliases, Description, AppearsIn
//	alias:        Entry, Alias
//	property:     Entry, Key, Value
//	relationship: Entry, To, Relation
//	claim:        Entry, Claim, Text
//	speaker:      Quote, Speaker
type Payload struct {
	Kind        Kind
	Name        string
	Type        string
	Aliases     []string
	Description string
	AppearsIn   []string
	Entry       string
	Alias       string
	Key         string
	Value       string
	To          string
	Relation    string
	Claim       ClaimKind
	Text        string
	Quote       string
	Speaker     string
}

// norm folds typography, lowercases, collapses white space and trims, so spelling the same thing differently gives
// one string.
func norm(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(fold(s))), " ")
}

// Fingerprint says what a suggestion is about, so the same thing offered again, or one the narrator rejected, is
// recognised. The first part is the kind. An unknown kind gives the empty string.
func Fingerprint(p Payload) string {
	var parts []string
	switch p.Kind {
	case KindEntry:
		parts = []string{norm(p.Name)}
	case KindAlias:
		parts = []string{norm(p.Entry), norm(p.Alias)}
	case KindProperty:
		parts = []string{norm(p.Entry), norm(p.Key), norm(p.Value)}
	case KindRelationship:
		parts = []string{norm(p.Entry), norm(p.Relation), norm(p.To)}
	case KindClaim:
		parts = []string{norm(p.Entry), string(p.Claim), norm(p.Text)}
	case KindSpeaker:
		parts = []string{norm(p.Quote), norm(p.Speaker)}
	default:
		return ""
	}
	return strings.Join(append([]string{string(p.Kind)}, parts...), "|")
}
