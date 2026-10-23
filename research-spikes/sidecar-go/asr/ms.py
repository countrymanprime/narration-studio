"""Spike: Moonshine base (non-streaming, quantized) through moonshine-voice's Python binding."""
import sys, time, wave
t0 = time.perf_counter()
import numpy as np
from moonshine_voice import ModelArch, Transcriber
t_import = time.perf_counter() - t0
w = wave.open(sys.argv[2]); audio = (np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768).tolist()
t1 = time.perf_counter()
tr = Transcriber(sys.argv[1], ModelArch.BASE)
t_load = time.perf_counter() - t1
t2 = time.perf_counter()
out = tr.transcribe_without_streaming(audio, 16000)
t_run = time.perf_counter() - t2
open(sys.argv[3], "w").write("\n".join(l.text for l in out.lines))
print(f"import={t_import:.2f}s load={t_load:.2f}s transcribe={t_run:.2f}s lines={len(out.lines)}")
