# Story Bible build benchmark: what a build finds, and a confidence rule for the import's build

**Date:** 2026-11-06. **Issue:** [#3092](https://github.com/countrymanprime/narration-studio/issues/3092). **Question:** before a manuscript import builds the Story Bible on its own (the setting **Build the Story Bible after import**, on by default), how often is a character it shows a real character, and what rule gets that to at least 95% without hiding the rest?

**Answer:** today's builds do not reach the bar. The rules-only build shows real characters 90.7% of the time, the build from the spaCy model's labels 57.4%, and BookNLP's entries 13.9%. The confidence rule in `src/studio/desktop/internal/guide/build_confidence.go` shows 99 real characters of 100 (99.0%) rules-only and 107 of 108 (99.1%) with the spaCy model, over five books. On the book held out from tuning it is 18 of 19 (94.7%) and 23 of 24 (95.8%). It finds 71% to 74% of the required characters as characters and lists 95% of them in the build at all, the rest under Needs Review. The bar is met pooled and on the held-out book with the model; without the model the held-out book is one entry short of it, on a sample of 19.

## Books and labels

| Book | Text | Role |
| --- | --- | --- |
| *Alice's Adventures in Wonderland* (1865), all 12 chapters | `tests/fixtures/alice_raw.txt`, the sample project's book | Tuning |
| *The Wind in the Willows* (1908), all 12 chapters | Project Gutenberg #289, from the GITenberg mirror on GitHub (gutenberg.org refused this session's proxy, as on 2026-10-12) | Tuning |
| *Three Men in a Boat* (1889), all 19 chapters | Project Gutenberg #308, GITenberg | Tuning |
| *Pride and Prejudice* (1813), chapters 1 to 24 | Project Gutenberg #1342, GITenberg; cut to keep the fixture small | Tuning |
| *Treasure Island* (1883), chapters 1 to 18 | Project Gutenberg #120, GITenberg | Held out: labelled before the rule ran on it, never used to tune it |

All five are public domain. `scripts/research/story-bible-benchmark/prepare.py` turns each Gutenberg text into the fixture `src/studio/desktop/internal/guide/testdata/benchmark/<book>.txt.gz` (one paragraph a line, chapter titles marked), 466 KB for the five.

Each `<book>.labels.json` lists the book's characters and places, read from the text: **required** is a named character or place capitalised at least three times, **minor** a real one with fewer mentions (counted correct when shown, never missed), and **other** a real named thing that is neither (a song, a ship, a dance), wrong when shown as a character. Matching is by name or alias, ignoring case, a leading "the" and a possessive. After the first runs the labels gained name forms and minor names they had left out, so a real name was not scored wrong (Mrs. Crossley, Cap'n Smollett, Earl Godwin, Execution Dock). Which names are required did not change.

## Sources and versions

| Source | Version | How it ran |
| --- | --- | --- |
| Rules-only build | The app at `fe8afc6d` | `buildEntities` over `scanCandidates`, in `TestStoryBibleBenchmark` |
| spaCy build | `en_core_web_sm` 3.8.0 (SHA-256 matches `config/spacy-assets.json`), spaCy 3.8.18 | The sidecar's `entities` command, spans recorded to `<book>.spacy.json.gz`, then `buildEntities` over `spacyCandidates` |
| BookNLP small | `booknlp` 1.0.8, `torch` 2.14.1, `transformers` 5.16.0, the three small weight files (SHA-256 match `config/analysis-assets.json`) | The sidecar's `suggest --source booknlp`, scored by `scripts/research/story-bible-benchmark/score_booknlp.py` |
| Confidence rule | This change | `buildEntities` over `confidentCandidates`, without and with the recorded spans |

All runs were on a 4-vCPU Linux container.

## Results

"Shown" is the entries a build files under Character. **Precision** is the share of them that are real characters; **recall** the share of the required characters shown as characters; **listed** the share in the build at all, as a character or under Needs Review.

| Build | Characters shown | Precision | Recall | Listed | Places: precision, recall |
| --- | --- | --- | --- | --- | --- |
| Rules-only, today | 118 | 90.7% (107) | 54.5% (61 of 112) | 86.6% | 80.0% (12 of 15), 7.9% |
| spaCy, today | 385 | 57.4% (221) | 74.1% (83) | 74.1% | 64.9% (120 of 185), 44.4% |
| BookNLP small, every entry | 1,312 | 13.9% (183) | 96.4% (108) | 96.4% | does not name places |
| BookNLP small, entries with a proper name | 274 | 48.2% (132) | 75.9% (85) | 75.9% | does not name places |
| **Confidence rule, rules-only** | 100 | **99.0% (99)** | 71.4% (80) | 94.6% | 100% (48 of 48), 66.7% |
| **Confidence rule, with spaCy** | 108 | **99.1% (107)** | 74.1% (83) | 94.6% | 100% (50 of 50), 68.3% |

Per book (characters correct of shown; recall):

| Book | Rules-only today | spaCy today | Rule, rules-only | Rule, with spaCy |
| --- | --- | --- | --- | --- |
| Alice | 10/11, 34.6% | 24/43, 50.0% | 23/23, 69.2% | 23/23, 69.2% |
| Wind in the Willows | 11/15, 58.3% | 23/56, 75.0% | 12/12, 83.3% | 13/13, 91.7% |
| Three Men in a Boat | 31/36, 37.5% | 77/158, 83.3% | 15/15, 54.2% | 16/16, 54.2% |
| Pride and Prejudice | 35/35, 88.9% | 43/51, 81.5% | 31/31, 96.3% | 32/32, 96.3% |
| Treasure Island (held out) | 20/21, 52.2% | 54/77, 82.6% | 18/19, 56.5% | 23/24, 65.2% |

