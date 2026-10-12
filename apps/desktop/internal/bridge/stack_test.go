package bridge

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// stack_takes and unstack_takes (ADR 0860 point 4, narration_takes.lua): the payload the host writes and the answers as
// integrations/reaper/tests/stack_test.lua pins them.

const (
	stackBase      = "{A0000001-0000-4000-8000-000000000001}"
	stackBaseTake  = "{A0000002-0000-4000-8000-000000000002}"
	stackRetry1    = "{A0000004-0000-4000-8000-000000000004}"
	stackRetry2    = "{A0000006-0000-4000-8000-000000000006}"
	stackBaseB     = "{A0000007-0000-4000-8000-000000000007}"
	stackBaseBTake = "{A0000008-0000-4000-8000-000000000008}"
	stackRetryB    = "{A000000A-0000-4000-8000-00000000000A}"
)

func stackRequest() StackRequest {
	return StackRequest{
		Shift: -11,
		Groups: []StackGroup{{
			ItemGUID:     stackBase,
			BaseTakeGUID: stackBaseTake,
			Moves:        []StackMove{{TakeGUID: stackRetry1, From: 16, To: 10, Len: 4}, {TakeGUID: stackRetry2, From: 21, To: 10, Len: 5}},
		}},
	}
}

func unstackRequest() StackRequest {
	return StackRequest{
		Shift: 11,
		Groups: []StackGroup{{
			ItemGUID:     stackBase,
			BaseTakeGUID: stackBaseTake,
			Moves:        []StackMove{{TakeGUID: stackRetry1, From: 10, To: 16, Len: 4}, {TakeGUID: stackRetry2, From: 10, To: 21, Len: 5}},
		}},
	}
}

func TestStackCommandsAreExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.StackTakes(context.Background(), stackRequest()); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("StackTakes: %v", err)
	}
	if _, err := actions.UnstackTakes(context.Background(), unstackRequest()); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("UnstackTakes: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	if files := payloadFiles(t, dir); len(files) != 0 {
		t.Fatalf("a payload was written while the command was refused: %v", files)
	}
	for _, command := range []string{"stack_takes", "unstack_takes"} {
		if !Experimental(command) {
			t.Errorf("%s must stay experimental until the verification pass", command)
		}
	}
}

// payloadFiles are the stack payloads left in the session folder.
func payloadFiles(t *testing.T, dir string) []string {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(dir, "stack-*.txt"))
	if err != nil {
		t.Fatal(err)
	}
	return files
}

func TestStackTakesWritesThePayloadUnderTheSessionFolderAndReadsTAKES_STACKED(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var payload, path string
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		path = command[3]
		content, err := os.ReadFile(path)
		if err != nil {
			t.Errorf("read the payload: %v", err)
		}
		payload = string(content)
		return [][]string{{"TAKES_STACKED", run(command), "1", "2", "-11.000", "1"}}
	})
	got, err := actions.StackTakes(context.Background(), stackRequest())
	if err != nil {
		t.Fatal(err)
	}
	if want := (TakesStacked{Groups: 1, Takes: 2, Shift: -11, UndoPoints: 1}); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	command := fake.commands()[0]
	if command[1] != "stack_takes" || len(command) != 4 {
		t.Fatalf("command = %v", command)
	}
	if filepath.Dir(path) != dir {
		t.Fatalf("the payload %s is not in the session folder %s", path, dir)
	}
	want := "shift|-11.000000\n" +
		"group|" + stackBase + "|" + stackBaseTake + "\n" +
		"move|" + stackRetry1 + "|16.000000|10.000000|4.000000\n" +
		"move|" + stackRetry2 + "|21.000000|10.000000|5.000000\n"
	if payload != want {
		t.Fatalf("payload =\n%s\nwant\n%s", payload, want)
	}
	if files := payloadFiles(t, dir); len(files) != 0 {
		t.Fatalf("the payload was left behind: %v", files)
	}
}

