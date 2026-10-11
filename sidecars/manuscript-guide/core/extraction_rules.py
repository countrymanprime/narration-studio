"""The rules tier of the extraction port (SN-X32): the build's own rules, offered as suggestions.

``suggest`` reads the manuscript and the Story Bible and prints one JSON line per suggestion, in the extraction port's
``RawSuggestion`` shape (``narration_common.ports.extraction``) plus ``source`` and ``rule``. It writes nothing: the build
keeps writing the Story Bible as it does (ADR 0020), and this proposes only what the Story Bible does not already say:

- an ``entry`` for a name the rules accept that no entry answers to, or that one answers to only as Needs Review;
- an ``alias`` for a spelling the rules group with a known entry that the entry does not list;
- a ``speaker`` for a dialogue cue a speech tag resolves to a Character, unless the Story Bible already has that cue
  with that speaker or the narrator corrected it.

A locked entry gets no suggestion (ADR 0007), nor does a name a merge absorbed. Properties, relationships and claims
need a language model and are not emitted. Each quote is a verbatim slice of the paragraph it names; one that is not is
dropped with a log line. Each confidence comes from ``RULE_CONFIDENCE``.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import manuscript_guide as guide
from narration_common.logging_utils import log

SOURCE = "rules"

# The longest quote, in characters, an entry or alias takes from the sentence its name is in.
MAX_QUOTE = 300

# The note a suggestion carries when its rule has no documented confidence.
NO_SCORE = "The rules give no score for this."


@dataclass(frozen=True)
class Rule:
    """One rule's confidence and why. ``None`` means nothing measured supports a number; every row is provisional
    until SN-X8 calibrates the sources on a gold set (docs/research/studio-next-extraction-calibration-protocol.md)."""

    name: str
    confidence: float | None
    why: str
    provisional: bool = True


def _rules(*rows: Rule) -> dict[str, Rule]:
    return {row.name: row for row in rows}


RULE_CONFIDENCE = _rules(
    Rule(
        "new-name",
        None,
        "A capitalised name the build's rules accept and no entry answers to. The rules count mentions; no precision for "
        "them has been measured (the GLiNER spike records counts only), so there is no number to give.",
    ),
    Rule(
        "needs-review-name",
        None,
        "A name the Story Bible holds only as Needs Review. The rules could not settle what it is, so they give no number.",
    ),
    Rule(
        "known-spelling",
        None,
        "A spelling the rules group with a known entry (a title-prefixed form such as Captain Arelian for Arelian). The "
        "grouping is conservative (ADR 0020) but unmeasured.",
    ),
    Rule(
        "speech-tag",
        0.96,
        "A quote with a speech verb naming a known Character beside it. The labelled-quote evaluation of these cue rules "
        "measured a precision of 0.963 (26 of 27; docs/research/character-continuity-cue-extraction-eval/RESULTS.md), and "
        "its one miss was a continuation, which this rule does not emit.",
    ),
)


def sentence_around(text: str, start: int, end: int) -> str:
    """The sentence of ``text`` holding ``text[start:end]``, trimmed, or a window of at most MAX_QUOTE characters around
    it when the sentence is longer. Always a slice of ``text``."""
    left = max((text.rfind(mark, 0, start) for mark in guide.SENTENCE_END_CHARACTERS), default=-1) + 1
    ends = [at for at in (text.find(mark, end) for mark in guide.SENTENCE_END_CHARACTERS) if at >= 0]
    right = min(ends) + 1 if ends else len(text)
    if right - left > MAX_QUOTE:
        room = max(0, MAX_QUOTE - (end - start)) // 2
        left = max(left, start - room)
        right = min(right, left + MAX_QUOTE)
    # A sentence that starts after a closing quote or bracket starts with it; drop it, keeping a slice of the text.
    return text[left:right].strip().lstrip("”’)] ")


def _raw(rule: str, payload: dict[str, Any], paragraph: dict[str, str], quote: str) -> dict[str, Any]:
    row = RULE_CONFIDENCE[rule]
    raw: dict[str, Any] = {
        "source": SOURCE,
        "rule": rule,
        "payload": payload,
        "confidence": row.confidence,
        "quotes": [{"paragraphId": paragraph["paragraphId"], "text": quote}],
        "chapterId": paragraph.get("chapterId", ""),
    }
    if row.confidence is None:
        raw["note"] = NO_SCORE
    return raw


def verbatim(raw: dict[str, Any], paragraphs: dict[str, dict[str, str]]) -> dict[str, Any] | None:
    """``raw`` when every quote is a substring of the paragraph it names; otherwise ``None``, with a log line."""
    for quote in raw["quotes"]:
        paragraph = paragraphs.get(quote.get("paragraphId", ""))
        if not quote.get("text") or paragraph is None or quote["text"] not in paragraph["text"]:
            log(f"Dropped a {raw['payload']['kind']} suggestion: its quote {quote.get('text')!r} is not in paragraph {quote.get('paragraphId')!r}.")
            return None
    return raw


def _grouped(candidates: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    """The candidates by normalized name, with a bare name folded into its title-prefixed form, as the build groups them."""
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for candidate in candidates:
        key = guide.normalize_name(candidate["name"])
        if len(key) >= 2 and candidate["name"] not in guide.STOPWORDS:
            grouped[key].append(candidate)
    for short in list(grouped):
        for long in list(grouped):
            if short in grouped and long != short and long.endswith(short) and guide.is_title_prefixed(grouped[long][0]["name"]):
                grouped[long].extend(grouped.pop(short))
                break
    return grouped


def _category(occurrences: list[dict[str, str]]) -> str:
    votes: dict[str, int] = defaultdict(int)
    for occurrence in occurrences:
        votes[guide.classify(occurrence)] += 1
    confident = {name: count for name, count in votes.items() if name != "Needs Review"}
    return max(confident, key=confident.get) if confident else "Needs Review"


def _quote_of(occurrence: dict[str, str]) -> str:
    return sentence_around(occurrence["text"], int(occurrence["start"]), int(occurrence["end"]))


def _by_name(story_bible: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Every normalized name an entry answers to, and the names a merge absorbed into one, mapped to that entry."""
    entities = story_bible.get("entities") or []
    by_id = {entity.get("id"): entity for entity in entities}
    index: dict[str, dict[str, Any]] = {}
    for entity in entities:
        for key in guide.entity_name_keys(entity):
            index.setdefault(key, entity)
    for key, target in (story_bible.get("absorbed_names") or {}).items():
        if target in by_id:
            index.setdefault(guide.normalize_name(key), by_id[target])
    return index


