# REAPER's meters, read over ReaScript (2026-10-24)

What `Track_GetPeakInfo` and `Track_GetPeakHoldDB` answer for a record-armed track and for the master, so the Booth's Levels menu can show REAPER's own input and output levels (#2251 item 11, the `daw_meters` capability).

## How it was run

REAPER 7.82 (the pinned Linux tarball) under xvfb with `jackd -d dummy` (48 kHz), an isolated `-cfgfile` and a scratch project, driven by `scripts/ci/real-reaper/drive.py` through a temporary probe scenario that was not committed. `jack_metro -b 600 -f 880 -D 50 -A 0.5` played a click at amplitude 0.5 into both of REAPER's JACK inputs (`REAPER:in1`, `REAPER:in2`). One new track had `I_RECINPUT` 0 (input 1). Each state was sampled six times, a quarter of a second apart.

## What REAPER answered

| State | Track `Track_GetPeakInfo(track, 0 and 1)` | Master `Track_GetPeakInfo` |
| --- | --- | --- |
| Unarmed, monitoring off, click playing | 0 | 0 |
| Armed, monitoring off | 0.32 to 0.50, both channels | 0 |
| Armed, monitoring on | 0.20 to 0.50 | 0.20 to 0.50 |
| Unarmed again, click still playing | 0.34, then 0.009, then 0.0004 | the same fall |
| Armed, click disconnected | about 1e-6 falling to 1e-8 | about 1e-6 falling to 1e-8 |

- `Track_GetPeakInfo` is the meter's own value, a linear peak that falls away within about half a second once the signal stops. It is not a peak since the last read.
- An armed track meters its input whether its monitoring is off or on. An unarmed track does not meter its input.
- The master carries the input only when the armed track's monitoring is on.
- `Track_GetPeakHoldDB` answered in hundredths of a dB: -0.0602 for the 0.5 click (-6.02 dB) and -1.5 (-150 dB) with nothing heard. With its clear flag set it answered -1.5 at once, so it is not a peak since the last read either. The bridge does not use it.
- `Track_GetPeakInfo(track, 1024)` (a flag bit in the channel) answered another value (0.10 to 0.34 on the master); it was not looked into and is not used.

## What the bridge does with it

`daw_meters` (`narration_meters.lua`) answers the louder of channels 0 and 1 for the master and for the first record-armed track, in dBFS to 0.1 dB with -100 for silence, and arms nothing. With no armed track the input is empty and the Booth says so.

## Not run

Windows, a real audio interface and a real voice: row C20 of [the verification pass](../operations/reaper-verification-pass.md#part-c-the-studio-next-daw-commands-not-scripted-yet), pending with the owner. REAPER's "Show input meter when record armed" preference was left at its default and not varied.
