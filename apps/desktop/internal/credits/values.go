package credits

// Values is a project's own credit token values, owned per project for
// everything except the narrator name. It is stored on the project manifest
// (project.Manifest.Credits) rather than in a dedicated file.
type Values struct {
	Title           string `json:"title,omitempty"`
	Subtitle        string `json:"subtitle,omitempty"`
	Author          string `json:"author,omitempty"`
	Series          string `json:"series,omitempty"`
	BookNumber      string `json:"bookNumber,omitempty"`
	Copyright       string `json:"copyright,omitempty"`
	Year            string `json:"year,omitempty"`
	CopyrightHolder string `json:"copyrightHolder,omitempty"`
	Publisher       string `json:"publisher,omitempty"`
	// Narrator overrides the global narrator default (General.narrator_name)
	// for this project only; empty means "use the global default".
	Narrator string `json:"narrator,omitempty"`
}

// Resolve builds the token map Render consumes: project values first, the
// global narrator name filling in [Narrator] only when the project has no
// override of its own. [Chapter] and [Chapter Title] are computed per chapter-
// announcement render (RenderAnnouncements), not here.
func (v Values) Resolve(globalNarrator string) map[string]string {
	narrator := v.Narrator
	if narrator == "" {
		narrator = globalNarrator
	}
	return map[string]string{
		"Title":            v.Title,
		"Subtitle":         v.Subtitle,
		"Author":           v.Author,
		"Series":           v.Series,
		"Book Number":      v.BookNumber,
		"Copyright":        v.Copyright,
		"Year":             v.Year,
		"Copyright Holder": v.CopyrightHolder,
		"Publisher":        v.Publisher,
		"Narrator":         narrator,
	}
}
