# Real-speech fixtures for the end of a play

Derived data from four LibriVox readings (public domain; librivox.org): the first 200 s of _Alice's Adventures in Wonderland_ chapters 1 and 5,
and the first 300 s (after a 40 s skip) of _The Adventure of the Speckled Band_ chapter 1 and _The Jungle Book_ chapter 1. No audio is committed.

Each file holds:

- `words`: the app's alignment of the reading (`faster-whisper` `small`, `language="en"`, `word_timestamps=True`, `vad_filter=True`, the settings of `sidecars/transcript-compare/core`); `seg` is the recognizer's segment, used as the line.
- `peaks`: the host's peaks (50 buckets a second, signed min and max bytes scaled to ±127), what a play sees.
- `rms`: a 10 ms window level in dB every 5 ms, base64 bytes of `(dB + 120) * 2`; what `realSpeechTail.test.ts` measures with.

`make_fixtures.py` rebuilds them from the audio. `realSpeechTail.test.ts` says what is measured.
