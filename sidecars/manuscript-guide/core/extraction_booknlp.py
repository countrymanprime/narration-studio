"""The BookNLP source of the extraction port (SN-X72): characters, their names, who speaks each quoted line, and gender,
from an optional, separately installed model.

BookNLP groups the mentions of a book into characters, attributes each quoted line to one of them and estimates each
character's referential gender from the pronouns near it. This adapter offers:

- an ``entry`` per character with a name: its most frequent proper name (or, when it has none, its most frequent common
  noun phrase), with its other proper names as aliases;
- an ``alias`` flagged ``duplicate`` when two characters share a name, which is BookNLP splitting one person in two: the
  smaller is offered as a name of the larger, for the narrator to verify, and is not offered as an entry of its own;
- a ``speaker`` per quoted line BookNLP attributes, with the confidence ``SPEAKER_CONFIDENCE`` gives a tagged or an
  implicit attribution on the installed weights;
- a ``Gender`` ``property`` per character whose pronouns are he/him/his or she/her, with BookNLP's own probability.

BookNLP gives no score for a character or a merge, so those carry ``None``; nothing is offered that the model did not
report. Only the entity, quote and coreference pipelines run: BookNLP's events and supersenses are never used (SNX-Q3).
Each quote is a verbatim slice of its paragraph, cut by the model's own character offsets; a span that crosses a
paragraph or falls outside the text is dropped with a log line.

Nothing here reaches the network. The model and its Python packages are an optional download the host installs through
the asset registry (``config/analysis-assets.json``, ADR 0848); the host passes that install folder as ``--install``. The
loader puts the folder's unpacked wheels on ``sys.path``, tells Hugging Face to stay offline, gives BookNLP the weight
files by path and the folder as its model folder, and unpickles the weights as tensors only. Running the model writes the
book to a temporary folder and reads BookNLP's output files back from it (``read_output``). The freeze never carries
``booknlp`` or ``torch`` (``scripts/release/prepare-resources.py``). A missing or damaged install is a sentence for the
narrator, never a traceback.
"""

from __future__ import annotations

import argparse
import contextlib
import csv
import json
import locale
import os
import re
import sys
import tempfile
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, TypedDict

import extraction_rules
import manuscript_guide as guide
from narration_common.logging_utils import log
from narration_common.ports.extraction import AVAILABLE, BOOKNLP, BUILT_IN, FLAG_DUPLICATE, Availability, Book, RawSuggestion

# The weight files of each variant (config/analysis-assets.json: booknlp-big, booknlp-small), in the order BookNLP takes
# them: entities, coreference, speaker attribution. The large weights come first: when a folder has both, they are used,
# as the registry ranks the large row above the small one.
VARIANTS = {
    "big": (
        "entities_google_bert_uncased_L-6_H-768_A-12-v1.0.model",
        "coref_google_bert_uncased_L-12_H-768_A-12-v1.0.model",
        "speaker_google_bert_uncased_L-12_H-768_A-12-v1.0.1.model",
    ),
    "small": (
        "entities_google_bert_uncased_L-4_H-256_A-4-v1.0.model",
        "coref_google_bert_uncased_L-2_H-256_A-4-v1.0.model",
        "speaker_google_bert_uncased_L-8_H-256_A-4-v1.0.1.model",
    ),
}
VARIANT_WORDS = {"big": "large", "small": "small"}
BOOKNLP_WHEEL = "wheel-booknlp"
WHEEL_PREFIX = "wheel-"

# Only these pipelines run; BookNLP's events and supersenses are never asked for (SNX-Q3: it identifies characters only).
PIPELINE = "entity,quote,coref"

NOT_DOWNLOADED = "BookNLP is not downloaded."


@dataclass(frozen=True)
class Attribution:
    """The confidence a speaker suggestion takes on one variant's weights, for a tagged or an implicit attribution, and
    why. BookNLP gives no score for a speaker; the number is the code's from what it checked. Every row is provisional
    until SN-X8 calibrates the sources on a gold set (docs/research/studio-next-extraction-calibration-protocol.md)."""

    variant: str
    how: str
    confidence: float
    why: str


def _table(*rows: Attribution) -> dict[tuple[str, str], Attribution]:
    return {(row.variant, row.how): row for row in rows}


