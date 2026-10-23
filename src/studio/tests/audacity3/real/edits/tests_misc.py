"""A3-T30 (Windows named pipes), A3-T32 (interface language) and A3-T33 (Audacity 4 guard)."""

import os
import time

import wavtools
from harness import test
from helpers import new_tone, reset_project, sel_tracks
from pipe import WINDOWS, NotReachable, Pipe, PipeError, Timeout

# Every id the adapter and the Go client send as a batch command, the ones the matrix probes (A3-T2).
BATCH_IDS = [
    "Message",
    "GetInfo",
    "SelectTime",
    "SelectTracks",
    "SetLabel",
    "Import2",
    "Export2",
    "SaveProject2",
    "OpenProject2",
    "SetEnvelope",
    "Amplify",
    "ClickRemoval",
    "SetTrackStatus",
    "SetTrackAudio",
    "GetPreference",
    "SetPreference",
    "Help",
    "Silence",
    "Normalize",
    "Compressor",
]
# And the menu ids (GetInfo Menus), which are scripted by their id as a command with no parameters.
MENU_IDS = [
    "AddLabel",
    "AddLabelPlaying",
    "Record1stChoice",
    "Record2ndChoice",
    "PunchAndRoll",
    "Undo",
    "Redo",
    "Split",
    "SplitDelete",
    "Delete",
    "Copy",
    "Paste",
    "NewMonoTrack",
    "NewStereoTrack",
    "NewLabelTrack",
    "RemoveTracks",
    "SelectAll",
    "SelectNone",
    "SyncLock",
    "Silence",
]


def capture_replies(t, tag):
    """Send the commands of the matrix's A3-T3 and keep the raw bytes of each reply (golden material for the fake)."""
    p = t.pipe
    tone = t.work / "t3.wav"
    wavtools.write_tone(tone, 3.0)
    steps = [
        ("Message", "Message: Text=hello"),
        ("GetInfo Tracks (empty)", "GetInfo: Type=Tracks Format=JSON"),
        ("Import2", f'Import2: Filename="{tone.as_posix()}"'),
        ("GetInfo Tracks", "GetInfo: Type=Tracks Format=JSON"),
        ("GetInfo Clips", "GetInfo: Type=Clips Format=JSON"),
        ("GetInfo Labels (none)", "GetInfo: Type=Labels Format=JSON"),
        ("SelectTime", "SelectTime: Start=1 End=2 RelativeTo=ProjectStart"),
        ("GetInfo Selection", "GetInfo: Type=Selection Format=JSON"),
        ("AddLabel", "AddLabel"),
        ("SetLabel", 'SetLabel: Label=0 Text="raw"'),
        ("GetInfo Labels", "GetInfo: Type=Labels Format=JSON"),
        ("SelectNone", "SelectNone"),
        ("Play", "Play"),
        ("Stop", "Stop"),
        ("Undo", "Undo"),
        ("unknown command", "NoSuchCommand: X=1"),
    ]
    raws = {}
    for name, cmd in steps:
        r = p.do(cmd, expect_ok=False)
        raws[name] = r.raw
        t.note(f"{tag} reply: {name}", repr(r.raw[:160]), raw=r.raw, ms=round(r.seconds * 1000))
    return raws


@test("A3-T30", "Windows named pipes: reply bytes, paths, a modal dialog (windows-latest)", group="windows")
def t30(t):
    p = t.pipe
    if not WINDOWS:
        t.skip("windows", "this test runs on the Windows runner only")
        return
    p.connect(deadline=60)
    p.wait_for_project(limit=90)
    ping = p.do("Message: Text=ping").raw
    t.note("the bytes of a Message reply on Windows", repr(ping), raw=ping, crlf="\r\n" in ping)
    t.check(
        "the pipe answers Message with the text and the framing (CRLF line ends are accepted and noted)",
        ping.replace("\r\n", "\n") == "ping\nBatchCommand finished: OK\n\n",
        repr(ping),
    )
    raws = capture_replies(t, "windows")
    raws = {k: v.replace("\r\n", "\n") for k, v in raws.items()}  # the raw bytes are in the notes above; the checks below read LF
    blank_first = {k: v.startswith("\n") for k, v in raws.items()}
    t.note("replies that start with an empty line on Windows", str(blank_first), blank_first=blank_first)
    t.check(
        "Windows Audacity frames replies like Linux: a command with no text of its own starts with an empty line (the Go client drops it)",
        raws["SelectTime"].startswith("\n") and raws["Message"].startswith("hello"),
        repr(raws["SelectTime"]),
    )
    t.check(
        "an unknown command answers 'was not recognized' and Failed!",
        "was not recognized" in raws["unknown command"] and "Failed!" in raws["unknown command"],
        repr(raws["unknown command"]),
    )
    # Paths: the adapter only sends C:/... forward-slash paths (D72).
    reset_project(p)
    wav = t.work / "w.wav"
    wavtools.write_tone(wav, 4.0, channels=2)
    for label, path in (("a C:/ forward-slash path", wav.as_posix()), ("a backslash path", str(wav))):
        before = len(p.tracks())
        r = p.do(f'Import2: Filename="{path}"', expect_ok=False)
        t.check(f"Import2 takes {label}", r.ok and len(p.tracks()) == before + 1, f"{label}: {path!r} -> {r.raw!r}")
    sel_tracks(p, [0])
    p.select_time(1, 3)
    out = t.work / "export out.wav"
    r = p.do(f'Export2: Filename="{out.as_posix()}" NumChannels=1', expect_ok=False)
    w = wavtools.read_wav(out) if out.exists() else None
    t.check("Export2 to a C:/ path with a space writes the 2 s", r.ok and w is not None and abs(w["seconds"] - 2) < 0.02, f"{r.raw!r} {w and w['seconds']}")
    # Labels at scale (A3-T9's cheap half): 100 AddLabel/SetLabel pairs, one GetInfo.
    t0 = time.monotonic()
    p.select_none()
    for i in range(100):
        p.select_time(i * 0.03, i * 0.03)
        p.do("AddLabel")
    labs = p.labels()
    t.check("100 labels are made and read back", len(labs) == 100, f"{len(labs)} labels in {time.monotonic() - t0:.1f} s")
    # A modal dialog: SaveProject2 into a folder that does not exist holds the pipe, as on Linux.
    try:
        r = p.do('SaveProject2: Filename="C:/this-folder-does-not-exist-nu/x.aup3"', timeout=8, expect_ok=False)
        t.note("SaveProject2 into a missing folder", f"answered {r.raw!r}: no modal dialog")
    except Timeout:
        t.check("SaveProject2 into a missing folder holds the pipe (a modal dialog), as on Linux", True, "no reply in 8 s")