`testdata/benchmark/golden.json` holds every figure above for the four app builds, with each wrong and each missed name.

### Run time

| Build | Per book |
| --- | --- |
| Rules-only, and the confidence rule over its names | 30 to 90 ms |
| spaCy `entities` (model load and the whole book) | 5.1 to 7.6 s (Treasure Island not timed) |
| BookNLP small `suggest` | 51 to 90 s |

## What each build gets wrong

- **spaCy's labels** name a capitalised word as a person or a group whatever it is: "Said", "n't", "Ahem", "Hullo", "BANG", "Majesty", "Latitude", "Alice)—“and", "George and Harris". The build's own filter only drops a single word that is written in lower case elsewhere, so most survive. It also folds "Darcy" into "Lady Anne Darcy" (a name ending with it that starts with a title), making Mr. Darcy's 159 mentions one entry under his mother's name.
- **BookNLP** offers a character for every group of mentions, named by its most frequent noun phrase when it has no proper name: "my dear", "sir", "nobody", "the others", "her mother", "O", "Hooray". It finds almost every real character (96.4%), but as a builder on its own seven of eight entries would be wrong. In the app every BookNLP entry waits for the narrator (it gives no confidence), which this result supports.
- **The rules-only build** never offers "I'm" or "Oh": the scan (`rules_scan.go`) cuts a name at pronouns, contractions, interjections and sentence-opening words. Its errors are kinds: Toad Hall, the Wild Wood and Hampton Court shown as characters, every house and church as an Organization, and almost every single-word name (George, Montmorency, the Gryphon, Netherfield) under Needs Review, because the old `classify` has no evidence for one word but a title. It also drops names the book uses as names: Portly, Billy, Emily and Goring end like common words (-ly, -ing), and the Hatter, the Mouse and the Otter are written in lower case somewhere.

## The confidence rule

It starts from the scan's names, so the stop lists and the capitalisation evidence that keep "I'm" out hold for it too, and adds two kinds of evidence:

1. **A name the scan turned down** is kept when the book capitalises it mid-sentence at least three times in more than one paragraph and it is never written in lower case (Portly, Emily), or, if it is, a speech verb stands beside it at least twice ("said the Hatter") (`confidentAccepts`). The scan's own suggestions are unchanged (`TestScanGroupsAreTheScansOwn`).
2. **A kind** is given only on evidence, and a name needs three mentions first (`confidentCategory`):
   - **Character**: beside a speech verb twice, including across "the" ("said the Dormouse"); or given a title; or followed by a verb in at least two mentions and a tenth of them ("Montmorency barked"); or, with the spaCy model, read as a person by two thirds of at least three of its labels and speaking or acting once. A character is rarely after a place preposition (under a third of its mentions).
   - **Place**: its name ends with a place word (Hall, Wood, Lodge, Court, Island); or half its mentions follow "at", "in", "from", "near", "past" or "through" and it does not speak; or 40% follow those or "to" and it never speaks or acts; or the model reads it as a place and it follows one of those once.
   - **Needs Review**: everything else the scan keeps, with three mentions or more. A name with fewer is left out of the file, as a build leaves it out today.

The spaCy model only ever adds a vote: alone, its labels were right for 57% of the characters they named.

### The errors left

- **Held out:** "Admiral Benbow" (an inn) shown as a character, because "Admiral" is a title. Not fixed, so the held-out figure stays an honest one.
- **Missed as characters, listed under Needs Review:** names the book gives no speech tag, title or verb for in at least two mentions, such as Dinah, Mary Ann, Black Dog, Pew, Ben Gunn, Biggs and Stivvings.
- **Not found at all** (5.4% of required characters): Pat, the King of Hearts, Mrs. Phillips, Jefferson, Henry VIII and Cromwell.

## How confident the figure is

99 of 100 has a 95% Wilson interval of 94.6% to 99.8%; the held-out book's 18 of 19 has one of 75.4% to 99.1%. The rule was tuned on four of the five books, so the held-out figures are the honest ones and their sample is small. All five books are 19th-century public-domain English fiction; a modern manuscript, first-person narration or a book in another language has not been measured. Anything here is provisional until the same benchmark runs on the owner's own manuscript (pending, owner).

## How to reproduce

1. `go test ./internal/guide -run TestStoryBibleBenchmark -v` in `src/studio/desktop` prints every row above for the four app builds. It fails when the confidence rule falls under 95% pooled or 90% on any book, or when any figure or name moves from `golden.json`; `UPDATE_BENCHMARK=1` rewrites the golden.
2. To add a book, run `python -I scripts/research/story-bible-benchmark/prepare.py <id> <gutenberg.txt> <out.txt.gz>` (add its chapter pattern to `BOOKS`), write `<id>.labels.json` from the text, record its spans with the sidecar's `entities --manuscript <manuscript.json> --spacy-model <model folder>`, and add it to `benchmarkBooks`.
3. BookNLP: install the small model as `config/analysis-assets.json` lists it, run `manuscript_guide.py suggest --source booknlp --install <folder> --manuscript <manuscript.json> --guide <empty guide>`, then `python -I scripts/research/story-bible-benchmark/score_booknlp.py <labels.json> <output.jsonl>`.
