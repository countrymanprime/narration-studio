package persist

import "crypto/sha256"

// Digest is the SHA-256 of a file's bytes: the identity of what was decoded from them.
type Digest [sha256.Size]byte

// Sum is the Digest of raw.
func Sum(raw []byte) Digest { return sha256.Sum256(raw) }

// Held is one file's decoded value and the digest of the bytes it came from; the zero value holds nothing. A file's size and
// modification time can both survive a change of its content, so the bytes are what a held value is valid for. Not safe for
// concurrent use: the owner locks.
type Held[T any] struct {
	sum   Digest
	value T
	// state is Loaded for a held value, Healed for bytes that did not decode, and Missing for nothing held.
	state Outcome
}

// Set holds value as what the bytes of digest sum decode to.
func (h *Held[T]) Set(sum Digest, value T) { *h = Held[T]{sum: sum, value: value, state: Loaded} }

// Drop forgets what is held.
func (h *Held[T]) Drop() { *h = Held[T]{} }

// Value is the held value, and false when none is held.
func (h Held[T]) Value() (T, bool) { return h.value, h.state == Loaded }

// ReadHeld is Reporter.ReadJSON for a file whose decoded value is kept between reads: it reads and hashes the file every time and
// calls decode only when the bytes are not the ones held was decoded from, so a read of an unchanged file costs the read and the
// hash, and a file changed in any way is decoded again. The outcomes are ReadJSON's. Bytes of a Disposable file that did not decode
// are held too, so the same bad file is Healed on every read and logged once. Any other outcome than Loaded or Healed drops what
// was held. The value returned is the held one: the caller copies it before changing it.
func ReadHeld[T any](r *Reporter, path, what string, class Class, held *Held[T], decode func([]byte) (T, error)) (T, Outcome) {
	outcome := r.read(path, what, class, func(raw []byte) error {
		sum := Sum(raw)
		if held.state != Missing && held.sum == sum {
			if held.state == Healed {
				return errHealedBefore
			}
			return nil
		}
		decodes.Add(1)
		value, err := decode(raw)
		if err != nil {
			*held = Held[T]{sum: sum, state: Healed}
			return err
		}
		held.Set(sum, value)
		return nil
	})
	if outcome != Loaded && outcome != Healed {
		held.Drop()
	}
	return held.value, outcome
}