func TestUnstackTakesSendsTheSamePayloadShapeAndReadsTAKES_UNSTACKED(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var payload string
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		content, _ := os.ReadFile(command[3])
		payload = string(content)
		return [][]string{{"TAKES_UNSTACKED", run(command), "1", "2", "11.000", "1"}}
	})
	got, err := actions.UnstackTakes(context.Background(), unstackRequest())
	if err != nil {
		t.Fatal(err)
	}
	if want := (TakesStacked{Groups: 1, Takes: 2, Shift: 11, UndoPoints: 1}); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	if command := fake.commands()[0]; command[1] != "unstack_takes" {
		t.Fatalf("command = %v", command)
	}
	if !strings.HasPrefix(payload, "shift|11.000000\ngroup|") || !strings.Contains(payload, "move|"+stackRetry2+"|10.000000|21.000000|5.000000\n") {
		t.Fatalf("payload = %q", payload)
	}
}

func TestStackTakesNormalizesGUIDsAsTheScriptComparesThem(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var payload string
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		content, _ := os.ReadFile(command[3])
		payload = string(content)
		return [][]string{{"TAKES_STACKED", run(command), "1", "1", "-1.000", "1"}}
	})
	request := StackRequest{Shift: -1, Groups: []StackGroup{{ItemGUID: strings.ToLower(stackBase), BaseTakeGUID: stackBaseTake, Moves: []StackMove{{TakeGUID: strings.ToLower(stackRetry1), From: 16, To: 10, Len: 4}}}}}
	if _, err := actions.StackTakes(context.Background(), request); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(payload, "group|"+stackBase+"|") || !strings.Contains(payload, "move|"+stackRetry1+"|") {
		t.Fatalf("payload = %q", payload)
	}
}

