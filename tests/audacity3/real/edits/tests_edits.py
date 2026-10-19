"""A3-T14 to A3-T23 (docs/research/audacity-3-capability-matrix.md): recording, punch and roll, edits, macros, gain, undo, export.

Each test talks to the Audacity run.sh started, through the raw client in pipe.py. `check` is an expectation that held or did not;
`note` is a measurement or a limitation the matrix and the adapter docs should carry. What a real 3.7.7 did is written next to each
assertion, so a failing row names the behaviour that changed.
"""

import itertools
import os
import time

import wavtools
from harness import test
from helpers import (
    audio_state,
    deterministic_exports,
    dismiss_dialog,
    export,
    new_tone,
    play_into_sink,
    project_end,
    reset_project,
    sel_tracks,
    set_sync_lock,
    sine_wav,
    structure_fp,
    zero_cross_freq,
)
from pipe import PipeError, Timeout

CLICK_STOP = (204, 165)  # the Stop button of the 1280x800 Xvfb screen the first Audacity window opens on (no window manager)


def sleep_until(t0, offset):
    left = t0 + offset - time.monotonic()
    if left > 0:
        time.sleep(left)


def record_for(t, labels_at=(), total=5.0, tone=None, record_cmd="Record1stChoice", stop=True):
    """Play `tone` into the sink, start recording, send AddLabelPlaying at each offset in labels_at, and stop at `total` seconds.

    Returns dict(t0 = monotonic time of the reply to the record command, labels = [(offset sent, monotonic reply)], stop_at). The
    record command is sent with a short timeout so a modal dialog shows up as a Timeout instead of a hang."""
    p = t.pipe
    player = play_into_sink(tone) if tone else None
    r = p.do(record_cmd, timeout=8)
    t0 = time.monotonic()
    out = {"t0": t0, "labels": [], "record_reply_ms": round(r.seconds * 1000)}
    for off in labels_at:
        sleep_until(t0, off)
        p.do("AddLabelPlaying")
        out["labels"].append((off, time.monotonic() - t0))
    if stop:
        sleep_until(t0, total)
        p.do("Stop")
        out["stop_at"] = time.monotonic() - t0
    if player:
        try:
            player.wait(timeout=20)
        except Exception:  # noqa: BLE001
            player.kill()
    return out


