"""Rebuilds one fixture: python make_fixtures.py <faster-whisper-small dir> <16 kHz mono wav> <seconds to keep> <out.json> <name>.

The wav comes from the LibriVox mp3 with: ffmpeg -ss <skip> -t <seconds> -i <mp3> -ac 1 -ar 16000 reading.wav
Needs faster-whisper, numpy and scipy.
"""

import base64
import json
import sys

import numpy as np
from faster_whisper import WhisperModel
from scipy.io import wavfile

model_dir, wav, keep, out, name = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5]
rate, a = wavfile.read(wav)
a = a.astype(np.float64) / 32768.0

segments, _ = WhisperModel(model_dir, device="cpu", compute_type="int8").transcribe(a.astype(np.float32), language="en", word_timestamps=True, vad_filter=True)
words = [{"w": w.word.strip(), "t0": round(w.start, 3), "t1": round(w.end, 3), "seg": i} for i, s in enumerate(segments) for w in s.words if w.end < keep - 1]

per = rate // 50
buckets = int(keep * 50)
b = a[: buckets * per].reshape(buckets, per)
min_max = np.empty(2 * buckets, np.int8)
min_max[0::2] = np.clip(np.floor(b.min(1) * 127), -127, 127)
min_max[1::2] = np.clip(np.ceil(b.max(1) * 127), -127, 127)

hop, win = rate // 200, rate // 100
frames = int(keep * 200)
idx = np.arange(win)[None, :] + hop * np.arange(frames)[:, None]
db = 20 * np.log10(np.sqrt((a[idx] ** 2).mean(1) + 1e-12))
level = np.clip(np.round((db + 120) * 2), 0, 255).astype(np.uint8)

fixture = {
    "name": name,
    "words": words,
    "peaks": {
        "startSeconds": 0,
        "bucketsPerSecond": 50,
        "buckets": buckets,
        "minMax": base64.b64encode(min_max.tobytes()).decode(),
        "sampleRate": rate,
        "channels": 1,
    },
    "rms": {"hopSeconds": hop / rate, "windowSeconds": win / rate, "dbBase64": base64.b64encode(level.tobytes()).decode()},
}
with open(out, "w") as handle:
    json.dump(fixture, handle, separators=(",", ":"))
