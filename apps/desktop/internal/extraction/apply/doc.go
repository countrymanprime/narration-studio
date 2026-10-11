// Package apply puts extraction suggestions into the Story Bible and takes them back (ADR 0803, ADR 0846).
//
// It writes only through the Bible interface, which the guide package satisfies with the Story Bible's own commands, so the lock rule
// (ADR 0007) holds for every write: a suggestion about a locked entry is never applied, and the package never writes
// manuscript_guide.json itself. Applying is idempotent. Steps run in the mock's order (entries, then names, relationships,
// properties and claims, speakers), so a claim finds the entry made in the same pass.
package apply