# A tagged attribution has a speech verb beside the quote and BookNLP's chosen mention of the speaker inside that tag; an
# implicit one does not. The figures are the 2026-10-10 trial's (docs/research/studio-next-booknlp-spike.md, chapter VI
# of Alice): the small weights attributed 56 of 61 quotes, the large 61 of 61, and the regex tag rules 55 with 4 unknown.
# BookNLP never abstains, so a wrong speaker is a confident one; an implicit attribution stays under the 75% rule on
# either weights, so the narrator always verifies it.
SPEAKER_CONFIDENCE = _table(
    Attribution(
        "small",
        "tagged",
        0.95,
        "A speech tag beside the quote names the mention BookNLP chose. The rules alone measured 0.963 on tagged quotes "
        "(docs/research/character-continuity-cue-extraction-eval/RESULTS.md), and the small weights missed 5 of 61 overall.",
    ),
    Attribution(
        "small",
        "implicit",
        0.55,
        "No tag names the speaker: BookNLP inferred it from the turn-taking. Every quote the small and large weights disagreed "
        "on in the trial (5) was such a quote, and the small answer was wrong each time.",
    ),
    Attribution(
        "big",
        "tagged",
        0.98,
        "A speech tag beside the quote names the mention BookNLP chose, on the weights that attributed 61 of 61 trial quotes.",
    ),
    Attribution(
        "big",
        "implicit",
        0.7,
        "No tag names the speaker. The large weights got the trial's implicit quotes right, but on one text that is in "
        "their training data (LitBank), so it stays below the 75% rule until SN-X8 measures it.",
    ),
)

# The pronoun sets BookNLP's gender model reports (its argmax), and the Story Bible value each becomes. Other sets
# (they/them/their, xe, ze) are not offered: BookNLP also gives they/them to groups, and the narrator records a
# character's own words for their gender, so the adapter does not guess one.
GENDERS = {"she/her": "Female", "he/him/his": "Male"}
GENDER_KEY = "Gender"

# A tag is a speech verb in the words between the quote and the speaker's mention, or in the one word past the mention
# ("Alice said", "the Queen replied"), with no line break or quote mark between them.
TAG_WINDOW = guide.TAG_WINDOW
QUOTE_MARKS = '"“”'
WORD = re.compile(r"[A-Za-z]+")

DESCRIPTOR = next(row for row in BUILT_IN if row.name == BOOKNLP)


class Mention(TypedDict):
    """A mention of a person: its character's id, its character offsets in the text and its kind (PROP, NOM or PRON)."""

    id: int
    start: int
    end: int
    prop: str


class QuotedLine(TypedDict):
    """A quoted line: its offsets, the id of the character BookNLP attributes it to (``None`` for none), and the offsets
    of the mention it chose (``None`` when there is none)."""

    start: int
    end: int
    speaker: int | None
    mentionStart: int | None
    mentionEnd: int | None


class Analysis(TypedDict, total=False):
    """What BookNLP found in a text: ``characters`` as its ``.book`` file gives them (``id``, ``count``, ``mentions``
    with ``proper``, ``common`` and ``pronoun`` lists of ``{"n": name, "c": count}``, and ``g``, its gender estimate or
    ``None``), the person ``mentions`` and the ``quotes``. A key a variant does not report is absent."""

    characters: list[dict[str, Any]]
    mentions: list[Mention]
    quotes: list[QuotedLine]


class Model(Protocol):
    """What the adapter needs of a loaded BookNLP: which weights it runs, and an analysis of a text."""

    variant: str

    def analyse(self, text: str) -> Analysis:
        """The characters, mentions and quoted lines of ``text``, with character offsets into it."""
        ...


def variant_of(install: Path | None) -> str | None:
    """The variant whose weight files are all in ``install``, the large first, or ``None``."""
    if install is None:
        return None
    for variant, names in VARIANTS.items():
        if all((Path(install) / name).is_file() for name in names):
            return variant
    return None


