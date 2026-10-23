"""Spike: faster-whisper on the same clip, int8 CPU as the sidecars run it."""
import sys, time
t0 = time.perf_counter()
from faster_whisper import WhisperModel
t_import = time.perf_counter() - t0
model = WhisperModel(sys.argv[1], device="cpu", compute_type="int8", cpu_threads=int(sys.argv[3]), local_files_only=True)
t_load = time.perf_counter() - t0 - t_import
t1 = time.perf_counter()
import wave, numpy as np
w = wave.open(sys.argv[2]); audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
segments, info = model.transcribe(audio, language="en", beam_size=5, word_timestamps=True)
with open(sys.argv[4], "w") as f:
    for s in segments:
        f.write(s.text + "\n")
print(f"import={t_import:.2f}s load={t_load:.2f}s transcribe={time.perf_counter()-t1:.2f}s audio={info.duration:.0f}s")