@test("A3-T32", "Interface language (German): terminator, command ids and menu labels", group="edits")
def t32(t):
    p = t.pipe
    p.connect()
    p.wait_for_project()
    cmds = [c["id"] for c in p.do("GetInfo: Type=Commands Format=JSON").json()]
    missing = [i for i in BATCH_IDS if i not in cmds]
    t.check("with the interface in German every batch command id the adapter sends is still there under its English id", not missing, f"missing {missing}")
    menus = p.do("GetInfo: Type=Menus Format=JSON").json()
    ids = {m["id"] for m in menus if isinstance(m, dict) and "id" in m}
    missing = [i for i in MENU_IDS if i not in ids]
    t.check("and every menu id too", not missing, f"missing {missing}")
    labels = [m["label"] for m in menus if isinstance(m, dict) and m.get("depth") == 0]
    t.note("top-level menu labels", str(labels), labels=labels)
    t.check("the menu labels are in German (so no logic may depend on them)", "Datei" in labels and "File" not in labels, str(labels))
    r = p.do("Message: Text=Hallo")
    t.check("the reply terminator stays English: 'BatchCommand finished: OK'", r.raw == "Hallo\nBatchCommand finished: OK\n\n", repr(r.raw))
    r = p.do("NoSuchCommand: X=1", expect_ok=False)
    t.note("the failure text in German", repr(r.raw))
    t.check("Failed! is the same word in the German interface", "BatchCommand finished: Failed!" in r.raw, repr(r.raw))
    new_tone(t, "tone", 3.0)
    p.do("NewMonoTrack")
    names = [x["name"] for x in p.tracks()]
    t.note("default audio track name", str(names), names=names)
    t.check("a new audio track keeps the English default name 'Audio 1' in the German interface (it is not translated)", "Audio 1" in names, str(names))
    p.do('SetTrackStatus: Name="App label track"')
    t.check("a name the app sets is kept as sent", "App label track" in [x["name"] for x in p.tracks()], str([x["name"] for x in p.tracks()]))
    p.select_none()
    p.select_time(1, 1)
    p.do("AddLabel")
    p.do('SetLabel: Label=0 Text="[nu:line abc] Zoë’s"')
    t.check("a label's text round-trips in the German interface", p.labels()[0][3] == "[nu:line abc] Zoë’s", str(p.labels()))
    lt = [x["name"] for x in p.tracks() if x["kind"] == "label"]
    t.note("default label track name", str(lt), names=lt)
    t.check(
        "the default label track name IS translated ('Textmarken 1', English 'Labels 1'): the app must find its own label track by the name it gave it, never by the default",
        lt == ["Textmarken 1"],
        str(lt),
    )


@test("A3-T33", "Audacity 4 guard: a 4.x build still has no scripting pipe", group="audacity4")
def t33(t):
    if not os.environ.get("NU_AUDACITY4_RUNNING"):
        t.skip(
            "audacity 4",
            "no Audacity 4 build is pinned (NU_AUDACITY4_URL and NU_AUDACITY4_SHA256 are unset: the asset could not be looked up from the session that wrote this, and a guess would not be a pin)",
        )
        return
    p = Pipe(timeout=5)
    end = time.time() + 30
    seen = None
    while time.time() < end:
        try:
            p.connect(deadline=1)
            seen = p.do("Message: Text=hello", timeout=5, expect_ok=False).raw
            break
        except (NotReachable, PipeError):
            time.sleep(1)
    t.check("no scripting pipe answers within 30 s of the start (this turns red the day a 4.x build has one)", seen is None, f"a pipe answered {seen!r}")