def damage(install: Path | None) -> str:
    """Why ``install`` cannot be loaded, as a sentence, or ``""`` when every file the adapter needs is there."""
    if install is None or not Path(install).is_dir():
        return NOT_DOWNLOADED
    install = Path(install)
    variant = variant_of(install)
    if variant is None:
        present = {variant: sum((install / name).is_file() for name in names) for variant, names in VARIANTS.items()}
        nearest = max(reversed(list(VARIANTS)), key=lambda variant: present[variant])
        missing = [name for name in VARIANTS[nearest] if not (install / name).is_file()]
    else:
        missing = [] if (install / BOOKNLP_WHEEL).is_dir() else [BOOKNLP_WHEEL]
    if missing:
        return f"BookNLP's download is damaged: {', '.join(missing)} is missing. Repair it in Analysis tools."
    return ""


@contextlib.contextmanager
def _tensors_only() -> Iterator[None]:
    """While BookNLP loads, ``torch.load`` unpickles tensors only and drops ``position_ids``: the checkpoints keep that
    buffer, which a current ``transformers`` no longer saves, so a strict load refuses it (the spike's trial patch)."""
    import torch

    real = torch.load

    def load(f: Any, *args: Any, **kwargs: Any) -> Any:
        kwargs["weights_only"] = True
        state = real(f, *args, **kwargs)
        if isinstance(state, dict):
            return type(state)((key, value) for key, value in state.items() if not key.endswith("position_ids"))
        return state

    torch.load = load
    try:
        yield
    finally:
        torch.load = real


class BookNlpModel:
    """A loaded BookNLP and the variant of its weights."""

    def __init__(self, nlp: Any, variant: str):
        self.nlp = nlp
        self.variant = variant

    def analyse(self, text: str) -> Analysis:
        """Runs BookNLP over ``text`` in a temporary folder and reads its output files back."""
        with tempfile.TemporaryDirectory(prefix="booknlp-") as temporary:
            folder = Path(temporary)
            book = folder / "book.txt"
            # BookNLP opens the book in the locale's encoding; a character it cannot write becomes "?", one for one, so
            # the offsets it reports are offsets into ``text``.
            book.write_text(text, encoding=locale.getpreferredencoding(False), errors="replace")
            self.nlp.process(str(book), str(folder / "out"), "book")
            return read_output(folder / "out", "book")


def load_model(install: Path, variant: str, spacy_model: str = "en_core_web_sm") -> Model:
    """Loads BookNLP from ``install`` alone: its unpacked wheels go on ``sys.path``, the weights are given by path, and
    the install folder is its model folder, so it neither downloads nor creates a folder elsewhere."""
    install = Path(install)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    for wheel in sorted(install.glob(WHEEL_PREFIX + "*"), reverse=True):
        if str(wheel) not in sys.path:
            sys.path.insert(0, str(wheel))
    entities, coref, speaker = (str(install / name) for name in VARIANTS[variant])
    params = {
        "pipeline": PIPELINE,
        "model": "custom",
        "entity_model_path": entities,
        "coref_model_path": coref,
        "quote_attribution_model_path": speaker,
        "model_path": str(install),
        "spacy_model": spacy_model or "en_core_web_sm",
    }
    with _tensors_only():
        from booknlp.booknlp import BookNLP

        return BookNlpModel(BookNLP("en", params), variant)


def _rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file, delimiter="\t", quoting=csv.QUOTE_NONE))


def _number(value: str) -> int | None:
    return None if value in ("", "None") else int(value)


def read_output(folder: Path, idd: str) -> Analysis:
    """BookNLP's output files for ``idd`` in ``folder`` as an Analysis: token ids become character offsets (a token's
    ``byte_onset`` is its offset in the text it read), and only person mentions, names and gender are kept."""
    tokens = {int(row["token_ID_within_document"]): (int(row["byte_onset"]), int(row["byte_offset"])) for row in _rows(folder / f"{idd}.tokens")}

    def span(first: int | None, last: int | None) -> tuple[int | None, int | None]:
        if first is None or last is None or first not in tokens or last not in tokens:
            return None, None
        return tokens[first][0], tokens[last][1]

    mentions: list[Mention] = []
    for row in _rows(folder / f"{idd}.entities"):
        start, end = span(int(row["start_token"]), int(row["end_token"]))
        if row["cat"] == "PER" and start is not None and end is not None:
            mentions.append({"id": int(row["COREF"]), "start": start, "end": end, "prop": row["prop"]})
    quotes: list[QuotedLine] = []
    for row in _rows(folder / f"{idd}.quotes"):
        start, end = span(int(row["quote_start"]), int(row["quote_end"]))
        if start is None or end is None:
            continue
        mention_start, mention_end = span(_number(row["mention_start"]), _number(row["mention_end"]))
        quotes.append({"start": start, "end": end, "speaker": _number(row["char_id"]), "mentionStart": mention_start, "mentionEnd": mention_end})
    book = json.loads((folder / f"{idd}.book").read_text(encoding="utf-8"))
    characters = [{key: found[key] for key in ("id", "count", "g", "mentions") if key in found} for found in book.get("characters", [])]
    return {"characters": characters, "mentions": mentions, "quotes": quotes}