@test("A3-T14", "Record and live label (null sink), and the sample-rate modal")
def t14(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    reset_project(p)
    clip = sine_wav(t.work / "loop440.wav", 440, 12)

    # Run 1: a 44.1 kHz track in a 44.1 kHz project, recorded onto its end.
    idx = new_tone(t, "base", 1.0, rate=44100)
    sel_tracks(p, [idx])
    p.select_time(1.0, 1.0)
    before = p.tracks()
    rec = record_for(t, labels_at=(2.0,), total=5.0, tone=clip)
    after = p.tracks()
    t.note("run 1 tracks before", str([(x["name"], x.get("start"), x.get("end"), x.get("channels")) for x in before]))
    t.note("run 1 tracks after", str([(x["name"], x.get("start"), x.get("end"), x.get("channels")) for x in after]))
    recorded = [x for x in after if x["kind"] == "wave"]
    # Where the audio landed: appended to the selected track, or on a new one.
    grown = max(x.get("end", 0) for x in recorded)
    t.note(
        "run 1 timing",
        f"record command answered in {rec['record_reply_ms']} ms; stop sent {rec['stop_at']:.2f} s after the record reply; "
        f"project audio now ends at {grown:.3f} s",
        **{k: v for k, v in rec.items() if k != "t0"},
    )
    new_tracks = len(recorded) - len(before)
    t.note("run 1 target", "Record1stChoice made a new track" if new_tracks else "Record1stChoice appended to the selected track", new_tracks=new_tracks)
    labels = p.labels()
    t.note("run 1 labels", str(labels))
    rec_track = [x for x in after if x["kind"] == "wave" and x["name"] not in ("base",)]
    rec_start = rec_track[0]["start"] if rec_track else 0.0
    rec_len = (rec_track[0]["end"] - rec_start) if rec_track else 0.0
    # The wall clock runs from the reply to the record command; Audacity's clock runs from the moment capture started. The gap is the
    # latency the app's own clock cannot see (N3c, N14): measured, not asserted against a number, because it is the device's.
    latency = rec["stop_at"] - rec_len
    t.note(
        "run 1 capture start latency",
        f"audio recorded {rec_len:.3f} s of a {rec['stop_at']:.3f} s wall interval: capture started about {latency:.2f} s after the record reply",
        recorded_s=rec_len,
        wall_s=rec["stop_at"],
        latency_s=latency,
    )
    t.check(
        "run 1 the recording is a new track that starts at the cursor",
        bool(new_tracks) and abs(rec_start - 1.0) < 0.05,
        f"start {rec_start:.3f} s, new tracks {new_tracks}",
    )
    t.check(
        "run 1 the recording is not longer than the wall interval",
        0.5 * rec["stop_at"] < rec_len <= rec["stop_at"] + 0.1,
        f"{rec_len:.3f} s recorded in {rec['stop_at']:.3f} s",
    )
    if labels:
        label_t = labels[0][1]
        truth = rec_start + rec["labels"][0][1]
        t.note(
            "run 1 live label against the app's clock",
            f"AddLabelPlaying put the label at {label_t:.3f} s; the app's clock (record reply + wall offset) says {truth:.3f} s; "
            f"the app's clock reads {truth - label_t:+.3f} s too far on",
            label=label_t,
            app_clock=truth,
            drift=label_t - truth,
        )
        t.check(
            "run 1 the live label lies inside the recording",
            rec_start <= label_t <= rec_start + rec_len,
            f"{label_t:.3f} s in {rec_start:.3f}..{rec_start + rec_len:.3f}",
        )
        # The label is accurate if it falls where the audio says: the offset into the recording equals wall offset minus capture latency.
        t.check(
            "run 1 the label is where the audio says (within 0.25 s of wall offset minus latency)",
            abs((label_t - rec_start) - (rec["labels"][0][1] - latency)) <= 0.25,
            f"label {label_t - rec_start:.3f} s into the recording; wall offset - latency = {rec['labels'][0][1] - latency:.3f} s",
        )
    else:
        t.check("run 1 AddLabelPlaying made a label", False, "no label after AddLabelPlaying")
    _, wav = export(t, "run1.wav", [i for i, x in enumerate(after) if x["kind"] == "wave" and x["name"] != "base"], start=rec_start, end=rec_start + rec_len)
    loud = max((wavtools.rms(wavtools.window(wav, a / 4, a / 4 + 0.25)) for a in range(int(wav["seconds"] * 4) - 1)), default=0.0)
    # The sine is played at RMS 0.35; what Audacity records through ALSA's pulse plugin is about 0.03 (-30 dB): a level, not a gain error to chase.
    t.check(
        "run 1 the recording holds the played sine, not silence",
        loud > 0.01,
        f"loudest 0.25 s window RMS {loud:.3f} (played at 0.354), {wav['channels']} channel(s) at {wav['rate']} Hz",
    )

    # Run 2: a 22.05 kHz track in the 44.1 kHz project: the sample-rate modal (finding 5 of the CI note).
    reset_project(p)
    idx = new_tone(t, "low", 1.0, rate=22050)
    sel_tracks(p, [idx])
    p.select_time(1.0, 1.0)
    t.note("run 2 project rate", p.do('GetPreference: Name="/SamplingRate/DefaultProjectSampleRate"').body.strip() + " Hz (GetInfo has no per-track rate)")
    try:
        r = p.do("Record1stChoice", timeout=8)
        time.sleep(1.0)
        p.do("Stop")
        t.check("run 2 a 22.05 kHz track in a 44.1 kHz project raises the modal", False, f"Record1stChoice answered in {r.seconds * 1000:.0f} ms; no dialog")
    except Timeout:
        titles = dismiss_dialog(t, "run2-modal")
        t.check("run 2 the modal is 'Too Few Compatible Tracks Selected'", any("Too Few Compatible Tracks" in x for x in titles), "; ".join(titles))
        t.check("run 2 the client timed out instead of getting a reply", True, "no reply within 8 s")
        clicked = t.click_dialog(title_part="Too Few Compatible")
        time.sleep(1.0)
        left = [x for x in t.windows() if "Too Few" in x]
        t.check("run 2 a click on the dialog's OK button closes it", clicked and not left, f"clicked={clicked}, still open={left}")
        p.connect()
        t.check("run 2 the next command on a new connection is answered at once", p.do("Message: Text=after", timeout=5).seconds < 2, "")

    # Run 3: a stereo 44.1 kHz track is compatible with the stereo input.
    reset_project(p)
    idx = new_tone(t, "stereo", 1.0, rate=44100, channels=2)
    sel_tracks(p, [idx])
    p.select_time(1.0, 1.0)
    try:
        rec = record_for(t, total=3.0, tone=clip)
        tr = [(x["name"], x.get("start"), x.get("end")) for x in p.tracks() if x["kind"] == "wave"]
        t.note("run 3 a compatible stereo track", f"tracks after recording 3 s: {tr}")
    except Timeout:
        titles = dismiss_dialog(t, "run3-modal")
        t.check("run 3 a stereo 44.1 kHz track records without a dialog", False, "; ".join(titles))


def record_with_command(t, command, at=4.0, wait_after=3.0, expect_ok=False):
    """Record from the null sink; at `at` seconds after the record reply send `command` (None: nothing); wait; Stop. Returns
    (recorded seconds on the new clip, None, wall seconds at Stop, the Reply)."""
    p = t.pipe
    reset_project(p)
    new_tone(t, "base", 0.5, rate=44100, channels=2)
    sel_tracks(p, [0])
    p.select_time(0.5, 0.5)
    clip = sine_wav(t.work / "loop440.wav", 440, 14)
    player = play_into_sink(clip)
    p.do("Record1stChoice", timeout=8)
    t0 = time.monotonic()
    reply = None
    if command:
        sleep_until(t0, at)
        reply = p.do(command, expect_ok=expect_ok)
    sleep_until(t0, at + wait_after)
    p.do("Stop")
    wall = time.monotonic() - t0
    clips = p.clips()
    new = [c for c in clips if c["start"] >= 0.5 - 1e-6 and c["end"] > 0.5 + 1e-6]
    recorded = max((c["end"] - 0.5 for c in new), default=0.0)
    try:
        player.wait(timeout=20)
    except Exception:  # noqa: BLE001
        player.kill()
    time.sleep(1.0)
    return recorded, None, wall, reply


@test("A3-T15", "Recording end detection: which commands end a recording, and can a stop made in the UI be seen")
def t15(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    # Control: nothing sent while recording. Gives the capture-start latency on this machine.
    base, _, wall, _ = record_with_command(t, None, at=8.0, wait_after=0.0)
    latency = wall - base
    t.note(
        "control: no command during the recording",
        f"recorded {base:.2f} s of a {wall:.2f} s wall interval; capture started {latency:.2f} s after the record reply",
        recorded_s=base,
        wall_s=wall,
        latency_s=latency,
    )
    t.check("control: a recording with no command runs to Stop", base > 4.0, f"{base:.2f} s")
    # Which commands end a recording: send each at 4 s, Stop at 7 s, and see how much of the 3 s after the command was kept.
    ends = {}
    for cmd in (
        "AddLabelPlaying",
        "SelectNone",
        "Message: Text=while_recording",
        "GetInfo: Type=Tracks Format=JSON",
        "GetInfo: Type=Selection Format=JSON",
        "SelectTime: Start=0.1 End=0.1",
    ):
        rec, _, wall, reply = record_with_command(t, cmd, at=4.0, wait_after=3.0)
        kept = rec - (4.0 - latency)  # audio kept after the command arrived; about 3 s when the recording went on, about 0 when it ended
        ended = kept < 1.0
        ends[cmd] = ended
        t.note(
            f"during a recording: {cmd}",
            f"answered in {reply.seconds * 1000:.0f} ms; {rec:.2f} s recorded (control would give {wall - latency:.2f} s): the recording "
            + ("ENDED at the command" if ended else "went on"),
            command=cmd,
            recorded_s=rec,
            expected_if_running_s=wall - latency,
            ended=ended,
        )
    t.check(
        "a batch command (Message, GetInfo, SelectTime) sent during a recording ends it",
        all(ends[c] for c in ends if not c.startswith(("AddLabelPlaying", "SelectNone"))),
        str({k: ("ended" if v else "went on") for k, v in ends.items()}),
    )
    t.check("the menu commands AddLabelPlaying and SelectNone do not end it", not ends["AddLabelPlaying"] and not ends["SelectNone"], "")
    t.note(
        "consequence",
        "the app cannot poll Audacity while it records: a heartbeat Message or a GetInfo read ends the take. Only AddLabelPlaying and Stop are safe. "
        "A stop made in Audacity's own window cannot be seen either, so 'recording ended in the DAW' is not detectable from the pipe.",
    )
    # Stop made in the UI: nothing to poll, so only the screen shows it. A click on the Stop button must end the recording, kept up to that point.
    import subprocess

    reset_project(p)
    new_tone(t, "base", 0.5, rate=44100, channels=2)
    sel_tracks(p, [0])
    p.select_time(0.5, 0.5)
    player = play_into_sink(t.work / "loop440.wav")
    p.do("Record1stChoice", timeout=8)
    t0 = time.monotonic()
    sleep_until(t0, 5.0)
    subprocess.run(["xdotool", "mousemove", str(CLICK_STOP[0]), str(CLICK_STOP[1]), "click", "1"], timeout=10, check=False)
    sleep_until(t0, 8.0)
    clips = [c for c in p.clips() if c["end"] > 0.5 + 1e-6 and c["start"] >= 0.5 - 1e-6]  # this GetInfo ends nothing: the UI already stopped it
    rec = max((c["end"] - 0.5 for c in clips), default=0.0)
    t.note(
        "a Stop click in the UI",
        f"recorded {rec:.2f} s; the click was {5.0:.1f} s after the record reply and capture starts about {latency:.2f} s after it, so {5.0 - latency:.2f} s expected",
        recorded_s=rec,
    )
    t.check("a Stop click in the UI keeps the audio recorded up to it", abs(rec - (5.0 - latency)) < 0.6, f"{rec:.2f} s")
    try:
        player.wait(timeout=20)
    except Exception:  # noqa: BLE001
        player.kill()


def freqs(wav, start, end, step=0.5):
    out = []
    a = start
    while a + step <= end + 1e-9:
        seg = wavtools.window(wav, a, a + step)
        out.append((round(a, 2), round(zero_cross_freq(seg, wav["rate"])), round(wavtools.db(wavtools.rms(seg)), 1)))
        a += step
    return out


def undo_until(t, target, limit, name):
    """Send Undo until audio_state equals target, at most `limit` times; return the count, or None. Never goes past `limit`, because
    Undo with an empty history crashes Audacity 3.7.7 (A3-T22)."""
    for n in range(1, limit + 1):
        t.pipe.do("Undo")
        state = audio_state(t, f"{name}-{n}.wav")
        t.note(
            f"after Undo {n}",
            f"state {state} (target {target}); clips {[(c['start'], c['end']) for c in t.pipe.clips()]}; tracks {[(x['name'], x.get('end')) for x in t.pipe.tracks()]}",
        )
        if state == target:
            return n
    return None


@test("A3-T16", "Punch and Roll: what happens to earlier audio, the pre-roll key, undo steps")
def t16(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    reset_project(p)
    deterministic_exports(p)
    a_clip = sine_wav(t.work / "a440.wav", 440, 12)
    b_clip = sine_wav(t.work / "b880.wav", 880, 12)
    new_tone(t, "base", 0.5, rate=44100, channels=2)
    sel_tracks(p, [0])
    p.select_time(0.5, 0.5)
    player = play_into_sink(a_clip)
    p.do("Record1stChoice", timeout=8)  # no other command until Stop: any batch command would end the take (A3-T15)
    time.sleep(9.0)
    p.do("Stop")
    player.wait(timeout=20)
    time.sleep(1.5)  # a take is finalised after Stop returns; measure only once it has settled
    end0 = project_end(p)
    t.note("the take settles", f"end read twice, 1 s apart: {end0:.5f} then {(time.sleep(1.0), project_end(p))[1]:.5f}")
    end0 = project_end(p)
    t.note("the first take", f"track 0 now ends at {end0:.3f} s; clips {[(c['start'], c['end']) for c in p.clips()]}")
    s0 = audio_state(t, "before.wav")
    t.check("two exports of the recorded take are identical once dither is off", audio_state(t, "before2.wav") == s0, "")
    _, before = export(t, "before-export.wav", [0])
    t.note("before the roll, 0.5 s windows (start, Hz, dB)", str(freqs(before, 0.5, end0)))
    # The pre-roll key: GetPreference answers Failed! for a key that was never saved, so the key is found by setting it.
    got = p.do('GetPreference: Name="/AudioIO/PreRoll"', expect_ok=False)
    t.note("/AudioIO/PreRoll before SetPreference", f"ok={got.ok} body={got.body.strip()!r} (a default is not stored until set)")
    p.do('SetPreference: Name="/AudioIO/PreRoll" Value="1" Reload="0"')
    t.check("SetPreference then GetPreference round-trips /AudioIO/PreRoll", p.do('GetPreference: Name="/AudioIO/PreRoll"').body.strip() in ("1", "1.0"), "")
    punch = 3.5
    sel_tracks(p, [0])
    p.select_time(punch, punch)
    player = play_into_sink(b_clip)
    try:
        r = p.do("PunchAndRoll", timeout=10)
    except Timeout:
        titles = dismiss_dialog(t, "roll-modal")
        t.check("PunchAndRoll starts without a dialog", False, "; ".join(titles))
        return
    t0 = time.monotonic()
    t.note("PunchAndRoll", f"answered in {r.seconds * 1000:.0f} ms: {r.raw!r}")
    time.sleep(7.0)
    p.do("Stop")
    wall = time.monotonic() - t0
    player.wait(timeout=20)
    end1 = project_end(p)
    clips = [(c["start"], c["end"]) for c in p.clips()]
    t.note("after the roll", f"stopped {wall:.2f} s after the roll command; track ends at {end1:.3f} s; clips {clips}")
    _, after = export(t, "after-export.wav", [0])
    wins = freqs(after, 0.5, after["seconds"])
    t.note("after the roll, 0.5 s windows (start, Hz, dB)", str(wins))
    keep_to = punch - 1.0 - 0.1  # earlier audio the pre-roll must not touch
    same = wavtools.window(before, 0.5, keep_to) == wavtools.window(after, 0.5, keep_to)
    if not same:
        x, y = wavtools.window(before, 0.5, keep_to), wavtools.window(after, 0.5, keep_to)
        diff = [i for i, (u, v) in enumerate(zip(x, y)) if u != v]
        t.note(
            "where the exported audio differs",
            f"{len(diff)} of {len(x)} samples differ, first at {0.5 + diff[0] / before['rate']:.4f} s, largest delta {max(abs(x[i] - y[i]) for i in diff):.2e}"
            if diff
            else f"lengths {len(x)} vs {len(y)}",
        )
    t.check(
        f"the audio before the pre-roll point ({punch - 1.0:.1f} s) is unchanged to within 1e-4",
        all(abs(u - v) < 1e-4 for u, v in zip(wavtools.window(before, 0.5, keep_to), wavtools.window(after, 0.5, keep_to))),
        "",
    )
    new = [w for w in wins if w[0] >= punch and 800 < w[1] < 960]
    t.check("the audio after the punch point holds the new 880 Hz signal", bool(new), f"windows at 880 Hz: {new}")
    old_after = [w for w in wins if w[0] >= punch + 0.5 and 400 < w[1] < 480]
    t.note("the old 440 Hz audio after the punch point", "replaced" if not old_after else f"still present at {old_after}", still_present=bool(old_after))
    n = undo_until(t, s0, 6, "undo")
    t.note("undo steps to return to the state before the roll", f"{n}; the adapter reports undoSteps 0", undo_steps=n)
    t.check("Undo returns to the state before the roll within 6 steps", n is not None, f"{n} Undo(s)")


def clone_window(t, src, start, end, name, stereo=False):
    """The adapter's BackupAround sequence, raw: Copy the window, a new track, name it, Paste at `start`, mute it. Returns the new track's index.
    `mute_by` records how the mute reached that track (see A3-T17: SetTrackAudio has no Track parameter)."""
    p = t.pipe
    n0 = len(p.tracks())
    sel_tracks(p, [src])
    p.select_time(start, end)
    p.do("Copy")
    p.do("NewStereoTrack" if stereo else "NewMonoTrack")
    idx = n0
    p.do(f'SetTrackStatus: Name="{name}"')
    sel_tracks(p, [idx])
    p.select_time(start, start)
    p.do("Paste")
    return idx


@test("A3-T17", "Backups: clone a window, damage the original, restore; stereo; the backup track's mute; a missing backup")
def t17(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    reset_project(p)
    deterministic_exports(p)
    # Distinct audio in every second, so a paste in the wrong place cannot pass: second k carries a (300 + 40 k) Hz tone.
    new_tone_steps(t, "orig", 300)
    sel_tracks(p, [0])
    _, whole = export(t, "orig-before.wav", [0], 30, 270)
    ref = wavtools.pcm_hash(whole)
    idx = clone_window(t, 0, 30, 270, "Narration Utils backup {TEST}")
    tracks = p.tracks()
    t.note("tracks after the clone", str([(x["name"], x.get("start"), x.get("end"), x["channels"], x["mute"]) for x in tracks]))
    clips = [c for c in p.clips() if c["track"] == idx]
    t.check(
        "the pasted backup starts at the window start (30 s), not at 0",
        bool(clips) and abs(clips[0]["start"] - 30) < 0.01 and abs(clips[-1]["end"] - 270) < 0.05,
        str(clips),
    )
    # SetTrackAudio takes Mute, Solo, Volume and Pan only; the adapter sends Track=<index> as well.
    r = p.do(f"SetTrackAudio: Track={idx} Mute=1", expect_ok=False)
    after = p.tracks()
    t.note("SetTrackAudio with a Track parameter", f"ok={r.ok}; reply {r.raw!r}; mute flags now {[(x['name'], x['mute'], x['selected']) for x in after]}")
    muted = [x["name"] for x in after if x["mute"]]
    t.note("which track the mute reached", f"muted tracks: {muted}; the backup track was selected: {after[idx]['selected']}")
    t.check("SetTrackAudio: Track=<i> Mute=1 mutes the named track and only it", muted == [after[idx]["name"]], f"muted {muted}")
    # With the selection instead of an index (the documented parameters): select the backup track, then mute.
    p.do("SetTrackAudio: Mute=0")
    sel_tracks(p, [idx])
    p.do("SetTrackAudio: Mute=1")
    after = p.tracks()
    t.check(
        "SetTrackAudio: Mute=1 mutes the selected track",
        [x["name"] for x in after if x["mute"]] == [after[idx]["name"]],
        str([(x["name"], x["mute"]) for x in after]),
    )
    # Damage, restore from the backup, compare.
    sel_tracks(p, [0])
    p.select_time(100, 200)
    p.do("Silence")
    _, damaged = export(t, "orig-damaged.wav", [0], 30, 270)
    t.check("the damage is audible in the export (100 to 200 s is silent)", wavtools.rms(wavtools.window(damaged, 80, 160)) < 1e-4, "")
    sel_tracks(p, [idx])
    p.select_time(30, 270)
    p.do("Copy")
    sel_tracks(p, [0])
    p.select_time(30, 270)
    p.do("Paste")
    _, restored = export(t, "orig-restored.wav", [0], 30, 270)
    t.check("the restored window hashes equal to the original", wavtools.pcm_hash(restored) == ref, f"{wavtools.pcm_hash(restored)} vs {ref}")
    t.note("tracks after the restore", str([(x["name"], x.get("end")) for x in p.tracks()]))
    # Stereo source.
    reset_project(p)
    new_tone_steps(t, "stereo", 60, channels=2)
    idx = clone_window(t, 0, 10, 50, "Narration Utils backup {STEREO}", stereo=True)
    sc = p.tracks()[idx]["channels"]
    t.check("a stereo source gets a stereo backup track", sc == 2, f"{sc} channels")
    # A backup track that is gone: its audio is not there to restore.
    sel_tracks(p, [idx])
    p.do("RemoveTracks")
    t.check("after RemoveTracks the backup track is not listed", all("backup" not in x["name"] for x in p.tracks()), "")


def new_tone_steps(t, name, seconds, channels=1, rate=44100):
    """A tone that changes frequency every second (300 + 40 k Hz), imported as a new track: each second is recognisable."""
    import array
    import math
    import wave

    path = t.work / f"{name}.wav"
    n = int(seconds * rate)
    data = array.array("h", [0] * (n * channels))
    for i in range(n):
        f = 300 + 40 * (int(i / rate) % 20)
        v = int(0.4 * 32767 * math.sin(2 * math.pi * f * i / rate))
        for c in range(channels):
            data[i * channels + c] = v
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(data.tobytes())
    n0 = len(t.pipe.tracks())
    t.pipe.do(f'Import2: Filename="{path}"')
    return n0


def add_label(p, start, end, text):
    """AddLabel labels the selection with empty text; SetLabel then names the one that is empty (labels are numbered across label tracks)."""
    p.select_none()
    p.select_time(start, end)
    p.do("AddLabel")
    labs = p.labels()
    idx = next(i for i, (_, s, e, txt) in enumerate(labs) if txt == "" and abs(s - start) < 1e-3)
    p.do(f'SetLabel: Label={idx} Text="{text}"')


def label_times(p):
    return {txt: (round(s, 3), round(e, 3)) for _, s, e, txt in p.labels()}


def freq_at(wav, sec, width=0.4):
    return round(zero_cross_freq(wavtools.window(wav, sec, sec + width), wav["rate"]))


@test("A3-T18", "Cut, close and gap, and label drift with Sync-Lock off and on")
def t18(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    deterministic_exports(p)
    shifts = {}
    closes = {}
    for sync in ("0", "1"):
        for variant in ("SplitDelete+Delete", "Delete"):
            reset_project(p)
            set_sync_lock(p, sync == "1")
            new_tone_steps(t, f"cut{sync}", 12)  # second k carries 300 + 40 k Hz
            for text, a, b in (("L1", 1.2, 1.2), ("L5", 5.2, 5.2), ("L9", 9.2, 9.2), ("R4-6", 4.1, 5.9)):
                add_label(p, a, b, text)
            before = label_times(p)
            sel_tracks(p, [0])  # the audio track only, as the adapter selects it
            p.select_time(2.0, 3.0)
            ends = []
            for cmd in variant.split("+"):
                p.do(cmd)
                ends.append(round(project_end(p), 3))
            after = label_times(p)
            _, wav = export(t, f"close{sync}-{variant}.wav", [0])
            f = freq_at(wav, 2.2)
            closed = abs(ends[-1] - 11) < 0.01
            closes[(sync, variant)] = closed
            moved = {k: round(before[k][0] - after[k][0], 3) for k in before if k in after}
            shifts[(sync, variant)] = moved
            t.note(
                f"Sync-Lock {sync}, {variant}, 2 to 3 s of 12",
                f"track end after each command {ends}; 2.2 s now {f} Hz (420 = closed up, 0 = a silent gap); label shifts {moved}",
                ends=ends,
                hz_at_2_2=f,
                label_shifts=moved,
            )
    t.check("SplitDelete then Delete closes the gap with Sync-Lock on", closes[("1", "SplitDelete+Delete")], "")
    t.check(
        "SplitDelete then Delete does NOT close the gap with Sync-Lock off (the adapter's close mode needs a plain Delete, or Sync-Lock on)",
        not closes[("0", "SplitDelete+Delete")],
        f"closed={closes[('0', 'SplitDelete+Delete')]}",
    )
    t.note(
        "SetPreference does not toggle Sync-Lock",
        "SetPreference /GUI/SyncLockTracks is stored but the open project ignores it; only the SyncLock menu command changes the state, and it can only be read back from that preference after a toggle",
    )
    t.check(
        "a plain Delete closes the gap whatever Sync-Lock says",
        closes[("0", "Delete")] and closes[("1", "Delete")],
        str({k: v for k, v in closes.items() if k[1] == "Delete"}),
    )
    t.check(
        "with Sync-Lock off the labels do not follow a close-up cut: they drift by the cut's length",
        all(abs(shifts[("0", "Delete")][k]) < 1e-3 for k in shifts[("0", "Delete")]),
        str(shifts[("0", "Delete")]),
    )
    on = shifts[("1", "Delete")]
    t.check(
        "with Sync-Lock on the labels after the cut move up with the audio and the one before stays",
        on.get("L5") == 1.0 and on.get("L9") == 1.0 and on.get("L1") == 0.0,
        str(on),
    )
    # A gap: SplitDelete only; labels and length stay with Sync-Lock either way.
    for sync in ("0", "1"):
        reset_project(p)
        set_sync_lock(p, sync == "1")
        new_tone_steps(t, f"gap{sync}", 12)
        add_label(p, 6.2, 6.2, "L6")
        sel_tracks(p, [0])
        p.select_time(5.0, 5.5)
        p.do("SplitDelete")
        _, wav = export(t, f"gap{sync}.wav", [0])
        sil = wavtools.rms_db(wav, 5.05, 5.45)
        t.check(
            f"Sync-Lock {sync}: a SplitDelete gap is silent and the track keeps its length and the labels",
            sil < -90 and abs(project_end(p) - 12) < 0.01 and label_times(p)["L6"][0] == 6.2,
            f"{sil:.1f} dB, end {project_end(p):.3f}, labels {label_times(p)}",
        )


@test("A3-T19", "Stack and un-stack primitives, and takes by mute")
def t19(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    deterministic_exports(p)
    reset_project(p)
    new_tone_steps(t, "chapter", 12)  # second k carries 300 + 40 k Hz
    export(t, "chapter0.wav", [0])
    # Paste at a cursor in the middle of the audio: does it insert (moving what follows) or overwrite?
    sel_tracks(p, [0])
    p.select_time(8.0, 9.0)
    p.do("Copy")
    p.select_time(6.0, 6.0)
    p.do("Paste")
    end = project_end(p)
    _, wav = export(t, "pasted.wav", [0])
    t.check("a Paste at a cursor inserts: the track grows by the pasted length", abs(end - 13) < 0.01, f"ends at {end:.3f} s")
    t.check(
        "the pasted audio is at the cursor and what followed moved later",
        abs(freq_at(wav, 6.2) - 620) < 25 and abs(freq_at(wav, 7.2) - 540) < 25,
        f"6.2 s: {freq_at(wav, 6.2)} Hz (620 expected), 7.2 s: {freq_at(wav, 7.2)} Hz (the old second 6 = 540)",
    )
    p.do("Undo")
    # The stack's take: an empty track pasted at the first read's spot, then muted; the chapter takes the rest.
    p.select_none()
    p.do("NewMonoTrack")
    p.do('SetTrackStatus: Name="Narration Utils take t2"')
    sel_tracks(p, [0])
    p.select_time(8.0, 9.0)
    p.do("Copy")
    sel_tracks(p, [1])
    p.select_time(6.0, 6.0)
    p.do("Paste")
    sel_tracks(p, [0])
    p.select_time(8.0, 9.0)
    p.do("Split")
    p.do("Delete")
    tr = p.tracks()
    t.note("tracks after the stack steps", str([(x["name"], x.get("end"), x["mute"], x["selected"]) for x in tr]))
    clips = p.clips()
    t.note("clips", str([(c["track"], c["start"], c["end"]) for c in clips]))
    t.check(
        "the chapter is 1 s shorter after Split and Delete of the moved read",
        abs(project_end(p) - 12) < 0.05 or abs(tr[0]["end"] - 11) < 0.05,
        f"track 0 ends {tr[0].get('end')}",
    )
    # Muting: by selection (the documented parameters).
    sel_tracks(p, [1])
    p.do("SetTrackAudio: Mute=1")
    mutes = [x["mute"] for x in p.tracks()]
    t.check("SetTrackAudio: Mute=1 mutes the selected take track and not the chapter", mutes == [0, 1], str(mutes))
    # What the adapter sends: SetTrackAudio with Track=1 after the chapter was selected last (as after Split and Delete).
    p.do("SetTrackAudio: Mute=0")
    sel_tracks(p, [0])
    p.do("SetTrackAudio: Track=1 Mute=1")
    mutes = [x["mute"] for x in p.tracks()]
    t.note(
        "SetTrackAudio: Track=1 Mute=1 with the chapter selected",
        f"mute flags {mutes}: the Track parameter is ignored and the selected track is muted",
        mutes=mutes,
    )
    t.check("SetTrackAudio ignores a Track parameter: it muted the selected chapter, not track 1", mutes == [1, 0], str(mutes))
    p.do("SetTrackAudio: Mute=0")
    # Takes by mute: export mixes only unmuted tracks.
    sel_tracks(p, [0, 1])
    p.select_time(0, project_end(p))
    for muted, want in ((1, "the chapter"), (0, "the take")):
        sel_tracks(p, [0])
        p.do(f"SetTrackAudio: Mute={muted}")
        sel_tracks(p, [1])
        p.do(f"SetTrackAudio: Mute={1 - muted}")
        _, wav = export(t, f"mute{muted}.wav", [0, 1], 6.0, 7.0)
        loud = wavtools.rms(wavtools.window(wav, 0.1, 0.9))
        t.note(f"export with track {muted} muted", f"RMS {loud:.3f}, {freq_at(wav, 0.2)} Hz")
    t.note("takes by mute", "a muted track is left out of the export even when it is selected: swapping mutes swaps the take heard")


@test("A3-T20", "Macros: which spelling works, listing, a missing name, undo steps")
def t20(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    deterministic_exports(p)
    menus = p.do("GetInfo: Type=Menus Format=JSON").json()
    macro_ids = [m["id"] for m in menus if isinstance(m, dict) and str(m.get("id", "")).startswith("Macro_")]
    t.note("Macro_ entries in GetInfo Menus", str(macro_ids), ids=macro_ids)
    cmds = [c["id"] for c in p.do("GetInfo: Type=Commands Format=JSON").json()]
    t.check(
        "GetInfo Commands (batch commands) does not list macros", not any(c.startswith("Macro_") for c in cmds), f"{len(cmds)} commands, none starting Macro_"
    )
    t.check("ApplyMacro is not in the batch command list", "ApplyMacro" not in cmds, "")
    t.check("the profile's macro files are listed in the Menus as Macro_<name>", "Macro_Narration-Test" in macro_ids, str(macro_ids))
    reset_project(p)
    new_tone(t, "m", 6.0, amp=0.5)
    sel_tracks(p, [0])
    p.select_time(2.0, 4.0)
    s0 = audio_state(t, "m0.wav")
    # The adapter's spelling.
    r = p.do('ApplyMacro: MacroName="Narration-Test"', expect_ok=False)
    t.check("ApplyMacro: MacroName=<name> is not recognised by Audacity 3.7.7", not r.ok, f"{r.raw!r} in {r.seconds * 1000:.0f} ms")
    t.check("the failed ApplyMacro changed nothing", audio_state(t, "m1.wav") == s0, "")
    # The menu id spelling.
    sel_tracks(p, [0])
    p.select_time(2.0, 4.0)
    r = p.do("Macro_Narration-Test:", expect_ok=False)
    _, wav = export(t, "m2.wav", [0], 0, 6)
    inside, outside = wavtools.rms_db(wav, 2.2, 3.8), wavtools.rms_db(wav, 0.2, 1.8)
    t.check(
        "Macro_<name>: applies the macro to the selection only",
        r.ok and inside > outside + 2,
        f"selection {inside:.1f} dB, the rest {outside:.1f} dB, answered in {r.seconds * 1000:.0f} ms",
    )
    n = undo_until(t, s0, 4, "mundo")
    t.note("undo steps for a two-step macro", f"{n} (the adapter assumes 2 for the macro and 1 for the split)", undo_steps=n)
    t.check("Undo returns to the state before the macro within 4 steps", n is not None, f"{n}")
    # A name that does not exist: fast failure, no dialog.
    t0 = time.monotonic()
    r = p.do("Macro_No-Such-Macro:", expect_ok=False)
    t.check(
        "a macro that does not exist fails fast with no dialog",
        not r.ok and time.monotonic() - t0 < 2 and not [w for w in t.windows() if "Macro" in w],
        f"{r.raw!r}",
    )
    # A name with spaces, which a narrator's macro often has: the file "Narration Spaced Name.txt" is listed as Macro_NarrationSpacedName.
    sel_tracks(p, [0])
    p.select_time(2.0, 4.0)
    for spelling in ("Macro_Narration Spaced Name:", "Macro_NarrationSpacedName:"):
        r = p.do(spelling, expect_ok=False, timeout=10)
        t.note(f"a macro file named 'Narration Spaced Name': {spelling}", f"ok={r.ok} {r.raw!r}", spelling=spelling, ok=r.ok)
        if r.ok:
            p.do("Undo")
    t.check(
        "a macro whose name has spaces is listed with the spaces removed (Macro_NarrationSpacedName)", "Macro_NarrationSpacedName" in macro_ids, str(macro_ids)
    )
    # A macro with no track selected raises a modal dialog that holds the pipe. Undo cleared the selection above, which is how it was found.
    p.select_none()
    try:
        r = p.do("Macro_NarrationSpacedName:", timeout=6, expect_ok=False)
        t.check("a macro with no track selected raises a modal dialog", False, f"answered {r.raw!r}")
    except Timeout:
        shot = t.screenshot("macro-no-track")
        titles = t.windows()
        t.check(
            "a macro with no track selected raises a modal dialog and the pipe times out",
            any("untitled" in x or "Normalize" in x for x in titles),
            "; ".join(titles),
        )
        t.note(
            "the dialog",
            "'\"Normalize\" requires one or more tracks to be selected.' (the macro's first effect), no title bar; the adapter selects the range's track before every macro, so only a hand-made macro with no track can reach it",
            screenshot=str(shot),
        )
        clicked = t.click_dialog()
        time.sleep(1.0)
        p.connect()
        t.check(
            "a click on the dialog's OK button frees the pipe",
            clicked and p.do("Message: Text=free", timeout=5).ok,
            f"clicked={clicked}, windows {t.windows()}",
        )


@test("A3-T21", "Gain and click repair: Amplify, SetEnvelope, ClickRemoval")
def t21(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    deterministic_exports(p)
    reset_project(p)
    new_tone(t, "g", 6.0, amp=0.5)
    _, base = export(t, "g0.wav", [0])
    lvl = lambda w, a, b: wavtools.rms_db(w, a, b)
    ref = lvl(base, 2.2, 2.8)
    # Amplify as the adapter does: Ratio for -6 dB over 2 to 3 s.
    ratio = 10 ** (-6 / 20)
    quarter = 1 / (4 * 440)  # the tone is 440 Hz: an edge a quarter period after a second is at a crest, where a step in gain is largest
    e0, e1 = 2.0 + quarter, 3.0 + quarter
    sel_tracks(p, [0])
    p.select_time(e0, e1)
    p.do(f"Amplify: Ratio={ratio:.6f} AllowClipping=0")
    _, amp = export(t, "g1.wav", [0])
    drop = ref - lvl(amp, 2.2, 2.8)
    t.check("Amplify Ratio=0.501 lowers the selection by 6 dB (within 0.5 dB)", abs(drop - 6) < 0.5, f"{drop:.2f} dB")
    t.check(
        "the audio outside the selection is untouched",
        abs(lvl(amp, 0.2, 1.8) - lvl(base, 0.2, 1.8)) < 0.01 and abs(lvl(amp, 3.2, 5.8) - lvl(base, 3.2, 5.8)) < 0.01,
        "",
    )

    def edge_step(w, at, win=0.003):
        """Largest sample-to-sample jump within win s of `at`, against the same measure on the untouched tone."""
        a, b = int((at - win) * w["rate"]), int((at + win) * w["rate"])
        s = w["samples"][a:b]
        return max(abs(y - x) for x, y in itertools.pairwise(s))

    step_amp = max(edge_step(amp, e0), edge_step(amp, e1))
    step_ref = max(edge_step(base, e0), edge_step(base, e1))
    t.note(
        "Amplify at the edges",
        f"largest jump within 3 ms of an edge: {step_amp:.4f}; the untouched tone's own: {step_ref:.4f} (a step of {step_amp / step_ref:.2f}x)",
        step=step_amp,
        ref=step_ref,
    )
    # The envelope route: ramps 10 ms either side.
    reset_project(p)
    new_tone(t, "g", 6.0, amp=0.5)
    sel_tracks(p, [0])
    p.select_time(0, 6)
    envelope_ok = True
    try:
        for tm, v in ((e0 - 0.01, 1.0), (e0, ratio), (e1, ratio), (e1 + 0.01, 1.0)):
            r = p.do(f"SetEnvelope: Time={tm} Value={v:.6f}", expect_ok=False)
            envelope_ok = envelope_ok and r.ok
    except PipeError as exc:
        envelope_ok = False
        t.note("SetEnvelope", str(exc))
    _, env = export(t, "g2.wav", [0])
    drop_env = ref - lvl(env, 2.2, 2.8)
    t.note(
        "SetEnvelope points 10 ms either side of each crest edge",
        f"all points accepted: {envelope_ok}; level drop inside {drop_env:.2f} dB; outside {lvl(base, 0.2, 1.8) - lvl(env, 0.2, 1.8):.2f} dB; edge jump {max(edge_step(env, e0), edge_step(env, e1)):.4f}",
        drop_db=drop_env,
    )
    t.check(
        "an envelope written with SetEnvelope is applied by Export2 and lowers the span by 6 dB (within 0.5 dB)",
        envelope_ok and abs(drop_env - 6) < 0.5,
        f"{drop_env:.2f} dB",
    )
    t.check(
        "the envelope ramps: its edges jump less than Amplify's",
        max(edge_step(env, e0), edge_step(env, e1)) < step_amp * 0.9,
        f"envelope {max(edge_step(env, e0), edge_step(env, e1)):.4f} vs Amplify {step_amp:.4f}",
    )
    t.check("Amplify leaves a step at its edges (a jump larger than the tone's own)", step_amp > step_ref * 1.2, f"{step_amp:.4f} vs {step_ref:.4f}")
    # ClickRemoval on a synthetic click. First a click that is 3 ms (132 samples) wide: wider than Click Removal's default Width of 20 samples.
    reset_project(p)
    wavtools.write_tone(t.work / "wide.wav", 6.0, amp=0.1, bursts=[(3.0, 0.003, 0.9)])
    p.do(f'Import2: Filename="{t.work / "wide.wav"}"')
    sel_tracks(p, [0])
    p.select_time(2.9, 3.1)
    try:
        r = p.do("ClickRemoval", timeout=6, expect_ok=False)
        t.note("ClickRemoval (defaults) on a 3 ms wide click", f"answered ok={r.ok} {r.raw!r}")
    except Timeout:
        shot = t.screenshot("click-wide")
        t.check(
            "ClickRemoval on a click wider than its Width raises a modal 'Algorithm not effective on this audio. Nothing changed.' and the pipe stalls",
            True,
            "; ".join(t.windows()),
            screenshot=str(shot),
        )
        t.note(
            "consequence",
            "RepairClick sends ClickRemoval with its defaults on a window around a click the app detected; when Audacity finds nothing in it, a modal dialog holds the pipe until the narrator clicks OK",
        )
        clicked = t.click_dialog()
        time.sleep(1.0)
        p.connect()
        t.check("a click on OK frees the pipe", clicked and p.do("Message: Text=free", timeout=5).ok, str(t.windows()))
    # Then a spike a few samples wide.
    reset_project(p)
    wavtools.write_tone(t.work / "spike.wav", 6.0, amp=0.1, bursts=[(3.0, 8 / 44100, 0.9)])
    p.do(f'Import2: Filename="{t.work / "spike.wav"}"')
    _, c0 = export(t, "c0.wav", [0])
    sel_tracks(p, [0])
    p.select_time(2.9, 3.1)
    try:
        r = p.do("ClickRemoval", timeout=8, expect_ok=False)
    except Timeout:
        t.check("ClickRemoval on an 8-sample spike answers", False, "; ".join(t.windows()))
        return
    _, c1 = export(t, "c1.wav", [0])
    pk0, pk1 = wavtools.peak(wavtools.window(c0, 2.995, 3.01)), wavtools.peak(wavtools.window(c1, 2.995, 3.01))
    t.note(
        "ClickRemoval (Threshold 200, Width 20) on an 8-sample full-scale spike over a 0.1 tone",
        f"peak near the click {pk0:.3f} -> {pk1:.3f}; elsewhere {wavtools.peak(wavtools.window(c0, 1, 2)):.3f} -> {wavtools.peak(wavtools.window(c1, 1, 2)):.3f}; answered in {r.seconds * 1000:.0f} ms",
        before=pk0,
        after=pk1,
    )
    t.check("ClickRemoval lowers a narrow click's peak", r.ok and pk1 < pk0 * 0.5, f"{pk0:.3f} -> {pk1:.3f}")


def undo_until_structure(t, target, limit):
    """Undo (at most `limit` times, never past the start of the history) until structure_fp equals target; return the count or None."""
    for n in range(1, limit + 1):
        t.pipe.do("Undo")
        if structure_fp(t.pipe) == target:
            return n
    return None


@test("A3-T22", "Undo guard: undo steps of a cut, what the structure fingerprint cannot see, a hand edit")
def t22(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    deterministic_exports(p)
    reset_project(p)
    new_tone(t, "u", 6.0)
    f0 = structure_fp(p)
    a0 = audio_state(t, "u0.wav")
    # Edit 1 through the adapter's route (a close-up cut), the guard's fingerprint after it.
    sel_tracks(p, [0])
    p.select_time(2.0, 3.0)
    p.do("SplitDelete")
    p.do("Delete")
    f1 = structure_fp(p)
    t.check("a cut changes the structure fingerprint", f1 != f0, "")
    t.check("the guard allows Undo while the fingerprint still equals the one taken after the edit", structure_fp(p) == f1, "")
    n = undo_until_structure(t, f0, 4)
    t.note("Undo steps to take back SplitDelete then Delete", f"{n} (the adapter reports 2 for a close-up cut)", undo_steps=n)
    t.check("Undo returns the structure fingerprint to the one before the edit, in the 2 steps the adapter reports", n == 2, f"{n} Undo(s)")
    t.check("and the audio, hashed through an export, matches too", audio_state(t, "u1.wav") == a0, "")
    # Blind spots of the structure fingerprint.
    sel_tracks(p, [0])
    p.select_time(1.0, 2.0)
    p.do("Amplify: Ratio=0.5 AllowClipping=0")
    t.check("an Amplify does NOT change the structure fingerprint (a blind spot: the guard needs an audio hash for gain edits)", structure_fp(p) == f0, "")
    t.check("but an export-based audio hash sees it", audio_state(t, "u2.wav") != a0, "")
    # Amplify adds no undo point (A3-T22c), so the next Undo takes back the edit before it: here the import, leaving the project empty.
    p.do("Undo")
    t.check(
        "an Undo after an Amplify does not take the Amplify back: it takes back the edit before it, and the Amplify goes with it",
        len(p.tracks()) == 0,
        f"{len(p.tracks())} tracks",
    )
    new_tone(t, "u", 6.0)
    f0 = structure_fp(p)
    p.do("SetTrackAudio: Volume=0.5")
    t.check("track volume is in GetInfo Tracks, so the structure fingerprint sees it", structure_fp(p) != f0, "")
    p.do("SetTrackAudio: Volume=1")
    # A second edit, then a hand edit made by another script: the guard must refuse to undo the second edit.
    p.select_time(4.0, 5.0)
    p.do("SplitDelete")
    p.do("Delete")
    f2 = structure_fp(p)
    p.select_none()
    p.select_time(0.5, 0.5)
    p.do("AddLabel")  # the narrator's own edit
    t.check("a hand edit moves the fingerprint, so the guard refuses to Undo the cut", structure_fp(p) != f2, "")
    p.do("Undo")  # what an unguarded Undo would have done: it takes back the narrator's label, not the cut
    t.check(
        "an unguarded Undo after a hand edit takes back the hand edit, not the app's cut",
        structure_fp(p) == f2 and len(p.labels()) == 0,
        f"labels {len(p.labels())}, the cut still in place: {structure_fp(p) == f2}",
    )


@test("A3-T22b", "Undo with an empty history (run on a fresh Audacity): a modal dialog")
def t22b(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    new_tone(t, "u", 1.0)
    p.do("Undo")  # takes back the import: the history is now at its beginning
    t.check("after Undo of the only edit the project has no tracks", len(p.tracks()) == 0, f"{len(p.tracks())} tracks")
    try:
        r = p.do("Undo", timeout=8, expect_ok=False)
        t.check("Undo with nothing to undo opens a modal 'Nothing to undo' dialog", False, f"answered ok={r.ok} {r.raw!r}")
        return
    except PipeError as exc:
        shot = t.screenshot("nothing-to-undo")
        t.check(
            "Undo with nothing to undo gets no reply: a modal dialog ('Nothing to undo', no title bar) holds the pipe",
            True,
            f"{exc}; windows: {t.windows()}",
            screenshot=str(shot),
        )
    t.note(
        "the app cannot read the undo depth",
        "it may only send an Undo it can prove has an edit behind it; two earlier hand probes saw Audacity crash (a crash report window) after this dialog had been left open and the pipe reused, which this test did not reproduce",
    )
    clicked = t.click_dialog()
    time.sleep(1.0)
    p.connect()
    t.check("a click on OK frees the pipe", clicked and p.do("Message: Text=free", timeout=5).ok, str(t.windows()))


@test("A3-T23", "Export: which tracks are written, channels, odd paths, bit depth keys")
def t23(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    deterministic_exports(p)
    reset_project(p)
    new_tone(t, "x", 6.0, channels=2)
    p.select_none()
    p.select_time(1, 3)
    p.do("AddLabel")  # a label track exists now
    labels_idx = next(i for i, x in enumerate(p.tracks()) if x["kind"] == "label")

    def exp(name, tracks, channels=1, start=1.0, end=3.0):
        sel_tracks(p, tracks)
        p.select_time(start, end)
        path = t.work / name
        if path.exists():
            path.unlink()
        r = p.do(f'Export2: Filename="{path}" NumChannels={channels}', expect_ok=False)
        return r, (wavtools.read_wav(path) if path.exists() else None)

    r, w = exp("audio.wav", [0])
    t.check(
        "with the audio track selected the export holds the 2 s",
        r.ok and w and abs(w["seconds"] - 2) < 0.01 and wavtools.rms(w["samples"]) > 0.05,
        f"{w and w['seconds']} s",
    )
    r, w = exp("label-only.wav", [labels_idx])
    t.check("with only the label track selected Export2 answers OK and writes no samples", r.ok and w and w["seconds"] < 0.01, f"{r.ok} {w and w['seconds']} s")
    p.select_none()
    p.select_time(1, 3)
    path = t.work / "none.wav"
    r = p.do(f'Export2: Filename="{path}" NumChannels=1', expect_ok=False)
    w = wavtools.read_wav(path) if path.exists() else None
    t.check("with no track selected Export2 answers OK and writes no samples", r.ok and w and w["seconds"] < 0.01, f"{r.ok} {w and w['seconds']}")
    for ch in (1, 2):
        r, w = exp(f"ch{ch}.wav", [0], channels=ch)
        t.check(f"NumChannels={ch} writes {ch} channel(s)", r.ok and w and w["channels"] == ch, f"{w and w['channels']}")
    # Paths.
    for label, name in (("a path with spaces", "a b  c.wav"), ("a non-ASCII letter", "é-ß-日本.wav"), ("a 200-character name", "n" * 196 + ".wav")):
        r, w = exp(name, [0])
        t.check(f"export to {label}", r.ok and w is not None and w["seconds"] > 1.9, f"{r.raw[:100]!r}")
    deep = t.work
    for i in range(6):
        deep = deep / ("d" * 50)
    deep.mkdir(parents=True, exist_ok=True)
    r, w = exp(str(deep / "x.wav").replace(str(t.work) + "/", ""), [0])
    t.note("a path of about 330 characters", f"ok={r.ok} wrote={w is not None}")
    # Bit depth: Audacity exports 16-bit by default. Look for the preference that changes it.
    _, w = exp("depth-default.wav", [0])
    t.note("default export format", f"{w['bits']}-bit, {w['rate']} Hz", bits=w["bits"])
    home = os.environ.get("NU_AUDACITY_HOME")
    cfg_keys = []
    if home:
        cfg = os.path.join(home, ".config", "audacity", "audacity.cfg")
        if os.path.exists(cfg):
            with open(cfg) as f:
                cfg_keys = [ln.strip() for ln in f if "ExportFormat" in ln or "FileFormats" in ln or "Encoding" in ln]
    t.note("format keys in audacity.cfg after exporting", str(cfg_keys))
    tried = {}
    for key, value in (
        ("/FileFormats/ExportFormat_SF1", "65542"),
        ("/FileFormats/ExportFormat_SF1", "65539"),
        ("/FileFormats/ExportFormat_SF1", "65536"),
        ("/FileFormats/WAV_Encoding", "pcm24"),
        ("/Export/Format", "WAV"),
    ):
        p.do(f'SetPreference: Name="{key}" Value="{value}" Reload="1"')
        _, w = exp(f"depth-{abs(hash(key + value)) % 10**6}.wav", [0])
        tried[f"{key}={value}"] = w and w["bits"]
    t.note("bit depth after SetPreference of the keys tried", str(tried), tried=tried)
    t.check(
        "the default export is 16-bit PCM at the project rate, and none of the keys tried changed it (the delivery depth cannot be set by a pipe command found so far)",
        w and w["bits"] == 16 and all(v == 16 for v in tried.values()),
        str(tried),
    )


@test("A3-T22c", "Undo points per scripted command: which edits Undo can take back (a command with none makes Undo take back the one before)")
def t22c(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    deterministic_exports(p)
    wavtools.write_tone(t.work / "spike6.wav", 6.0, amp=0.1, bursts=[(3.0, 8 / 44100, 0.9)])

    def sel(a=1.0, b=2.0):
        sel_tracks(p, [0])
        p.select_time(a, b)

    def paste_setup():
        sel(1.0, 2.0)
        p.do("Copy")
        sel(4.0, 4.0)

    # (name, setup, command). The setup runs before the state is taken, the command is what is measured.
    cases = [
        ("Amplify", lambda: sel(), "Amplify: Ratio=0.5 AllowClipping=0"),
        ("SetEnvelope", lambda: sel(0, 6), "SetEnvelope: Time=2 Value=0.5"),
        ("ClickRemoval", lambda: sel(2.9, 3.1), "ClickRemoval"),
        ("Silence", lambda: sel(), "Silence"),
        ("Split", lambda: sel(), "Split"),
        ("SplitDelete", lambda: sel(), "SplitDelete"),
        ("Delete", lambda: sel(), "Delete"),
        ("Paste", paste_setup, "Paste"),
        ("NewMonoTrack", lambda: sel(), "NewMonoTrack"),
        ("SetTrackStatus Name", lambda: sel(), 'SetTrackStatus: Name="renamed"'),
        ("SetTrackAudio Mute", lambda: sel(), "SetTrackAudio: Mute=1"),
        ("AddLabel", lambda: sel(), "AddLabel"),
        ("Macro_Narration-Test", lambda: sel(), "Macro_Narration-Test:"),
        ("Import2", lambda: sel(), f'Import2: Filename="{t.work / "spike6.wav"}"'),
        ("RemoveTracks", lambda: sel(), "RemoveTracks"),
    ]
    table = {}
    for name, setup, cmd in cases:
        reset_project(p)
        p.do(f'Import2: Filename="{t.work / "spike6.wav"}"')
        s_import = audio_state(t, "i.wav")
        sel(0.5, 0.5)
        p.do("AddLabel")  # a baseline edit B, so an Undo that takes back nothing of X's takes back B
        s_b = audio_state(t, "b.wav")
        setup()
        r = p.do(cmd, expect_ok=False, timeout=10)
        s_x = audio_state(t, "x.wav")
        if not r.ok:
            table[name] = "refused"
            t.note(f"undo points: {name}", f"{cmd!r} was refused: {r.raw!r}")
            continue
        if s_x == s_b:
            table[name] = "no visible change"
            t.note(f"undo points: {name}", f"{cmd!r} changed nothing the state sees")
            continue
        p.do("Undo")
        s_u = audio_state(t, "u.wav")
        verdict = "1 step" if s_u == s_b else ("0 steps (Undo took back the edit before it)" if s_u == s_import else "other")
        table[name] = verdict
        t.note(f"undo points: {name}", f"one Undo after {cmd!r}: {verdict}", command=cmd, verdict=verdict)
        p.do("Redo")
    t.note("undo points per command", str(table), table=table)
    # What 3.7.7 did. A command that adds no undo point makes the next Undo take back the edit before it (and itself with it).
    expected = {
        "Amplify": 0,
        "ClickRemoval": 0,
        "Silence": 0,
        "SetTrackStatus Name": 0,
        "SetTrackAudio Mute": 0,
        "SetEnvelope": 1,
        "Split": 1,
        "SplitDelete": 1,
        "Delete": 1,
        "Paste": 1,
        "NewMonoTrack": 1,
        "AddLabel": 1,
        "Macro_Narration-Test": 1,
        "Import2": 1,
        "RemoveTracks": 1,
    }
    got = {k: (0 if v.startswith("0") else 1 if v == "1 step" else v) for k, v in table.items()}
    t.check(
        "each command adds the undo points 3.7.7 was measured to add (the adapter's undoSteps follow this table)",
        got == expected,
        f"differences: { {k: (got.get(k), expected.get(k)) for k in set(got) | set(expected) if got.get(k) != expected.get(k)} }",
    )
