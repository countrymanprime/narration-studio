package main

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/daw"
	"desktop/internal/recording"
	"desktop/internal/recording/recordingtest"
	"desktop/internal/wakelock/wakelocktest"
)

// wakeHost is a REAPER host whose transport the test moves by heartbeat and whose clock it holds, with a fake in place of the operating
// system's "do not sleep" request (#3574).
func wakeHost(t *testing.T) (host *Host, fake *wakelocktest.Fake, beat func(transport string), age func(time.Duration)) {
	t.Helper()
	host = newTestHostForDawCapabilities(t, "REAPER")
	client, err := bridge.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	clock := time.Now()
	reach := daw.NewReachabilityWithClock(nil, func() time.Time { return clock })
	host.bridge, host.reachability = client, reach
	fake = &wakelocktest.Fake{}
	host.wakeInhibitor = fake
	beat = func(transport string) {
		reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/Projects/Alice/Alice.rpp", "0", "7", transport, "1.000000"}})
		host.pollDawTransport()
	}
	age = func(by time.Duration) {
		clock = clock.Add(by)
		host.pollDawTransport()
	}
	return host, fake, beat, age
}

func wakeEvents(t *testing.T, fake *wakelocktest.Fake, want ...string) {
	t.Helper()
	if got := fake.Events(); !reflect.DeepEqual(got, append([]string(nil), want...)) {
		t.Fatalf("wake events = %v, want %v", got, want)
	}
}

func TestTheComputerStaysAwakeWhileATakeRecordsAndNoLonger(t *testing.T) {
	_, fake, beat, _ := wakeHost(t)
	beat("0") // idle: nothing to hold
	wakeEvents(t, fake)
	beat("5") // recording
	beat("5")
	beat("5")
	wakeEvents(t, fake, "acquire")
	beat("6") // recording and paused (bits 4 and 2): still a take, the request stays
	wakeEvents(t, fake, "acquire")
	beat("0")
	wakeEvents(t, fake, "acquire", "release")
	beat("1") // playing is not recording
	wakeEvents(t, fake, "acquire", "release")
	beat("5")
	beat("0")
	wakeEvents(t, fake, "acquire", "release", "acquire", "release")
}

func TestARecordingThatStaysTheSameKeepsOneRequestThroughManyTicks(t *testing.T) {
	// The transport payload changes only with the position, and the request follows `recording`, not the change.
	host, fake, beat, _ := wakeHost(t)
	beat("5")
	for range 20 {
		host.pollDawTransport()
	}
	wakeEvents(t, fake, "acquire")
}

func TestTheDawGoingAwayMidTakeGivesTheRequestBack(t *testing.T) {
	_, fake, beat, age := wakeHost(t)
	beat("5")
	age(time.Hour) // no heartbeat any more: REAPER closed or crashed, and a closed REAPER is not still recording
	wakeEvents(t, fake, "acquire", "release")
	beat("5") // it comes back and records again
	wakeEvents(t, fake, "acquire", "release", "acquire")
}

func TestARefusedRequestIsTriedAgainOnTheNextTick(t *testing.T) {
	host, fake, beat, _ := wakeHost(t)
	fake.FailNext(errors.New("refused"))
	beat("5")
	if fake.Held() {
		t.Fatal("a refused request holds nothing")
	}
	host.pollDawTransport() // nothing changed in the payload; the request is tried again anyway
	wakeEvents(t, fake, "acquire-failed", "acquire")
}

func TestQuittingWhileATakeRecordsGivesTheRequestBack(t *testing.T) {
	host, fake, beat, _ := wakeHost(t)
	beat("5")
	if err := host.ServiceShutdown(); err != nil {
		t.Fatal(err)
	}
	wakeEvents(t, fake, "acquire", "release")
	// A tick that lands after the shutdown does not take it again.
	beat("5")
	wakeEvents(t, fake, "acquire", "release")
}

func TestNoDawAndNoRecordingNeverAskTheSystemForAnything(t *testing.T) {
	host := newTestHostForDawCapabilities(t, "")
	fake := &wakelocktest.Fake{}
	host.wakeInhibitor = fake
	host.pollDawTransport()
	host.pollDawTransport()
	wakeEvents(t, fake)
}

// Two callers poll the transport at once (transcriptLoop and the recorder's state change): the request must end up matching the
// latest transport, and never be acquired twice or released with nothing held (QA, #3574).
func TestConcurrentPollsLeaveTheRequestMatchingTheLatestTransport(t *testing.T) {
	host, fake, beat, _ := wakeHost(t)
	for round := range 40 {
		stop := make(chan struct{})
		done := make(chan struct{})
		for range 3 {
			go func() {
				defer func() { done <- struct{}{} }()
				for {
					select {
					case <-stop:
						return
					default:
						host.pollDawTransport()
					}
				}
			}()
		}
		for i := range 30 {
			if i%2 == 0 {
				beat("5")
			} else {
				beat("0")
			}
		}
		close(stop)
		for range 3 {
			<-done
		}
		last := "0"
		if round%2 == 0 {
			last = "5"
		}
		beat(last)
		host.pollDawTransport()
		if fake.Held() != (last == "5") {
			t.Fatalf("round %d: after the last heartbeat %q the request held = %v", round, last, fake.Held())
		}
	}
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
}

// The built-in recorder is the other engine behind dawTransport(): a take it records holds the request, and its stop gives it back.
func TestTheBuiltInRecordersTakeHoldsTheRequestAndItsStopGivesItBack(t *testing.T) {
	host := boothRecorderHost(t, &recordingtest.Fake{DeviceList: []recording.Device{{Name: micOne}}}, micOne)
	inhibitor := &wakelocktest.Fake{}
	host.wakeInhibitor = inhibitor
	host.pollDawTransport()
	wakeEvents(t, inhibitor)
	if result := boothRecord(t)(host.ReadAloudRecordStart("c-0001")); result.Outcome != "started" {
		t.Fatalf("start = %+v", result)
	}
	host.pollDawTransport()
	wakeEvents(t, inhibitor, "acquire")
	boothRecord(t)(host.ReadAloudRecordStop())
	waitRecorderIdle(t, host)
	host.pollDawTransport()
	wakeEvents(t, inhibitor, "acquire", "release")
}

// A second take that begins while the first is still recording (the DAW's heartbeat goes from one take to the next without an idle
// beat between) keeps the one request: it is released only when the last take ends.
func TestASecondTakeStartingBeforeTheFirstStopsKeepsTheRequest(t *testing.T) {
	_, fake, beat, _ := wakeHost(t)
	beat("5")
	beat("6") // the first take paused
	beat("5") // a second one recording
	wakeEvents(t, fake, "acquire")
	beat("0")
	wakeEvents(t, fake, "acquire", "release")
}