def book_text(paragraphs: list[dict[str, str]]) -> str:
    """The paragraphs as BookNLP reads them: joined by a blank line, its paragraph break, with a carriage return read as a
    space so each paragraph keeps its length."""
    return "\n\n".join(paragraph["text"].replace("\r", " ") for paragraph in paragraphs)


def tagged(text: str, line: dict[str, Any]) -> bool:
    """Whether a speech tag beside the quoted ``line`` names the mention BookNLP chose: a speech verb between the quote
    and the mention, or the word right past the mention, with no line break or quote mark in the way."""
    start, end, m_start, m_end = line["start"], line["end"], line.get("mentionStart"), line.get("mentionEnd")
    if m_start is None or m_end is None or (m_start < end and m_end > start):
        return False
    if m_start >= end:
        between, past = text[end:m_start], text[m_end : m_end + TAG_WINDOW]
    else:
        between, past = text[m_end:start], text[max(0, m_start - TAG_WINDOW) : m_start]
    if len(between) > TAG_WINDOW or any(mark in between for mark in QUOTE_MARKS + "\n"):
        return False
    words = WORD.findall(between)
    beyond = WORD.findall(past)
    if m_start >= end:
        beyond = beyond[:1]
    else:
        # Before the quote ("said Alice, “…”"), the word right before the mention.
        beyond = beyond[-1:]
    return any(word.lower() in guide.SPEECH_VERBS for word in words + beyond)


def _key(name: str) -> str:
    """A name as a split is recognised by: without a leading article, letters and digits only."""
    return guide.normalize_name(re.sub(r"^(the|a|an)\s+", "", name.strip(), flags=re.IGNORECASE))


def _names(found: dict[str, Any], kind: str) -> list[str]:
    return [str(item["n"]).strip() for item in (found.get("mentions") or {}).get(kind) or [] if str(item.get("n", "")).strip()]


def _display_name(found: dict[str, Any]) -> str:
    """A character's most frequent proper name, else its most frequent common noun phrase, else ``""``."""
    names = _names(found, "proper") or _names(found, "common")
    return names[0] if names else ""


class BookNlpExtractor:
    """The extract role over a loaded model."""

    def __init__(self, model: Model, log_line: Callable[[str], None]):
        self.model = model
        self.log = log_line

    def extract(self, book: Book) -> list[RawSuggestion]:
        """Every suggestion BookNLP's analysis of ``book`` supports: entries, merges, speakers, then genders."""
        paragraphs = book["paragraphs"]
        text = book_text(paragraphs)
        try:
            analysis = self.model.analyse(text)
        except Exception as exc:
            raise ValueError(f"BookNLP could not read the book: {str(exc) or type(exc).__name__}.") from exc
        return _Reading(paragraphs, text, analysis or {}, self.model.variant, self.log).suggestions()