func TestStackTakesRefusesARequestREAPERWouldRefuseWithoutWritingIt(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	move := func(m StackMove) StackRequest {
		r := stackRequest()
		r.Groups[0].Moves = []StackMove{m}
		return r
	}
	tooMany := StackRequest{Shift: -1}
	for n := range MaxStackGroups + 1 {
		tooMany.Groups = append(tooMany.Groups, StackGroup{ItemGUID: testGUID(3*n + 1), BaseTakeGUID: testGUID(3*n + 2), Moves: []StackMove{{TakeGUID: testGUID(3*n + 3), From: 1, To: 0, Len: 1}}})
	}
	cases := map[string]StackRequest{
		"a group with no move":          {Shift: 0, Groups: []StackGroup{{ItemGUID: stackBase, BaseTakeGUID: stackBaseTake}}},
		"an item that is not a GUID":    {Shift: -1, Groups: []StackGroup{{ItemGUID: "item-1", BaseTakeGUID: stackBaseTake, Moves: []StackMove{{TakeGUID: stackRetry1, From: 1, To: 0, Len: 1}}}}},
		"a base take with a pipe":       {Shift: -1, Groups: []StackGroup{{ItemGUID: stackBase, BaseTakeGUID: stackBaseTake + "|x", Moves: []StackMove{{TakeGUID: stackRetry1, From: 1, To: 0, Len: 1}}}}},
		"a negative time":               move(StackMove{TakeGUID: stackRetry1, From: -1, To: 10, Len: 4}),
		"a time that is not finite":     move(StackMove{TakeGUID: stackRetry1, From: math.Inf(1), To: 10, Len: 4}),
		"a destination that is NaN":     move(StackMove{TakeGUID: stackRetry1, From: 16, To: math.NaN(), Len: 4}),
		"a zero length":                 move(StackMove{TakeGUID: stackRetry1, From: 16, To: 10, Len: 0}),
		"the first read as a retry":     move(StackMove{TakeGUID: stackBaseTake, From: 10, To: 10, Len: 5}),
		"a shift of the wrong sign":     {Shift: 3, Groups: stackRequest().Groups},
		"a shift that is not finite":    {Shift: math.NaN(), Groups: stackRequest().Groups},
		"more groups than REAPER reads": tooMany,
	}
	for name, request := range cases {
		if _, err := actions.StackTakes(context.Background(), request); !errors.Is(err, ErrBadStack) {
			t.Errorf("%s: %v, want ErrBadStack", name, err)
		}
	}
	if _, err := actions.UnstackTakes(context.Background(), stackRequest()); !errors.Is(err, ErrBadStack) {
		t.Errorf("an unstack that moves the audio earlier: %v, want ErrBadStack", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	if files := payloadFiles(t, dir); len(files) != 0 {
		t.Fatalf("a payload was written: %v", files)
	}
}

func TestStackTakesWithNoGroupsIsNothingToStackAndSendsNothing(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.StackTakes(context.Background(), StackRequest{}); !errors.Is(err, ErrNothingToStack) {
		t.Fatalf("StackTakes: %v", err)
	}
	if _, err := actions.UnstackTakes(context.Background(), StackRequest{}); !errors.Is(err, ErrNothingToStack) {
		t.Fatalf("UnstackTakes: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestStackTakesReadsTheScriptsRefusals(t *testing.T) {
	cases := []struct {
		answer []string
		check  func(error) bool
	}{
		{[]string{"ITEM_STALE", "", stackRetry2, "take"}, func(err error) bool {
			var stale *StaleError
			return errors.As(err, &stale) && stale.GUID == stackRetry2 && stale.Reason == "take"
		}},
		{[]string{"ERROR", "", "Nothing to stack."}, func(err error) bool { return errors.Is(err, ErrNothingToStack) }},
		{[]string{"ERROR", "", "The stacking request is not readable, so nothing changed."}, func(err error) bool { return errors.Is(err, ErrBadStack) }},
		{[]string{"ERROR", "", "The stacking request is too large, so nothing changed."}, func(err error) bool { return errors.Is(err, ErrBadStack) }},
		{[]string{"ERROR", "", "REAPER is recording. Stop recording first."}, func(err error) bool { return errors.Is(err, ErrRecording) }},
		{[]string{"ERROR", "", "Other audio sits between the reads, so nothing was stacked."}, func(err error) bool {
			var refusal *RefusalError
			return errors.As(err, &refusal) && refusal.Sentence == "Other audio sits between the reads, so nothing was stacked."
		}},
	}
	for _, c := range cases {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			answer := append([]string{}, c.answer...)
			answer[1] = run(command)
			return [][]string{answer}
		})
		_, err := actions.StackTakes(context.Background(), stackRequest())
		if !c.check(err) {
			t.Errorf("%v: got %v", c.answer, err)
		}
		if files := payloadFiles(t, dir); len(files) != 0 {
			t.Errorf("%v: the payload was left behind: %v", c.answer, files)
		}
	}
}

func TestUnstackTakesReadsNothingToUnstack(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "Nothing to un-stack."}}
	})
	if _, err := actions.UnstackTakes(context.Background(), unstackRequest()); !errors.Is(err, ErrNothingToStack) {
		t.Fatalf("UnstackTakes: %v", err)
	}
}

func TestStackTakesPayloadFitsTheScriptsBound(t *testing.T) {
	// The largest request the host sends must be one the script reads: MaxStackGroups groups holding MaxStackMoves moves
	// between them, with times past a day.
	request := StackRequest{Shift: -99999.999999}
	for n := range MaxStackMoves {
		if n < MaxStackGroups {
			request.Groups = append(request.Groups, StackGroup{ItemGUID: testGUID(2*n + 1), BaseTakeGUID: testGUID(2*n + 2)})
		}
		group := &request.Groups[n%MaxStackGroups]
		group.Moves = append(group.Moves, StackMove{TakeGUID: testGUID(1000 + n), From: 99999.999999, To: 99999.999999, Len: 99999.999999})
	}
	if err := validStack(request, -1); err != nil {
		t.Fatal(err)
	}
	if got := len(stackPayload(request)); got > maxStackPayloadBytes {
		t.Fatalf("the largest payload is %d bytes, more than the script reads (%d)", got, maxStackPayloadBytes)
	}
}

func testGUID(n int) string { return fmt.Sprintf("{%08X-0000-4000-8000-%012X}", n, n) }
