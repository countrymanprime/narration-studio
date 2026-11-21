package pickuplist

import "testing"

// The open count is the list's own count of pickups that are not done, and reading it writes nothing: a done state that
// waits for the DAW is still waiting afterwards, where reading the list finishes it.
func TestTheOpenCountIsTheListsAndWritesNothingToTheDAW(t *testing.T) {
	f := newFixture(t)
	id := speechID("c-0001", f.speech["c-0001"].Gaps[0].ID)
	mustList(t)(f.service().SetDone(id, true)) // the DAW is absent: done here, waiting for the marker
	f.daw.reachable, f.daw.listed = true, true
	f.daw.markers = []Marker{{At: 131.5, Done: false}, {At: 12, Done: true}}

	count, err := f.service().OpenCount()
	if err != nil {
		t.Fatal(err)
	}
	if len(f.daw.writes) != 0 {
		t.Fatalf("the count wrote to the DAW: %v", f.daw.writes)
	}
	open := 0
	list := mustList(t)(f.service().List())
	for _, pickup := range list.Pickups {
		if !pickup.Done {
			open++
		}
	}
	if count != open || open == 0 || open == len(list.Pickups) {
		t.Fatalf("open count = %d; the list has %d open of %d", count, open, len(list.Pickups))
	}
	if len(f.daw.writes) != 1 {
		t.Fatalf("the list's read should finish the waiting write: %v", f.daw.writes)
	}
	if none, err := (&Service{}).OpenCount(); err != nil || none != 0 {
		t.Fatalf("no project: %d, %v", none, err)
	}
}