class _Reading:
    """One analysis read against the paragraphs it was made from."""

    def __init__(self, paragraphs: list[dict[str, str]], text: str, analysis: Analysis, variant: str, log_line: Callable[[str], None]):
        self.paragraphs = paragraphs
        self.text = text
        self.analysis = analysis
        self.variant = variant
        self.log = log_line
        self.starts: list[int] = []
        at = 0
        for paragraph in paragraphs:
            self.starts.append(at)
            at += len(paragraph["text"]) + 2

    def locate(self, start: Any, end: Any, kind: str) -> tuple[dict[str, str], int, int] | None:
        """The paragraph holding ``text[start:end]`` and the span's offsets in it, or ``None`` with a log line."""
        for paragraph, first in zip(self.paragraphs, self.starts, strict=True):
            if isinstance(start, int) and isinstance(end, int) and first <= start < end <= first + len(paragraph["text"]):
                return paragraph, start - first, end - first
        self.log(f"Dropped a BookNLP {kind}: the span {start}..{end} is not inside one paragraph.")
        return None

    def raw(self, payload: dict[str, Any], confidence: float | None, where: tuple[dict[str, str], int, int], *, whole: bool = False) -> RawSuggestion:
        paragraph, start, end = where
        quote = paragraph["text"][start:end].strip() if whole else extraction_rules.sentence_around(paragraph["text"], start, end)
        return {
            "payload": payload,
            "confidence": confidence,
            "quotes": [{"paragraphId": paragraph["id"], "text": quote}],
            "chapterId": paragraph.get("chapterId", ""),
        }

    def mentions_of(self, cluster: int) -> list[Mention]:
        return [m for m in self.analysis.get("mentions") or [] if m.get("id") == cluster]

    def evidence(self, cluster: int, name: str) -> tuple[dict[str, str], int, int] | None:
        """Where ``name`` is first said of ``cluster``, else where it is first mentioned at all."""
        mentions = self.mentions_of(cluster)
        named = [m for m in mentions if self.text[m["start"] : m["end"]].strip() == name]
        for mention in named or mentions:
            found = self.locate(mention["start"], mention["end"], "mention")
            if found is not None:
                return found
        return None

    def suggestions(self) -> list[RawSuggestion]:
        characters = [c for c in self.analysis.get("characters") or [] if _display_name(c)]
        characters.sort(key=lambda c: -int(c.get("count") or 0))
        names = {c["id"]: _display_name(c) for c in characters}
        entries: list[RawSuggestion] = []
        merges: list[RawSuggestion] = []
        kept: list[tuple[set[str], str]] = []
        for found in characters:
            name = names[found["id"]]
            keys = {_key(n) for n in [name, *_names(found, "proper")]} - {""}
            where = self.evidence(found["id"], name)
            if where is None:
                continue
            twin = next((other for other_keys, other in kept if keys & other_keys), None)
            if twin is not None:
                note = f"Possible duplicate of {twin}: “{name}” was found in a separate group of mentions."
                merge = self.raw({"kind": "alias", "entry": twin, "alias": name}, None, where)
                merges.append({**merge, "flag": FLAG_DUPLICATE, "note": note})
                continue
            kept.append((keys, name))
            aliases = [n for n in dict.fromkeys(_names(found, "proper")) if n != name]
            payload = {"kind": "entry", "name": name, "type": "Character", "aliases": aliases, "description": "", "appearsIn": []}
            entries.append(self.raw(payload, None, where))
        return entries + merges + self.speakers(names) + self.genders(characters, names)

    def speakers(self, names: dict[int, str]) -> list[RawSuggestion]:
        out: list[RawSuggestion] = []
        for line in self.analysis.get("quotes") or []:
            speaker = names.get(line.get("speaker"))  # type: ignore[arg-type]
            if not speaker:
                continue
            where = self.locate(line.get("start"), line.get("end"), "speaker")
            if where is None:
                continue
            paragraph, start, end = where
            how = "tagged" if tagged(self.text, line) else "implicit"
            payload = {"kind": "speaker", "quote": paragraph["text"][start:end].strip(), "speaker": speaker}
            out.append(self.raw(payload, SPEAKER_CONFIDENCE[(self.variant, how)].confidence, where, whole=True))
        return out

    def genders(self, characters: list[dict[str, Any]], names: dict[int, str]) -> list[RawSuggestion]:
        out: list[RawSuggestion] = []
        for found in characters:
            estimate = found.get("g")
            if not isinstance(estimate, dict) or estimate.get("argmax") not in GENDERS:
                continue
            pronouns = set(estimate["argmax"].split("/"))
            spoken = [m for m in self.mentions_of(found["id"]) if m.get("prop") == "PRON" and self.text[m["start"] : m["end"]].lower() in pronouns]
            where = next((w for w in (self.locate(m["start"], m["end"], "mention") for m in spoken) if w is not None), None)
            where = where or self.evidence(found["id"], names[found["id"]])
            if where is None:
                continue
            probability = estimate.get("max")
            confidence = None if probability is None else float(probability)
            payload = {"kind": "property", "entry": names[found["id"]], "key": GENDER_KEY, "value": GENDERS[estimate["argmax"]]}
            out.append(self.raw(payload, confidence, where))
        return out


