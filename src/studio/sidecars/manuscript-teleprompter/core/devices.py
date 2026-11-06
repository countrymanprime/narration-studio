"""
Input device enumeration for the Manuscript Teleprompter live sidecar (see
docs/architecture/manuscript-teleprompter.md, "Device enumeration").

Spike outcome: PyAV *can* list Windows `dshow` devices without shelling out to ffmpeg directly. FFmpeg's
"list_devices" mode is not a real capture - opening it always raises after
printing the device list to its own log - but PyAV's log capture
(`av.logging.Capture`) receives that log text as a sequence of
`(level, context, message)` records, one FFmpeg log "context" per source
(here `"dshow"`). This sidecar makes no other use of FFmpeg's log, and
`av.logging.Capture(local=True)` only intercepts calls made on the current
thread while the context manager is open, so nothing else is affected. The
capture only receives what the log level lets through, and PyAV's default
level is off, so `capture_dshow_log` raises it to INFO for the listing and
restores it afterwards.

FFmpeg's dshow lister prints two lines per device, e.g.:
    "Microphone Array (Realtek(R) Audio)" (audio)
      Alternative name "@device_cm_{...}\\wave_{...}"
but PyAV's log callback fires once per internal `av_log()` call, so one
logical line can arrive split into several short fragments (`'"Name"'`,
`' (audio'`, `')'`, `'\\n'`). `_join_context_lines` reassembles them (by
FFmpeg log context, in arrival order) before parsing.

Verified on real hardware (2026-09-22, see manuscript-teleprompter.md for the
full note): every device this module lists with kind "audio" opens
successfully through the exact `av.open(file=f"audio={name}", format="dshow")`
call `iter_microphone_chunks` uses, and closes cleanly - the name that is
listed is the name that opens.

Duplicate device names: FFmpeg disambiguates same-named devices with a
device-manager "Alternative name" (a stable `@device_...` path). The listing
gives devices that share a friendly name distinct names ("Name (1)", "Name
(2)", in FFmpeg's order) and `open_target` turns such a name back into the
alternative name, which `audio=` accepts in place of the friendly name. A name
that is alone is listed and opened exactly as FFmpeg names it, the form verified
on real hardware. The collision case is covered by tests over recorded-format
log entries only: no duplicate audio device names existed on the development
machine.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass, replace

# One captured FFmpeg log record: (level, context, message). `context` is the
# component name FFmpeg logs under ("dshow" for this device lister); PyAV
# sets it to `None` for some records, which this module simply ignores.
LogEntry = tuple[int, str | None, str]

_DEVICE_LINE = re.compile(r'^"(?P<name>.*)"\s\((?P<kind>audio|video|none)\)$')
_ALTERNATIVE_NAME_LINE = re.compile(r'^\s*Alternative name "(?P<alternative>.*)"$')


@dataclass(frozen=True)
class Device:
    name: str
    kind: str  # "audio" | "video" | "none", ffmpeg's own dshow categories
    alternative_name: str | None = None
    shared_name: bool = False  # another device has this friendly name, so `name` carries a "(n)" suffix

    def to_json(self) -> dict:
        # Only the name is exposed: it is the one value the capture path needs, and `open_target` maps it back to what
        # dshow opens (see the module docstring on duplicate names).
        return {"name": self.name}


def _join_context_lines(entries: list[LogEntry]) -> list[str]:
    """FFmpeg logs the dshow device list under the "dshow" context, but PyAV may split one logical line into several log
    callbacks; concatenate every "dshow" message in arrival order and split back into lines on the newlines it already
    contains."""
    joined = "".join(message for _level, context, message in entries if context == "dshow")
    return joined.splitlines()


def parse_device_list(entries: list[LogEntry]) -> list[Device]:
    """Turn PyAV's captured ffmpeg log entries (from listing dshow devices) into the devices ffmpeg reported, in its own
    order. An "Alternative name" line attaches to the device line immediately before it; a line matching neither pattern
    (blank lines, ffmpeg's own banner if the log level is verbose enough to include it) is ignored."""
    devices: list[Device] = []
    for line in _join_context_lines(entries):
        device_match = _DEVICE_LINE.match(line)
        if device_match:
            devices.append(Device(name=device_match.group("name"), kind=device_match.group("kind")))
            continue
        alternative_match = _ALTERNATIVE_NAME_LINE.match(line)
        if alternative_match and devices:
            devices[-1] = Device(name=devices[-1].name, kind=devices[-1].kind, alternative_name=alternative_match.group("alternative"))
    return devices


def capture_dshow_log() -> list[LogEntry]:
    """Ask ffmpeg (through PyAV) to list its dshow devices and capture the log lines it prints, instead of any capture
    output: `list_devices` is a listing mode, so opening it this way always raises, and that is expected and discarded.

    FFmpeg prints the list at INFO, but PyAV's default log level is None (FFmpeg logging off), so a capture at the
    default level receives nothing and every machine looks microphone-less. The level is raised to INFO for the listing
    only (never lowered if something already made it more verbose) and put back afterwards, even on failure, so the
    rest of the sidecar does not start relaying FFmpeg's log."""
    import av
    import av.logging

    previous_level = av.logging.get_level()
    if previous_level is None or previous_level < av.logging.INFO:
        av.logging.set_level(av.logging.INFO)
    try:
        with av.logging.Capture(local=True) as log:
            try:
                av.open(file="dummy", format="dshow", options={"list_devices": "true"})
            except Exception:  # noqa: BLE001, S110 - listing always raises (see module docstring); the log, not the exception, is the result
                pass
    finally:
        if av.logging.get_level() != previous_level:
            av.logging.set_level(previous_level)
    return list(log)


def list_input_devices(capture: Callable[[], list[LogEntry]] = capture_dshow_log) -> tuple[list[Device], str | None]:
    """The audio input devices the capture path (`iter_microphone_chunks`) can open, listed by the same name dshow opens
    them under. Never raises: a listing failure returns an empty list and a message instead, so it can never block Start."""
    try:
        entries = capture()
    except Exception as error:  # noqa: BLE001 - defensive: a missing ffmpeg/dshow backend (e.g. off Windows) must not crash the sidecar
        return [], f"Could not list input devices: {error}"
    devices = _distinct_names([device for device in parse_device_list(entries) if device.kind == "audio"])
    return devices, None


def _distinct_names(devices: list[Device]) -> list[Device]:
    """Suffix the devices that share a friendly name with "(1)", "(2)", ... in listing order, and leave the rest alone."""
    totals: dict[str, int] = {}
    for device in devices:
        totals[device.name] = totals.get(device.name, 0) + 1
    seen: dict[str, int] = {}
    distinct: list[Device] = []
    for device in devices:
        if totals[device.name] == 1:
            distinct.append(device)
            continue
        seen[device.name] = seen.get(device.name, 0) + 1
        distinct.append(replace(device, name=f"{device.name} ({seen[device.name]})", shared_name=True))
    return distinct


def open_target(name: str, capture: Callable[[], list[LogEntry]] = capture_dshow_log) -> str:
    """What dshow opens for a listed `name`: the alternative name of a device that shares its friendly name with another,
    otherwise `name` itself. A name nobody lists, or a listing that fails, opens as given, so this never blocks Start."""
    devices, _error = list_input_devices(capture)
    for device in devices:
        if device.name == name and device.shared_name and device.alternative_name:
            return device.alternative_name
    return name