def name_suggestions(paragraphs: list[dict[str, str]], story_bible: dict[str, Any]) -> list[dict[str, Any]]:
    """Entry and alias suggestions from the build's name rules, in the order the names first appear."""
    known = _by_name(story_bible)
    out: list[dict[str, Any]] = []
    for occurrences in _grouped(guide.rule_candidates(paragraphs)).values():
        category = _category(occurrences)
        if category == "Needs Review" and len(occurrences) < guide.MIN_NEEDS_REVIEW_OCCURRENCES:
            continue
        spellings = sorted({item["name"] for item in occurrences}, key=lambda value: (-len(value), value))
        first = {spelling: next(item for item in occurrences if item["name"] == spelling) for spelling in spellings}
        entity = next((known[key] for key in map(guide.normalize_name, spellings) if key in known), None)
        if entity is not None and entity.get("locked"):
            continue
        if entity is None or entity.get("category") == "Needs Review":
            name = spellings[0]
            rule = "new-name" if entity is None else "needs-review-name"
            payload = {
                "kind": "entry",
                "name": name,
                "type": "" if category == "Needs Review" else category,
                "aliases": spellings[1:],
                "description": "",
                "appearsIn": [],
            }
            out.append(_raw(rule, payload, first[name], _quote_of(first[name])))
            continue
        own = guide.entity_name_keys(entity)
        for spelling in spellings:
            key = guide.normalize_name(spelling)
            if key in own or known.get(key, entity) is not entity:
                continue
            payload = {"kind": "alias", "entry": entity.get("canonical_name", ""), "alias": spelling}
            out.append(_raw("known-spelling", payload, first[spelling], _quote_of(first[spelling])))
    return out


