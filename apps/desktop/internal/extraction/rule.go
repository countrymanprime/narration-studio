package extraction

// VerifyBelow is the review threshold (ADR 0803). A suggestion with a confidence at or above it is applied and
// flagged Review; one below it, or with no confidence, needs verification by the narrator. It is the only place the
// number is written.
const VerifyBelow = 0.75

// Kind is what a suggestion offers.
type Kind string

// The suggestion kinds.
const (
	KindEntry        Kind = "entry"
	KindAlias        Kind = "alias"
	KindProperty     Kind = "property"
	KindRelationship Kind = "relationship"
	KindClaim        Kind = "claim"
	KindSpeaker      Kind = "speaker"
)

// ClaimKind is what a claim says about its entry.
type ClaimKind string

// The claim kinds.
const (
	ClaimTalk ClaimKind = "talk"
	ClaimAct  ClaimKind = "act"
	ClaimKnow ClaimKind = "know"
)

// Status is where a suggestion stands.
type Status string

// The suggestion statuses.
const (
	StatusAcceptedAuto      Status = "accepted-auto"
	StatusNeedsVerification Status = "needs-verification"
	StatusAccepted          Status = "accepted"
	StatusRejected          Status = "rejected"
)

// Reason is why a suggestion cannot be accepted on its own. The text is what the narrator reads and what is stored.
type Reason string

// The reasons a suggestion needs verification.
const (
	ReasonNoConfidence  Reason = "No confidence was given."
	ReasonLowConfidence Reason = "Confidence is under the threshold."
	ReasonQuoteNotFound Reason = "quote not found"
	ReasonNoEvidence    Reason = "No evidence quote."
	ReasonUnknownEntry  Reason = "The entry is not in the Story Bible."
)

// Candidate is the part of a suggestion the rule reads. Confidence is nil when the source gave none.
type Candidate struct {
	Kind            Kind
	Confidence      *float64
	Evidence        []Evidence
	UnverifiedQuote string
	EntryID         string
}

// NeedsQuote reports whether a kind says something about the text, so that without a quote it has no claim to stand on.
func NeedsQuote(k Kind) bool {
	return k == KindProperty || k == KindClaim || k == KindSpeaker
}

// NeedsEntry reports whether a kind belongs to an entry already in the Story Bible.
func NeedsEntry(k Kind) bool {
	return k == KindAlias || k == KindProperty || k == KindRelationship || k == KindClaim
}

// Confident reports whether a confidence is enough to be accepted without the narrator: at or above VerifyBelow.
// A nil confidence never is.
func Confident(c *float64) bool {
	return c != nil && *c >= VerifyBelow
}

// ReasonsOf returns why a suggestion cannot be accepted on its own, in a fixed order: confidence, evidence, entry.
// Empty means it can.
func ReasonsOf(s Candidate) []Reason {
	var out []Reason
	switch {
	case s.Confidence == nil:
		out = append(out, ReasonNoConfidence)
	case *s.Confidence < VerifyBelow:
		out = append(out, ReasonLowConfidence)
	}
	if len(s.Evidence) == 0 {
		if s.UnverifiedQuote != "" {
			out = append(out, ReasonQuoteNotFound)
		} else if NeedsQuote(s.Kind) {
			out = append(out, ReasonNoEvidence)
		}
	}
	if NeedsEntry(s.Kind) && s.EntryID == "" {
		out = append(out, ReasonUnknownEntry)
	}
	return out
}

// AutoStatus returns the status a suggestion has before the narrator decides: needs-verification exactly when
// ReasonsOf is non-empty, otherwise accepted-auto.
func AutoStatus(s Candidate) Status {
	if len(ReasonsOf(s)) > 0 {
		return StatusNeedsVerification
	}
	return StatusAcceptedAuto
}
