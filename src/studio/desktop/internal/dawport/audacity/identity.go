package audacity

import (
	"context"
	"errors"
	"regexp"

	"desktop/internal/audacitybridge"
)

// A project's link lives in its Audacity project as one label, `[nu:project <id>]`, at the start of the app's label
// track. Audacity scripting reports no project file path, so the label is how the app tells which Audacity project is open and
// whether it is the one linked to this app project (docs/reference/daw/audacity-3.md, "Linking"). It is not a finding label: a
// finding's identity has no space in it, so ParseFindingLabel never reads this one.
const projectLabelPrefix = "[nu:project "

var projectLabel = regexp.MustCompile(`^\[nu:project ([A-Za-z0-9]{6,32})\]$`)

// ProjectLinkID is the id the host mints for a link: letters and digits only, so it survives a label's text rules.
var projectLinkID = regexp.MustCompile(`^[A-Za-z0-9]{6,32}$`)

// ProjectLabelText is the label text for link id, or an error for an id that would not read back.
func ProjectLabelText(id string) (string, error) {
	if !projectLinkID.MatchString(id) {
		return "", errors.Join(audacitybridge.ErrInvalidValue, errors.New("a link id is 6 to 32 letters and digits"))
	}
	return projectLabelPrefix + id + "]", nil
}

// ParseProjectLabel reads a link id back from a label's text; ok is false for any other label.
func ParseProjectLabel(text string) (id string, ok bool) {
	m := projectLabel.FindStringSubmatch(text)
	if m == nil {
		return "", false
	}
	return m[1], true
}

// ProjectLink reads the open project's link id. found is false when the project carries none; a project with several different
// ids reports the first in label order, which is the one the app wrote at the start of the track.
func (s *Session) ProjectLink(ctx context.Context) (id string, found bool, err error) {
	labels, err := s.client.Labels(ctx)
	if err != nil {
		return "", false, err
	}
	for _, l := range labels {
		if id, ok := ParseProjectLabel(l.Text); ok {
			return id, true, nil
		}
	}
	return "", false, nil
}

// LinkProject writes link id into the open project: a label at the start of the app's label track, made if the project
// has none. A project that already carries this id is left alone (changed is false); one that carries another id has that label
// renamed, so a project is never linked twice. The narrator's own labels are never touched.
func (s *Session) LinkProject(ctx context.Context, id string) (changed bool, err error) {
	text, err := ProjectLabelText(id)
	if err != nil {
		return false, err
	}
	labels, err := s.client.Labels(ctx)
	if err != nil {
		return false, err
	}
	for _, l := range labels {
		if have, ok := ParseProjectLabel(l.Text); ok {
			if have == id {
				return false, nil
			}
			return true, s.client.SetLabel(ctx, l.Index, audacitybridge.LabelEdit{Text: &text})
		}
	}
	return true, s.addLabel(ctx, labels, 0, 0, text)
}
