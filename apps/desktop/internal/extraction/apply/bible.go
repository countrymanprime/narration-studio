package apply

// Property is one labelled fact of an entry. Keys are unique whatever their case.
type Property struct {
	Key   string
	Value string
}

// Relation is a relationship an entry has: the other entry's id and the label.
type Relation struct {
	To    string
	Label string
}

// Entry is a Story Bible entry as the apply step reads it. Aliases are the names besides Name.
type Entry struct {
	ID          string
	Name        string
	Category    string
	Description string
	Locked      bool
	Aliases     []string
	// FlaggedEntry and FlaggedAliases are the Review flags: the entry itself and the names still to look at.
	FlaggedEntry   bool
	FlaggedAliases []string
	Properties     []Property
	Relations      []Relation
}

// Cue is a quoted line of the manuscript with the speaker the Story Bible has for it ("" when unknown). Start and End are the
// quote's place in its paragraph, in the units the suggestion's evidence uses.
type Cue struct {
	ID          string
	ParagraphID string
	Start       int
	End         int
	SpeakerID   string
	// Corrected is true when the narrator chose the speaker.
	Corrected bool
}

// Bible is what the apply step needs of the Story Bible. Every write is one of its existing commands, and each refuses a locked entry.
type Bible interface {
	Entries() ([]Entry, error)
	Cues() ([]Cue, error)
	// Create makes an entry and returns its id.
	Create(name, category string, aliases []string, description string) (string, error)
	SetDescription(id, text string) error
	// SetAliases replaces the names besides the entry's own.
	SetAliases(id string, aliases []string) error
	// SetProperties replaces the entry's properties.
	SetProperties(id string, properties []Property) error
	Relate(id, other, label string) error
	Unrelate(id, other, label string) error
	Delete(id string) error
	// Flag and Unflag set and clear the Review flag of the entry (alias "") or of one name.
	Flag(id, alias string) error
	Unflag(id, alias string) error
	// CorrectCue records the narrator's speaker for a cue; "" puts it back to unknown.
	CorrectCue(cueID, speakerID string) error
}
