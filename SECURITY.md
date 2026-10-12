# Security policy

## Supported versions

Narration Studio is pre-1.0. Only the latest release (including the latest pre-release candidate) receives fixes. Windows x64 is the only supported platform ([ADR 0412](docs/adr/0412-windows-is-the-only-supported-platform-for-now.md)): a report that applies only to a macOS or Linux build is out of scope, because no such build is released.

## Reporting a vulnerability

Please report it privately through GitHub: **Security → Report a vulnerability** on this repository, or
<https://github.com/countrymanprime/narration-utils/security/advisories/new>. Do not open a public issue for a
vulnerability.

Include what you found, the version, and steps to reproduce. There is one maintainer, so expect an acknowledgement
within about a week and a fix or a plan as soon as practical. Reports are credited unless you ask otherwise.

## What is in scope

Narration Studio runs locally and processes your manuscripts and audio on your machine. Reports about these are
especially welcome:

- Anything that sends manuscript, audio, or project content off the machine without an explicit action.
- Downloads of models, voices, the reader's offline dictionary or binaries (the MP3/M4B/FLAC encoder's FFmpeg build,
  [ADR 0342](docs/adr/0342-the-mp3-encoder-is-a-pinned-gpl-ffmpeg-build-run-as-a-separate-process-and-writes-no-tag-frame.md)) that skip the integrity checks described in
  [first-use dependency provisioning](docs/architecture/first-use-dependency-provisioning.md), a downloaded executable that runs without matching its pinned hash, and a downloaded dataset or the lookup index
  the app builds from it (the dictionary, [ADR 0097](docs/adr/0097-the-manuscript-reader-word-lookup-uses-the-open-english-wordnet-as-a-downloadable-asset.md))
  that can crash the app, exhaust its memory or reach outside its install folder when it is parsed or read. This covers the optional
  Story Bible analysis tools (GLiNER and BookNLP weights and their Python wheels): a download that starts without the narrator's
  install, a row that installs before every file is pinned, or a wheel that is run or imported at download time is in scope.
- The in-app update ([ADR 0072](docs/adr/0072-the-app-updates-itself-from-this-repositorys-releases-and-never-installs-without-a-click.md)): once a day the app asks GitHub for the list of releases of this repository (it sends no identifier beyond the program name and version, and it can be switched off in Settings). Reports about that request revealing more than that, about the app trusting the release list beyond what it validates, or about an update being applied without the narrator's click are in scope.
- Path traversal, command injection or unsafe file handling when the app opens a project, a manuscript, an archive, a REAPER
  project or the audio it names, or when a sidecar reads the audio and writes the files an analysis manifest names: a read or
  write outside the files the narrator chose or the project names, or a parsed file that runs code or exhausts memory (threat model
  rows 4e, 4f, 6a to 6e, 6g, 6j and 1g).
- A file the app writes for the narrator to share (the Delivery report, the production status report, the pronunciation query
  CSV) that lands outside the folder it is meant for, overwrites an existing file, carries a path, an amount or text the narrator
  did not choose to include, or holds a cell that runs as a formula in a spreadsheet; and an answered query file read back that
  changes more than the entries its own ids name (rows 6h, 7c and 7d;
  [ADR 0406](docs/adr/0406-the-status-report-leaves-out-the-contracted-amount-and-effective-rate-unless-the-narrator-opts-in.md)).
- The run log every tool run writes (`logs/run.jsonl`, `logs/runs/*.stderr.jsonl`; [ADR 0251](docs/adr/0251-tool-runs-are-logged-as-json-lines-through-slog-with-a-run-id-and-content-is-never-logged.md)) and the diagnostics bundle Settings can save from it (`SystemCopyDiagnostics`) or the folder it can open (`SystemOpenLogFolder`): manuscript, audio or transcript text reaching either is in scope, as is the export landing anywhere but the folder the narrator picked in that session's file picker.
- A file the app keeps in a project or user folder that makes it run, open, fetch or write anything else, or puts markup into
  the page ([data files](docs/reference/data-files.md); threat model row 6i, and rows 6m and 6zc for a file that names a path
  the host opens). A hand-edited copy that only changes the narrator's own notes, marks, decisions, dates or verdicts crosses no
  boundary and is not a vulnerability.
