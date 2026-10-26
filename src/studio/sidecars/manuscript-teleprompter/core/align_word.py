"""
Stretch decode for punch and roll's offline word time: the words heard in a stretch of the chapter's recording, for the
host to time one script word in.

"Punch from here" needs the time a flagged word was spoken. The host first asks the anchors the live session's
play-position poll recorded (src/studio/desktop/internal/teleprompter/anchors.go); when none brackets the word it runs this
mode once over a stretch of the chapter's recorded audio, through `live_asr.py --align-word`:

    python live_asr.py --align-word 812 --wav take.wav --tail-start 700.0 --tail-end 820.0 \\
        --manuscript manuscript.json --chapter c1 --model tiny --model-dir DIR

It is the tail-audio locate's decode (locate.py) pointed at a stretch: the same checks, the same cut and the same
faster-whisper decoder with Silero VAD and word timestamps, and the same one `heard` line. The host times the word
(src/studio/desktop/internal/scripttrack, `WordTimeEvent`) and adds the stretch's start. There is still no forced
alignment and no model download: `--model-dir` is required.
"""


def check_args(ap, args) -> None:
    """Refuse an alignment the host could never have asked for: the locate's own checks on the recording and the
    range, plus a word inside no chapter and a run that asks for both modes."""
    import locate

    if args.locate:
        ap.error("--align-word and --locate are separate runs")
    locate.check_args(ap, args, mode="--align-word")
    if args.align_word < 0:
        ap.error("--align-word must be a script word index, 0 or more")