def _tagged_span(text: str, start: int, end: int, speaker_id: str, characters: dict[str, str]) -> str | None:
    """The quote with the speech tag that names ``speaker_id`` beside it, as a slice of ``text``."""
    after = guide.AFTER_QUOTE_TAG.match(text[end : end + guide.TAG_WINDOW])
    if after and after.group(2).lower() in guide.SPEECH_VERBS and characters.get(guide.normalize_name(after.group(1))) == speaker_id:
        return text[start : end + after.end()].strip()
    base = max(0, start - guide.TAG_WINDOW)
    before = guide.BEFORE_QUOTE_TAG.search(text[base:start])
    if before and before.group(2).lower() in guide.SPEECH_VERBS and characters.get(guide.normalize_name(before.group(1))) == speaker_id:
        return text[base + before.start() : end].strip()
    return None


def speaker_suggestions(paragraphs: list[dict[str, str]], story_bible: dict[str, Any]) -> list[dict[str, Any]]:
    """Speaker suggestions for cues a speech tag resolves, that the Story Bible does not already attribute that way."""
    entities = story_bible.get("entities") or []
    names = {entity.get("id"): entity.get("canonical_name", "") for entity in entities}
    characters = guide.character_name_index(entities)
    stored = {cue.get("id"): cue for cue in story_bible.get("dialogue_cues") or []}
    by_id = {paragraph["paragraphId"]: paragraph for paragraph in paragraphs}
    out: list[dict[str, Any]] = []
    for cue in guide.extract_dialogue_cues(paragraphs, characters):
        speaker_id = cue["speaker_entity_id"]
        if cue["speaker_source"] != "tag" or not speaker_id:
            continue
        previous = stored.get(cue["id"])
        if previous and (previous.get("corrected") or previous.get("speaker_entity_id") == speaker_id):
            continue
        paragraph = by_id[cue["paragraphId"]]
        text = paragraph["text"]
        span = _tagged_span(text, cue["quote_start"], cue["quote_end"], speaker_id, characters)
        if span is None:
            continue
        payload = {"kind": "speaker", "quote": text[cue["quote_start"] : cue["quote_end"]], "speaker": names[speaker_id]}
        out.append(_raw("speech-tag", payload, paragraph, span))
    return out


def suggestions(paragraphs: list[dict[str, str]], story_bible: dict[str, Any]) -> list[dict[str, Any]]:
    """Every suggestion the rules make for ``paragraphs`` against ``story_bible``, with each quote checked."""
    by_id = {paragraph["paragraphId"]: paragraph for paragraph in paragraphs}
    found = name_suggestions(paragraphs, story_bible) + speaker_suggestions(paragraphs, story_bible)
    return [raw for raw in (verbatim(item, by_id) for item in found) if raw is not None]


def suggest(args: argparse.Namespace) -> None:
    """``suggest --manuscript M --guide G``: print the rules' suggestions as JSON lines. A missing Story Bible is an empty
    one; one that cannot be read is an error, so a damaged file never looks like a book with nothing in it."""
    paragraphs = guide.load_manuscript(args.manuscript)
    story_bible: dict[str, Any] = {}
    if Path(args.guide).exists():
        loaded = guide.load_json(args.guide)
        if not isinstance(loaded, dict):
            raise ValueError("The Story Bible could not be read.")
        story_bible = loaded
    for raw in suggestions(paragraphs, story_bible):
        print(json.dumps(raw, ensure_ascii=False))