class BookNlpSource:
    """The BookNLP row. ``install`` is the folder the host installed the tool in, or ``None`` when it is not installed;
    ``loader`` loads a model of a variant from it (``load_model``, or a fake in a test)."""

    descriptor = DESCRIPTOR

    def __init__(
        self,
        install: str | Path | None,
        loader: Callable[[Path, str], Model] = load_model,
        log: Callable[[str], None] = log,
    ):
        self.install = Path(install) if install else None
        self.loader = loader
        self.log = log

    def available(self) -> Availability:
        """Whether every file of the install is there; it loads nothing."""
        reason = damage(self.install)
        return Availability(False, reason) if reason else AVAILABLE

    def extractor(self) -> BookNlpExtractor:
        """Loads the model on the weights the install has, or refuses with the reason it cannot."""
        availability = self.available()
        if not availability.ok:
            raise self.descriptor.unavailable(availability.reason)
        assert self.install is not None
        variant = variant_of(self.install)
        assert variant is not None
        try:
            model = self.loader(self.install, variant)
        except Exception as exc:
            raise self.descriptor.unavailable(f"BookNLP could not be loaded: {str(exc) or type(exc).__name__}. Repair it in Analysis tools.") from exc
        return BookNlpExtractor(model, self.log)


def line(raw: RawSuggestion) -> dict[str, Any]:
    """One line of ``suggest --source booknlp``: the raw suggestion under its source's name."""
    return {"source": BOOKNLP, **raw}


def _paragraphs(manuscript: str) -> list[dict[str, str]]:
    return [{"id": p["paragraphId"], "chapterId": p.get("chapterId", ""), "text": p["text"]} for p in guide.load_manuscript(manuscript)]


def suggest(args: argparse.Namespace, loader: Callable[[Path, str], Model] | None = None) -> None:
    """``suggest --source booknlp --manuscript M --install DIR [--spacy-model S]``: print BookNLP's suggestions as JSON
    lines. It writes nothing."""
    spacy_model = getattr(args, "spacy_model", "") or "en_core_web_sm"
    load = loader or (lambda install, variant: load_model(install, variant, spacy_model))
    extractor = BookNlpSource(args.install or None, loader=load).extractor()
    for raw in extractor.extract({"paragraphs": _paragraphs(args.manuscript)}):
        print(json.dumps(line(raw), ensure_ascii=False))


def version(install: Path) -> str:
    """The version of the booknlp wheel in ``install``, read from its metadata without importing it."""
    for metadata in sorted((Path(install) / BOOKNLP_WHEEL).glob("booknlp-*.dist-info/METADATA")):
        for text in metadata.read_text(encoding="utf-8").splitlines():
            if text.startswith("Version:"):
                return text.split(":", 1)[1].strip()
    raise ValueError("the booknlp wheel has no version in its metadata")


def self_check(installs: list[str | Path | None]) -> dict[str, Any]:
    """The smoke test's line for BookNLP, over the install folders the host would use, best first: the first folder that
    is there gives its version and weights, or a failure when it is damaged; none there is "not installed", a pass."""
    for install in installs:
        reason = damage(Path(install) if install else None)
        if reason == NOT_DOWNLOADED:
            continue
        if reason:
            return {"name": "booknlp", "ok": False, "detail": reason}
        folder = Path(install)  # type: ignore[arg-type]
        try:
            return {"name": "booknlp", "ok": True, "detail": f"booknlp {version(folder)}, {VARIANT_WORDS[variant_of(folder) or 'small']} weights"}
        except (OSError, ValueError) as exc:
            return {"name": "booknlp", "ok": False, "detail": str(exc)}
    return {"name": "booknlp", "ok": True, "detail": "not installed"}
