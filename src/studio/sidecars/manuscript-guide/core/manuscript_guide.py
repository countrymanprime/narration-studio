"""The Story Bible's model work: the language model's entities, pronunciations and Piper previews.

The host builds and edits the Story Bible itself (src/studio/desktop/internal/guide). This program does what needs Python: spaCy's
entity spans for a build (``entities``), the automatic pronunciation of names or one named source's (``pronunciation``), one source's
answer for one word (``candidate``), a spoken preview (``render-audio``), GLiNER's and BookNLP's suggestions (``suggest``) and the packaged
self-check. It reads the project's canonical ``<app>/manuscript/manuscript.json``.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import wave
from pathlib import Path
from typing import Any

_SHARED_PYTHON = Path(__file__).resolve().parents[5] / "src" / "studio" / "libs" / "python"
if str(_SHARED_PYTHON) not in sys.path:
    sys.path.insert(0, str(_SHARED_PYTHON))
# providers.py is this sidecar's own sibling module; a test that spec-loads this file does not have core/ on sys.path
# the way running the script directly does, so this mirrors the _SHARED_PYTHON insertion above.
_CORE_DIR = Path(__file__).resolve().parent
if str(_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(_CORE_DIR))

from narration_common import manuscript as canonical_manuscript
from narration_common.config import get_default
from narration_common.logging_utils import log, set_log_file
from narration_common.ports.pronunciation import SOURCES
from narration_common.ports.tts import ENGINES as TTS_ENGINES

# Importing this also registers Piper into ENGINES and CMU/eSpeak into SOURCES.
from providers import load_voice, synthesize_to_file

# The characters that end a sentence, for sentence_around.
SENTENCE_END_CHARACTERS = ".!?…"
# Verbs that mark a name next to a quotation as its speaker, and how far from it a tag may be: BookNLP's speaker check
# (extraction_booknlp.py) uses both, as the host's dialogue cues do (src/studio/desktop/internal/guide/rules_text.go). Narrower than the
# words the host's classify reads as a person nearby ("smiled", "walked", "looked", "thought"): only an unambiguous speech verb counts.
SPEECH_VERBS = {
    "said",
    "asked",
    "replied",
    "cried",
    "whispered",
    "murmured",
    "shouted",
    "answered",
    "exclaimed",
    "muttered",
    "called",
    "continued",
    "added",
    "interrupted",
    "announced",
    "demanded",
    "gasped",
    "laughed",
    "stated",
    "remarked",
    "snapped",
    "yelled",
}
TAG_WINDOW = 60


def load_manuscript(path: str) -> list[dict[str, str]]:
    data = canonical_manuscript.load_file(path)
    narratable_ids = {chapter["id"] for chapter in data["chapters"] if chapter.get("contentKind", "narration") == "narration"}
    paragraphs = [
        {"chapter": item["chapterTitle"], "chapterId": item["chapterId"], "paragraphId": item["id"], "text": item["text"]}
        for item in data["paragraphs"]
        if item["chapterId"] in narratable_ids
    ]
    if not paragraphs:
        raise ValueError("The manuscript has no readable text paragraphs.")
    return paragraphs


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


# The longest quote, in characters, a GLiNER or BookNLP suggestion takes from the sentence its name is in. The host's rules use the
# same window (src/studio/desktop/internal/guide/rules_text.go sentenceAround).
MAX_QUOTE = 300


def sentence_around(text: str, start: int, end: int) -> str:
    """The sentence of ``text`` holding ``text[start:end]``, trimmed, or a window of at most MAX_QUOTE characters around
    it when the sentence is longer. Always a slice of ``text``."""
    left = max((text.rfind(mark, 0, start) for mark in SENTENCE_END_CHARACTERS), default=-1) + 1
    ends = [at for at in (text.find(mark, end) for mark in SENTENCE_END_CHARACTERS) if at >= 0]
    right = min(ends) + 1 if ends else len(text)
    if right - left > MAX_QUOTE:
        room = max(0, MAX_QUOTE - (end - start)) // 2
        left = max(left, start - room)
        right = min(right, left + MAX_QUOTE)
    # A sentence that starts after a closing quote or bracket starts with it; drop it, keeping a slice of the text.
    return text[left:right].strip().lstrip("”’)] ")


# The narrator's choices for --source: the pronunciation source registry's own names.
PRONUNCIATION_SOURCES = SOURCES.names()


def pronounce_source(name: str, espeak_library: str | None, source: str) -> dict[str, str]:
    """Gets a pronunciation from exactly one named source, raising when that source has nothing for ``name``.

    Unlike ``pronunciation()`` (the automatic CMU-then-eSpeak fallback used at build time, which never raises), this
    is what the narrator's explicit Generate/Replace control asks for (``pronunciation --source``): the narrator chose the source, so a
    miss is reported, not silently swallowed into "not generated".
    """
    engine = SOURCES.lookup(source)
    engine.espeak_library = espeak_library
    # The value names its source by the registry name, not the adapter's display label.
    return {**engine.pronounce(name), "source": source}


# The narrator's own pronunciation. It is a provenance id, not a registered source: it is never looked
# up, so it is not in SOURCES and ``pronunciation --source`` does not offer it. A file written before docs/guides/using-the-app/story-bible.md#how-you-say-each-name says ``user``.
MANUAL_SOURCE = "manual"
LEGACY_MANUAL_SOURCE = "user"


def read_pronunciation_source(value: dict[str, Any]) -> dict[str, Any]:
    """``value`` with a legacy ``user`` source read as ``manual``, in the value and in its alternate; nothing else changes."""
    out = dict(value)
    if out.get("source") == LEGACY_MANUAL_SOURCE:
        out["source"] = MANUAL_SOURCE
    if isinstance(out.get("alternate"), dict):
        out["alternate"] = read_pronunciation_source(out["alternate"])
    return out


def pronunciation(name: str, espeak_library: str | None, default_source: str | None = None) -> dict[str, str]:
    # CMU is quick and high-quality for familiar names. It cannot cover most fantasy names.
    # Read-only/generated-only: there is no user-editable "say it as" respelling
    # any more, so this never needs to round-trip anything but the IPA itself.
    order = SOURCES.fallback_order()
    # default_source (the settings default) only reorders the chain: an
    # unregistered value (a stale setting from a removed source) is ignored rather than raising, and every other
    # source is still tried afterwards in its usual order if the preferred one has nothing for this name.
    if default_source and default_source in order:
        order = [default_source, *(source for source in order if source != default_source)]
    for source in order:
        try:
            return pronounce_source(name, espeak_library, source)
        except Exception as exc:  # noqa: BLE001
            adapter = SOURCES.lookup(source)
            log(f"{getattr(adapter, 'unavailable_log', adapter.descriptor.label + ' unavailable')} ({exc}).")
    return {"ipa": "", "source": "not generated", "confidence": "unknown"}


def load_json(path: str) -> dict[str, Any] | None:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    # A handful of guide manifests from an earlier schema store a plain alias
    # name instead of {text, pronunciation, occurrences}; normalize once here
    # so every downstream reader can assume the current shape.
    for entity in data.get("entities", []) if isinstance(data, dict) else []:
        aliases = entity.get("aliases")
        if isinstance(aliases, list):
            entity["aliases"] = [alias if isinstance(alias, dict) else {"text": alias, "pronunciation": {}, "occurrences": []} for alias in aliases]
        for holder in [entity, *(alias for alias in entity.get("aliases") or [] if isinstance(alias, dict))]:
            if isinstance(holder.get("pronunciation"), dict):
                holder["pronunciation"] = read_pronunciation_source(holder["pronunciation"])
    return data


def find_entity(guide: dict[str, Any], entity_id_value: str) -> dict[str, Any]:
    entity = next((value for value in guide["entities"] if value["id"] == entity_id_value), None)
    if entity is None:
        raise ValueError("Entity not found.")
    return entity


# Character/Place/Organization/Needs Review are the only categories extraction produces; Lore/Item/Event are manual-only classifications a
# narrator assigns themselves. GLiNER's suggestions name these (extraction_gliner.py).
VALID_CATEGORIES = {"Character", "Place", "Organization", "Lore", "Item", "Event"}


MAX_CANDIDATE_WORD = 80


def candidate(args: argparse.Namespace) -> None:
    """Prints one JSON line for one word from one source: ``{"ok": true, "say": ...}`` or ``{"ok": false, "reason": ...}``.

    Stateless: it reads no guide and writes no file, so trying a source on a word changes nothing. A miss is a sentence naming the
    source and the word. A word that is blank, longer than ``MAX_CANDIDATE_WORD`` characters or holds a newline or NUL is refused
    before any lookup.
    """
    word = (args.word or "").strip()
    if not word or len(word) > MAX_CANDIDATE_WORD or any(char in word for char in "\r\n\0"):
        raise ValueError(f"A word to try is one line of 1 to {MAX_CANDIDATE_WORD} characters.")
    try:
        say = pronounce_source(word, args.espeak_library or None, args.source)["ipa"]
    except Exception as exc:  # noqa: BLE001
        result: dict[str, Any] = {"ok": False, "reason": f'{SOURCES.lookup(args.source).descriptor.label} has no pronunciation for "{word}": {exc}'}
    else:
        result = {"ok": True, "say": say}
    print(json.dumps(result, ensure_ascii=False))


def lookup_pronunciations(args: argparse.Namespace) -> None:
    """Prints ``pronunciation()`` for each word, in order, one JSON line each: the whole value (``ipa``, ``source``, ``confidence``).

    Stateless, like ``candidate``: it reads no guide and writes no file. The host asks for it when it creates an entry or adds an alias
    (each ``--word``, stripped, a blank one refused) and for every name a Story Bible build keeps (``--words-file``, a JSON list of the
    names exactly as the build found them, in one process for the whole book, since a book's names would not fit on a Windows command
    line). The value is the automatic one, the ``--default-source`` first and then the usual CMU, eSpeak and Wiktextract order, and a word
    nothing knows is the ``not generated`` value, never an error.

    With ``--source`` each word is asked of that source alone (``pronounce_source``), for the narrator's Generate/Replace, which the host
    applies to the Story Bible itself (src/studio/desktop/internal/guide/pronounce.go): the value, or ``{"miss": reason}`` when the source
    has nothing for the word or fails on it, the reason being the exception's text (its type's name when it has none). The
    ``--default-source`` is not used, and a words file may then hold an empty name, which is asked as it is.
    """
    words_file = getattr(args, "words_file", "")
    source = getattr(args, "source", None)
    if bool(args.word) == bool(words_file):
        raise ValueError("Give the words to look up as --word or as --words-file, not both.")
    if words_file:
        words = json.loads(Path(words_file).read_text(encoding="utf-8"))
        if not isinstance(words, list) or not all(isinstance(word, str) and (word or source) for word in words):
            raise ValueError("The words file is not a list of names.")
    else:
        words = [word.strip() for word in args.word]
        if any(not word or "\0" in word for word in words):
            raise ValueError("A word to look up is not blank.")
    for word in words:
        if source:
            try:
                value: dict[str, Any] = pronounce_source(word, args.espeak_library or None, source)
            except Exception as exc:  # noqa: BLE001 - the host shows the narrator why, whatever it was
                value = {"miss": str(exc) or type(exc).__name__}
        else:
            value = pronunciation(word, args.espeak_library or None, args.default_source or None)
        print(json.dumps(value, ensure_ascii=False))


# How long ``entities`` waits for the host's words file, and how often it looks: the host writes it as soon as it has read the spans.
WORDS_FILE_TIMEOUT = 600.0
WORDS_FILE_POLL = 0.02


def entities(args: argparse.Namespace) -> None:
    """``entities``: the language model's entities in each narrated paragraph, for the host's Story Bible build
    (src/studio/desktop/internal/guide/build.go), which does everything else with them. It writes nothing.

    The first line is ``{"available": true}``, then one line per paragraph in manuscript order, ``{"paragraphId", "entities"}``, each
    entity ``[start, end, label]`` (spaCy's ``start_char``, ``end_char`` and ``label_``, every label, in code points). A model that cannot
    be loaded is logged and answered ``{"available": false}``, and the host falls back to its rules, as the build always has.

    With ``--words-file`` the same process then answers the pronunciations, so a build starts one process as it always has: it waits for
    the host to write the file (a JSON list of the names the build keeps, which the host makes from these spans) and prints
    ``pronunciation()`` of each, one line each, as the ``pronunciation`` command does.
    """
    paragraphs = load_manuscript(args.manuscript)
    try:
        import spacy

        nlp = spacy.load(args.spacy_model, disable=["parser", "lemmatizer", "textcat"])
    except Exception as exc:  # Local rule extraction is a supported fallback.  # noqa: BLE001
        log(f"WARNING: spaCy model unavailable ({exc}); using lower-quality rules-only extraction.")
        print(json.dumps({"available": False}), flush=True)
    else:
        print(json.dumps({"available": True}))
        for paragraph, doc in zip(paragraphs, nlp.pipe(p["text"] for p in paragraphs), strict=True):
            print(json.dumps({"paragraphId": paragraph["paragraphId"], "entities": [[ent.start_char, ent.end_char, ent.label_] for ent in doc.ents]}))
        sys.stdout.flush()
    if not args.words_file:
        return
    deadline = time.monotonic() + WORDS_FILE_TIMEOUT
    while not Path(args.words_file).is_file():
        if time.monotonic() > deadline:
            raise ValueError("The Story Bible build never asked for its pronunciations.")
        time.sleep(WORDS_FILE_POLL)
    lookup_pronunciations(argparse.Namespace(word=None, words_file=args.words_file, espeak_library=args.espeak_library, default_source=args.default_source))


def _phoneme_block(ipa: str) -> str | None:
    """Piper's own inline raw-phoneme escape (``"[[ ... ]]"``, ``PiperVoice.phonemize``) skips its espeak
        text-to-phoneme step, speaking exactly the stored symbols instead of re-guessing them from the spelled name
    . ``None`` when ``ipa`` is empty or would break out of the block early.
    """
    text = ipa.strip()
    if not text or "]]" in text:
        return None
    return f"[[{text}]]"


def spoken_form(holder: dict[str, Any] | None, name: str) -> str:
    """What a preview should hand to Piper for ``holder`` (an entity or an alias): its chosen pronunciation as
    raw phonemes when it has one and it converts cleanly, else the spelled ``name``, exactly as before this phase.
    An auto-generated pronunciation the narrator never picked (the host marks the one it sets ``chosen``)
    must not silently change what the preview says.
    """
    pronunciation = (holder or {}).get("pronunciation") or {}
    if not pronunciation.get("chosen"):
        return name
    block = _phoneme_block(str(pronunciation.get("ipa", "")))
    return block if block is not None else name


def render_audio(args: argparse.Namespace) -> None:
    guide = load_json(args.guide)
    if not guide:
        raise ValueError("Guide file does not exist; build it first.")
    entity = find_entity(guide, args.entity_id)
    if not args.piper_model:
        raise ValueError("Install a verified Piper voice before creating previews.")
    if args.alias_index is None:
        holder = entity
        name = entity["canonical_name"]
        filename = args.output_name or f"{entity['id']}.wav"
    else:
        aliases = entity.get("aliases", [])
        if not 0 <= args.alias_index < len(aliases):
            raise ValueError("Alias index out of range.")
        holder = aliases[args.alias_index]
        name = holder["text"]
        filename = args.output_name or f"{entity['id']}__alias{args.alias_index}.wav"
    spoken = spoken_form(holder, name)
    audio_dir = Path(args.audio_dir)
    audio_dir.mkdir(parents=True, exist_ok=True)
    destination = audio_dir / filename
    # Piper is bundled into this existing sidecar by PyInstaller.  Calling its
    # supported Python API avoids relying on a checkout-local piper.exe or
    # adding a third Python sidecar to the native host.
    try:
        voice = load_voice(args.piper_model)
    except Exception as exc:
        raise ValueError(f"The preview voice could not be loaded ({exc}). If its files are damaged, remove it in Settings and install it again.") from exc
    synthesize_to_file(voice, spoken, destination)
    print("AUDIO|" + str(destination))


SELF_CHECK_WORD = "hello"


def check_cmudict() -> str:
    """Looks a common word up in the CMU dictionary. A frozen build without the dictionary's data or package metadata fails here."""
    import pronouncing

    phones = pronouncing.phones_for_word(SELF_CHECK_WORD)
    if not phones:
        raise ValueError(f"the CMU dictionary has no entry for {SELF_CHECK_WORD!r}")
    return f"{SELF_CHECK_WORD} = {phones[0]}"


def check_espeak(data_dir: Path | None = None) -> str:
    """Starts Piper's bundled espeak-ng and phonemizes a common word. A frozen build without ``piper/espeak-ng-data`` fails here."""
    from piper.phonemize_espeak import ESPEAK_DATA_DIR, EspeakPhonemizer

    directory = Path(data_dir) if data_dir is not None else Path(ESPEAK_DATA_DIR)
    if not directory.is_dir():
        raise ValueError(f"the espeak-ng data directory was not found: {directory}")
    sentences = EspeakPhonemizer(directory).phonemize("en-us", SELF_CHECK_WORD)
    phonemes = "".join("".join(sentence) for sentence in sentences)
    if not phonemes.strip():
        raise ValueError(f"espeak-ng produced no phonemes for {SELF_CHECK_WORD!r}")
    return f"{SELF_CHECK_WORD} = {phonemes}"


def check_synthesis(piper_model: str) -> str:
    """Loads a voice and speaks one word into a temporary file, the whole render-audio path without a project."""
    import tempfile

    voice = load_voice(piper_model)
    with tempfile.TemporaryDirectory() as temporary:
        destination = Path(temporary) / "self-check.wav"
        synthesize_to_file(voice, SELF_CHECK_WORD, destination)
        with wave.open(str(destination), "rb") as wav_file:
            frames = wav_file.getnframes()
    return f"spoke {SELF_CHECK_WORD!r}: {frames} frames"


def run_self_check(
    piper_model: str | None = None,
    espeak_data_dir: Path | None = None,
    gliner_install: str | None = None,
    booknlp_installs: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Runs every check, never stopping at the first failure, and returns one result per check.

    The packaged-app smoke test (the program run with ``--smoke``) runs this against the frozen sidecar. The dictionary and the espeak-ng
    data are what a freeze can silently lose (PyInstaller has no hook for either), and losing them made previews fail and names lose
    their pronunciation. ``tool-runtime`` proves the freeze carries what the optional analysis tools import (``check_freeze``). The 114
    MB voice is not needed for them; pass ``piper_model`` to also speak a word. Given the folder the
    optional GLiNER download is installed in (the smoke test passes it), the last line reports its version, or "not installed",
    which passes (``extraction_gliner.self_check``). Given BookNLP's install folders, best first, a ``booknlp`` line does the same
    (``extraction_booknlp.self_check``).
    """
    import extraction_booknlp

    checks: list[tuple[str, Any]] = [("cmudict", check_cmudict), ("espeak", lambda: check_espeak(espeak_data_dir))]
    if piper_model:
        checks.append(("synthesis", lambda: check_synthesis(piper_model)))
    checks.append(("tool-runtime", extraction_booknlp.check_freeze))
    results: list[dict[str, Any]] = []
    for name, check in checks:
        try:
            results.append({"name": name, "ok": True, "detail": check()})
        except Exception as exc:  # noqa: BLE001 - the report says why, whatever it was
            results.append({"name": name, "ok": False, "detail": str(exc) or type(exc).__name__})
    if gliner_install is not None:
        import extraction_gliner

        results.append(extraction_gliner.self_check(gliner_install))
    if booknlp_installs is not None:
        import extraction_booknlp

        results.append(extraction_booknlp.self_check(list(booknlp_installs)))
    return results


def self_check(args: argparse.Namespace) -> None:
    results = run_self_check(
        piper_model=args.piper_model or None,
        gliner_install=args.gliner_install or None,
        booknlp_installs=getattr(args, "booknlp_install", None) or None,
    )
    ok = all(entry["ok"] for entry in results)
    print(json.dumps({"ok": ok, "checks": results}))
    if not ok:
        sys.exit(1)


def _capability_row(descriptor) -> dict:
    """One row of a `capabilities` report: a Descriptor's label, platforms and modes, plus its asset kind when it
    has one (TtsDescriptor only). "loadable" is always null: this reports registration only, never whether the row
    actually loads - the same shape live_asr.py's --capabilities uses."""
    row = {"label": descriptor.label, "platforms": list(descriptor.platforms), "modes": list(descriptor.modes), "loadable": None}
    asset_kind = getattr(descriptor, "asset_kind", "")
    if asset_kind:
        row["asset"] = asset_kind
    return row


def capabilities_report(engines=TTS_ENGINES, sources=SOURCES) -> dict:
    """`capabilities`: every row this sidecar process has actually registered in ENGINES (voice engines) and SOURCES
    (pronunciation) by the time this runs - after `providers` module-level registration, before any voice or source is
    touched. `engines`/`sources` are overridable so a test can stand in a reduced registry for "an adapter failed to
    register" without needing a real broken import."""
    return {
        "type": "capabilities",
        "tts": {engine.descriptor.name: _capability_row(engine.descriptor) for engine in engines},
        "pronunciation": {source.descriptor.name: _capability_row(source.descriptor) for source in sources},
    }


def capabilities(args: argparse.Namespace) -> None:
    print(json.dumps(capabilities_report()))


def suggest(args: argparse.Namespace) -> None:
    """`suggest`: one source's suggestions as JSON lines; it writes nothing (GLiNER: extraction_gliner.py, SN-X71; BookNLP:
    extraction_booknlp.py, SN-X72). The rules source runs in the host (src/studio/desktop/internal/guide/rules.go)."""
    if args.source == "booknlp":
        import extraction_booknlp

        extraction_booknlp.suggest(args)
        return
    import extraction_gliner

    extraction_gliner.suggest(args)


def use_utf8_stdio() -> None:
    """Writes UTF-8 to the pipes the host reads.

    On Windows a pipe defaults to the ANSI code page, so a project path outside it made
    ``print("AUDIO|" + path)`` raise after the WAV was written and the sidecar exit 1.
    The Go host reads both streams as UTF-8 (strings are bytes there).
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    use_utf8_stdio()
    parser = argparse.ArgumentParser(description=__doc__)
    command = parser.add_subparsers(dest="command", required=True)
    entities_parser = command.add_parser("entities", help="print the language model's entities in each paragraph, one JSON line each; writes nothing")
    entities_parser.add_argument("--manuscript", required=True)
    entities_parser.add_argument("--spacy-model", default=get_default("ManuscriptGuide", "spacy_model", "en_core_web_sm"))
    entities_parser.add_argument("--log")
    entities_parser.add_argument("--words-file", default="", help="then wait for this JSON list of names and print their pronunciations")
    entities_parser.add_argument("--espeak-library", default="")
    entities_parser.add_argument("--wiktextract-index", default="")
    entities_parser.add_argument("--default-source", default=get_default("ManuscriptGuide", "default_pronunciation_source", ""))
    candidate_parser = command.add_parser("candidate")
    candidate_parser.add_argument("--word", required=True)
    candidate_parser.add_argument("--source", required=True, choices=sorted(PRONUNCIATION_SOURCES))
    candidate_parser.add_argument("--espeak-library", default="")
    candidate_parser.add_argument("--wiktextract-index", default="")
    lookup_parser = command.add_parser("pronunciation", help="print the automatic pronunciation of each --word, one JSON line each; writes nothing")
    lookup_parser.add_argument("--word", action="append")
    lookup_parser.add_argument("--words-file", default="", help="a JSON list of the words, each looked up as it is")
    lookup_parser.add_argument("--log")
    lookup_parser.add_argument("--espeak-library", default="")
    lookup_parser.add_argument("--wiktextract-index", default="")
    lookup_parser.add_argument("--default-source", default=get_default("ManuscriptGuide", "default_pronunciation_source", ""))
    lookup_parser.add_argument("--source", default=None, choices=sorted(PRONUNCIATION_SOURCES), help="ask only this source; a miss is a reason")
    audio_parser = command.add_parser("render-audio")
    audio_parser.add_argument("--guide", required=True)
    audio_parser.add_argument("--entity-id", required=True)
    audio_parser.add_argument("--audio-dir", required=True)
    audio_parser.add_argument("--piper-model", required=True)
    audio_parser.add_argument("--alias-index", type=int, default=None)
    audio_parser.add_argument("--output-name", default="")
    check_parser = command.add_parser("self-check", help="prove the dictionary and the espeak-ng data this program carries load (the packaged smoke test)")
    check_parser.add_argument("--piper-model", default="", help="also load this voice and speak one word")
    check_parser.add_argument("--gliner-install", default="", help="the GLiNER download's install folder, to report its version")
    check_parser.add_argument("--booknlp-install", action="append", help="a BookNLP download's install folder, best first, to report its version")
    suggest_parser = command.add_parser("suggest", help="print one source's Story Bible suggestions, one JSON line each; writes nothing")
    suggest_parser.add_argument("--source", choices=("gliner", "booknlp"), required=True, help="the rules run in the host, not here")
    suggest_parser.add_argument("--install", default="", help="the source's install folder (gliner, booknlp)")
    suggest_parser.add_argument("--spacy-model", default="", help="the spaCy model BookNLP parses with: an installed model's folder or a name")
    suggest_parser.add_argument("--manuscript", required=True)
    suggest_parser.add_argument("--guide", required=True)
    command.add_parser(
        "capabilities",
        help="print every row this process has registered in ENGINES (voice engines) and SOURCES (pronunciation), by "
        "port then name (one JSON object: {type: capabilities, tts, pronunciation}; registration only, not verified)",
    )
    args = parser.parse_args()
    wiktextract_index = getattr(args, "wiktextract_index", "") or None
    if wiktextract_index:
        # Set once per process on the registered singleton: the path never changes between calls within one
        # invocation, so there is nothing to gain from threading it through pronunciation()/pronounce_source() the way
        # --espeak-library is, and every call site that already builds a pronunciation keeps working unchanged.
        SOURCES.lookup("wiktextract").index_path = wiktextract_index
    log_handle = None
    if getattr(args, "log", None):
        path = Path(args.log)
        path.parent.mkdir(parents=True, exist_ok=True)
        log_handle = path.open("a", encoding="utf-8")
        set_log_file(log_handle)
    try:
        {
            "entities": entities,
            "candidate": candidate,
            "pronunciation": lookup_pronunciations,
            "render-audio": render_audio,
            "self-check": self_check,
            "capabilities": capabilities,
            "suggest": suggest,
        }[args.command](args)
    except Exception as exc:  # noqa: BLE001
        log(f"ERROR: {exc}")
        sys.exit(1)
    finally:
        if log_handle is not None:
            log_handle.close()
            set_log_file(None)


if __name__ == "__main__":
    main()
