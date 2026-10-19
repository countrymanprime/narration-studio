"""WAV and tone helpers for the edit tests: standard library only (no numpy), 16-bit PCM or 32-bit float WAVs."""

import hashlib
import math
import struct
import wave
from array import array


def write_tone(path, seconds, rate=44100, freq=440.0, amp=0.5, channels=1, bursts=None):
    """A sine tone as 16-bit PCM. `bursts` is [(start_s, length_s, amplitude)] of clicks added on top (a click is a full-scale burst)."""
    n = int(seconds * rate)
    data = array("h", [0] * (n * channels))
    for i in range(n):
        v = int(32767 * amp * math.sin(2 * math.pi * freq * i / rate))
        for c in range(channels):
            data[i * channels + c] = v
    for start, length, a in bursts or []:
        for i in range(int(start * rate), min(n, int((start + length) * rate))):
            for c in range(channels):
                data[i * channels + c] = int(32767 * a)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(data.tobytes())


def read_wav(path):
    """Return dict(rate, channels, bits, seconds, samples=list[float] interleaved, pcm=bytes) for a PCM16 or float32 WAV."""
    with open(path, "rb") as f:
        b = f.read()
    if len(b) < 12 or b[:4] != b"RIFF" or b[8:12] != b"WAVE":
        raise ValueError(f"{path} is not a RIFF WAVE file")
    fmt = data = None
    p = 12
    while p + 8 <= len(b):
        cid, size = b[p : p + 4], struct.unpack_from("<I", b, p + 4)[0]
        body = b[p + 8 : p + 8 + size]
        if cid == b"fmt ":
            fmt = struct.unpack_from("<HHIIHH", body)
        elif cid == b"data":
            data = body
        p += 8 + size + (size & 1)
    if fmt is None or data is None:
        raise ValueError(f"{path}: no fmt or data chunk")
    tag, channels, rate, _, _, bits = fmt
    if tag == 3 and bits == 32:
        samples = list(struct.unpack(f"<{len(data) // 4}f", data[: len(data) // 4 * 4]))
    elif tag in (1, 0xFFFE) and bits == 16:
        samples = [s / 32768 for s in struct.unpack(f"<{len(data) // 2}h", data[: len(data) // 2 * 2])]
    elif tag in (1, 0xFFFE) and bits == 24:
        samples = [int.from_bytes(data[i : i + 3], "little", signed=True) / 8388608 for i in range(0, len(data) - 2, 3)]
    else:
        raise ValueError(f"{path}: unsupported format tag {tag} bits {bits}")
    return {"rate": rate, "channels": channels, "bits": bits, "seconds": len(samples) / channels / rate, "samples": samples, "pcm": data}


def rms(samples):
    return math.sqrt(sum(s * s for s in samples) / len(samples)) if samples else 0.0


def peak(samples):
    return max((abs(s) for s in samples), default=0.0)


def db(x):
    return 20 * math.log10(x) if x > 0 else -200.0


def window(wav, start, end):
    """The samples of channel 0 between start and end seconds."""
    ch, rate = wav["channels"], wav["rate"]
    a, b = int(start * rate), int(end * rate)
    return wav["samples"][a * ch : b * ch : ch]


def rms_db(wav, start, end):
    return db(rms(window(wav, start, end)))


def pcm_hash(wav):
    return hashlib.sha256(wav["pcm"]).hexdigest()[:16]