- The Story Bible import (`ExtractionImportPreview`, `ExtractionImportCommit`; the
  [storybible-import format](docs/architecture/storybible-import-format.md)): the page sends the text of a file the narrator chose. A file
  that makes the host open a path, fetch a URL, evaluate a formula or run anything, that gets past the size, UTF-8 or NUL checks, or that
  makes a commit store rows the preview of the same text did not show, is in scope; a file that only offers wrong suggestions is the
  documented residual risk (threat model row 6zb).
- Weaknesses in the release pipeline (for example an installer or checksum that does not match the reviewed build, or a release asset without valid build provenance). What the pipeline promises, and what it does not: every release asset has a SHA-256 file (it detects a damaged download, not a tampered one) and a build-provenance attestation you can check with `gh attestation verify` ([Build provenance](docs/operations/ci-and-releases.md#build-provenance)); the releases are **unsigned** by decision, so Windows SmartScreen warns and that warning alone is not a vulnerability; and the owner-only settings that back the pipeline (rulesets, the `production` environment, immutable releases, action pinning) are listed in [Tracking work on GitHub](docs/operations/github-workflow.md#repository-settings-that-only-the-owner-can-change).
- The arguments and session files the app hands its local sidecars and the FFmpeg encoder, for example a value from the interface becoming a
  sidecar option, a file path FFmpeg reads as an option or a URL, an encode that writes over its source or an existing file, or the teleprompter's stop, control and credits-text files in the session folder
  ([ADR 0150](docs/adr/0150-the-teleprompter-reads-credits-as-a-host-rendered-script-file-not-a-chapter.md)).
- The built-in recorder (rows 4g and 4h): a take that overwrites, truncates or deletes an existing file, a device opened that the
  narrator did not choose or left open after they stop, a file written outside the project's `Recordings` folder, or captured
  audio leaving the machine.
- The Master & QC export (rows 6q, 6r and 6s): a file written to a path the narrator did not choose, inside the project's own
  `narration-utils/` folder, over an existing file or over its own source, or a package subfolder that escapes the chosen root.
- The file protocol between the app and REAPER (the session folder under REAPER's resource path, the command files the Lua bridge
  reads and the paths it opens), the arguments a DAW or a shortcut starts the app with, and the local `/media` route that plays a
  project's audio: a command that another process can forge into opening or writing a path, running an action or code, rendering,
  changing the project beyond what the narrator approved, changing a REAPER preference, or stopping or restarting a recording the
  app did not start (`roll`), or a route that serves a file the project does not name (rows 5a to
  5o, 6b, 6e and 6f).
- The Audacity scripting pipe (`mod-script-pipe`, [ADR 0355](docs/adr/0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md)): a label text, path or other value from the app that changes the command Audacity runs, an export that writes anywhere but a local file with an audio extension, or a reply from the pipe that the app uses as anything but data; and a mastering-port render through Audacity's Macro Manager (`ApplyMacro`, the mastering port's `audacity` row; [ADR 0306](docs/adr/0306-mastering-is-a-provider-port-and-measurement-stays-one-in-process-judge.md), [ADR 0460](docs/adr/0460-the-audacity-mastering-row-is-its-own-row-not-daw-and-imports-the-source-as-its-own-track-before-the-macro.md); Experimental, and not yet sent by any screen in this version), which imports the source to master as its own new track and applies the narrator's named macro only to that track, never to whatever else is open, and only after the narrator approves that one render, with a one-time approval: a macro applied without approval, applied to more than the imported track, or an exported file written outside the run folder this app made or over an existing file, is a vulnerability.
- The desktop shell itself: it runs on the Wails v3 beta, pinned at v3.0.0-beta.26 ([ADR 0200](docs/adr/0200-the-desktop-shell-runs-on-wails-v3-beta-pinned-at-v3-0-0-beta-25.md)). A way for the page, or anything else, to call the app beyond its own bindings, or to reach the app's Wails runtime endpoint from anything but its own window, is in scope.
- Device input the webview reads directly: a MIDI footswitch or controller through the Web MIDI API, or a HID pedal or button device through the WebHID API, feature-detected and read only where a webview exposes them ([the Web MIDI/WebHID spike](docs/research/web-midi-hid-webview-spike.md); [ADR 0361](docs/adr/0361-app-commands-go-through-one-registry-and-keyboard-midi-and-hid-are-input-sources-bound-by-a-remappable-keymap.md)). What either produces is a command already reachable from the keyboard; a malformed, oversized or out-of-range device message crashing the app or reaching further than a normalised press instead of being dropped is in scope.
- A one-click web pronunciation lookup (Forvo, YouGlish, Merriam-Webster, Howjsay; `PronunciationLookupOpen`) opens the narrator's default browser to one of four fixed URL templates with the manuscript's own word path-escaped into it; the app never fetches, scrapes or caches any of the four sites and sends no request of its own. A fifth destination (`PronunciationCommonsAudioOpen`) opens a Wikimedia Commons recording named by the locally installed Wiktextract pronunciation index, never a word the narrator typed into a URL. A lookup that reaches a host other than that site's own, or that is usable to run or replace something outside the browser, is in scope.
- The optional Merriam-Webster online dictionary (`PronunciationOnline*`, [ADR 0405](docs/adr/0405-pronunciation-stays-local-first-behind-cmu-wiktextract-and-espeak-with-merriam-webster-as-the-one-narrator-keyed-online-source.md)): on the narrator's own free API key, pasted once and kept sealed with Windows' DPAPI in the per-user `credentials.json`, a press of Look up online (or a batch the narrator confirmed after being told how many names it sends) sends one word to `www.dictionaryapi.com` and caches the answer on the computer. The key leaving the machine to any other host, or appearing in a log, an error, a diagnostics export or the page; a request carrying more than the one word (a passage, a file name, a project id); a request the narrator did not ask for; or a crafted answer doing more than offer a pronunciation, is in scope.

Problems in a third-party dependency belong upstream, but tell us if we ship a version that is affected. The desktop shell's Wails is a pre-release; a Wails advisory that affects the pinned beta counts.

## What the app does on the network

There is no telemetry, no account and no listening port. The only requests the shipped program makes are the once-a-day release check above (off with one setting), the downloads of models, voices, the offline dictionary, the MP3 encoder and an update that you confirm with a click. If you save your own Merriam-Webster key, pressing Look up online on a name sends that one name, with your key, to Merriam-Webster's dictionary API, once: the answer is kept on your computer. Encoding to MP3, M4B or FLAC, and measuring an MP3's levels, all run the downloaded FFmpeg on your computer, on files only: it is given no network protocol. Looking a word up in the manuscript reader reads that dictionary on your computer: it sends nothing. The interface's fonts ship with the program, so opening it contacts no font host ([#238](https://github.com/countrymanprime/narration-utils/issues/238)). The Teleprompter's Moonshine engine (Windows) comes with a library that has a downloader of its own; the shipped program never uses it and runs Moonshine only from a model installed and hash-checked through Settings > Local assets ([ADR 0107](docs/adr/0107-moonshine-ships-inside-the-windows-teleprompter-sidecar-and-runs-only-from-a-verified-catalog-install.md)), so a request from it to Moonshine's servers is a vulnerability. The [threat model](docs/architecture/threat-model.md) lists every boundary, what protects it in the code and what risk is left with its owner; a report about a risk it already lists is still welcome, but it is a known limit, not a new vulnerability.
