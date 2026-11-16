package wakelock_test

import (
	"errors"
	"reflect"
	"sync"
	"testing"

	"desktop/internal/wakelock"
	"desktop/internal/wakelock/wakelocktest"
)

func events(t *testing.T, fake *wakelocktest.Fake, want ...string) {
	t.Helper()
	if got := fake.Events(); !reflect.DeepEqual(got, append([]string(nil), want...)) {
		t.Fatalf("events = %v, want %v", got, want)
	}
}

func TestTheRequestIsHeldExactlyWhileATakeRecords(t *testing.T) {
	fake := &wakelocktest.Fake{}
	keeper := wakelock.New(fake)
	for _, recording := range []bool{false, true, true, true, false, false, true, false} {
		if err := keeper.Set(recording); err != nil {
			t.Fatal(err)
		}
		if keeper.Held() != recording || fake.Held() != recording {
			t.Fatalf("Set(%v): keeper held %v, fake held %v", recording, keeper.Held(), fake.Held())
		}
	}
	events(t, fake, "acquire", "release", "acquire", "release")
}

func TestARefusedAcquireHoldsNothingAndTheNextTickTriesAgain(t *testing.T) {
	fake := &wakelocktest.Fake{}
	keeper := wakelock.New(fake)
	fake.FailNext(errors.New("refused"))
	if err := keeper.Set(true); err == nil {
		t.Fatal("a refused Acquire must be reported")
	}
	if keeper.Held() {
		t.Fatal("a refused Acquire holds nothing")
	}
	if err := keeper.Set(true); err != nil || !keeper.Held() {
		t.Fatalf("the next true must try again: err=%v held=%v", err, keeper.Held())
	}
	events(t, fake, "acquire-failed", "acquire")
}

func TestCloseReleasesAndNothingIsAcquiredAfterIt(t *testing.T) {
	fake := &wakelocktest.Fake{}
	keeper := wakelock.New(fake)
	_ = keeper.Set(true)
	keeper.Close()
	keeper.Close()
	if err := keeper.Set(true); err != nil || keeper.Held() || fake.Held() {
		t.Fatalf("after Close: err=%v keeper held %v, fake held %v", err, keeper.Held(), fake.Held())
	}
	events(t, fake, "acquire", "release")
}

func TestCloseWithNothingHeldReleasesNothing(t *testing.T) {
	fake := &wakelocktest.Fake{}
	wakelock.New(fake).Close()
	events(t, fake)
}

func TestConcurrentAnswersNeverDoubleAcquireOrDoubleRelease(t *testing.T) {
	fake := &wakelocktest.Fake{}
	keeper := wakelock.New(fake)
	var wg sync.WaitGroup
	for i := range 200 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = keeper.Set(i%3 != 0)
		}()
	}
	wg.Wait()
	keeper.Close()
	held := false
	for _, event := range fake.Events() {
		switch event {
		case "acquire":
			if held {
				t.Fatal("acquired twice without a release")
			}
			held = true
		case "release":
			if !held {
				t.Fatal("released with nothing held")
			}
			held = false
		}
	}
	if held {
		t.Fatal("still held after Close")
	}
}
