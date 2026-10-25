import argparse
import contextlib
import importlib.util
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from narration_common import brand

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)


def _write_bible(path: Path, document: dict) -> None:
    """Writes a Story Bible as the host does: two-space indented, non-ASCII as itself, a trailing newline."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _write_manuscript(root: Path, chapter_title: str, paragraph_texts: list[str]) -> Path:
    """Writes a minimal canonical manuscript.json directly at the path
    manuscript_guide.py reads via canonical_manuscript.load_file.

    Import (turning a .docx/.md source into this file) is Go-host-only now -
    see src/studio/desktop/cmd/manuscript-import and src/studio/desktop/internal/manuscript.
    These tests only need a real, valid canonical file to build a Story
    Bible from, not the import step itself.
    """
    paragraphs = [
        {
            "id": f"p-{index + 1:06d}",
            "index": index,
            "chapterId": "c-0001",
            "chapterTitle": chapter_title,
            "sectionId": None,
            "text": text,
            "sourceIndex": index,
        }
        for index, text in enumerate(paragraph_texts)
    ]
    data = {
        "schemaVersion": guide.canonical_manuscript.SCHEMA_VERSION,
        "documentId": "test-document",
        "importedAt": "2026-01-01T00:00:00+00:00",
        "importer": {"format": "markdown", "version": guide.canonical_manuscript.IMPORTER_VERSION},
        "source": {"fileName": "fixture.md", "sha256": "0" * 64, "storedPath": brand.PROJECT_FOLDER + "/manuscript/sources/fixture.md"},
        "chapters": [
            {
                "id": "c-0001",
                "title": chapter_title,
                "subtitle": None,
                "index": 0,
                "wordCount": sum(len(text.split()) for text in paragraph_texts),
                "sections": [],
            }
        ],
        "paragraphs": paragraphs,
    }
    path = guide.canonical_manuscript.manuscript_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


class ManuscriptGuideTests(unittest.TestCase):
    def test_reference_material_is_not_scanned_as_narration(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "manuscript.json"
            path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "documentId": "test",
                        "chapters": [
                            {"id": "c-1", "title": "Chapter 1", "contentKind": "narration"},
                            {"id": "c-2", "title": "Characters", "contentKind": "reference"},
                        ],
                        "paragraphs": [
                            {"id": "p-1", "chapterId": "c-1", "chapterTitle": "Chapter 1", "text": "Ada arrives."},
                            {"id": "p-2", "chapterId": "c-2", "chapterTitle": "Characters", "text": "Ben Holt."},
                        ],
                    }
                ),
                encoding="utf-8",
            )
            self.assertEqual(["Ada arrives."], [item["text"] for item in guide.load_manuscript(str(path))])

    def test_importing_the_module_does_not_import_piper(self):
        # Piper costs about a quarter of a second to import and only render-audio uses it, so every other command must not pay for it.
        code = (
            "import importlib.util, sys;"
            f"spec = importlib.util.spec_from_file_location('manuscript_guide', r'{MODULE_PATH}');"
            "module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module);"
            "print(any(name == 'piper' or name.startswith('piper.') for name in sys.modules))"
        )
        result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
        self.assertEqual("False", result.stdout.strip(), result.stderr)

    def test_preview_uses_bundled_piper_api_not_a_checkout_executable(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            guide_file = root / "ManuscriptGuide" / "manuscript_guide.json"
            _write_bible(guide_file, {"entities": [{"id": "entity-1", "canonical_name": "Dawnspire", "aliases": []}]})
            voice = MagicMock()

            def synthesize(_spoken, wav_file):
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(22050)
                wav_file.writeframes(b"\0\0")

            voice.synthesize_wav.side_effect = synthesize
            with patch.object(guide, "load_voice", return_value=voice) as load:
                guide.render_audio(
                    argparse.Namespace(
                        guide=str(guide_file),
                        entity_id="entity-1",
                        audio_dir=str(root / "ManuscriptGuide" / "audio"),
                        piper_model=str(root / "voice.onnx"),
                        alias_index=None,
                        output_name="preview.wav",
                    )
                )
            load.assert_called_once_with(str(root / "voice.onnx"))
            voice.synthesize_wav.assert_called_once()
            self.assertTrue((root / "ManuscriptGuide" / "audio" / "preview.wav").is_file())

    def _render(self, root: Path, voice, name: str = "Dawnspire", output_name: str = "preview.wav") -> Path:
        """Runs render_audio with a fake Piper voice against a one-entity guide and
        returns the audio directory so a test can inspect what was left behind."""
        guide_file = root / "ManuscriptGuide" / "manuscript_guide.json"
        _write_bible(guide_file, {"entities": [{"id": "entity-1", "canonical_name": name, "aliases": []}]})
        audio_dir = root / "ManuscriptGuide" / "audio"
        args = argparse.Namespace(
            guide=str(guide_file),
            entity_id="entity-1",
            audio_dir=str(audio_dir),
            piper_model=str(root / "voice.onnx"),
            alias_index=None,
            output_name=output_name,
        )
        with patch.object(guide, "load_voice", return_value=voice):
            guide.render_audio(args)
        return audio_dir

    @staticmethod
    def _speaking_voice(frames: int = 100) -> MagicMock:
        def synthesize(_spoken, wav_file):
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(22050)
            wav_file.writeframes(b"\0\0" * frames)

        voice = MagicMock()
        voice.synthesize_wav.side_effect = synthesize
        return voice

    def test_a_synthesis_error_is_reported_not_masked_by_the_wave_writer(self):
        # Piper initialises espeak lazily inside synthesize_wav, before it has set the
        # WAV format. Closing that writer raises "# channels not specified", which used
        # to replace the real error (reproduced against the real voice on a dev build).
        voice = MagicMock()
        voice.synthesize_wav.side_effect = RuntimeError("espeak-ng data directory not found")
        with tempfile.TemporaryDirectory() as temporary, self.assertRaises(ValueError) as caught:
            self._render(Path(temporary), voice)
        self.assertIn("could not be spoken", str(caught.exception))
        self.assertIn("espeak-ng data directory not found", str(caught.exception))
        self.assertNotIn("channels", str(caught.exception))

    def test_a_name_that_produces_no_audio_says_so(self):
        # "..." phonemizes to nothing, so synthesize_wav never sets a format or writes a frame.
        voice = MagicMock()
        voice.synthesize_wav.side_effect = lambda _spoken, _wav: None
        with tempfile.TemporaryDirectory() as temporary, self.assertRaises(ValueError) as caught:
            self._render(Path(temporary), voice, name="...")
        self.assertIn("could not be spoken", str(caught.exception))
        self.assertIn("no audio", str(caught.exception))

    def test_a_failed_render_leaves_no_file_behind(self):
        # A zero-byte WAV at the cache path was trusted by every later preview.
        failing = MagicMock()
        failing.synthesize_wav.side_effect = RuntimeError("boom")
        silent = MagicMock()
        silent.synthesize_wav.side_effect = lambda _spoken, _wav: None
        for label, voice in (("raises", failing), ("silent", silent)):
            with self.subTest(label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                with self.assertRaises(ValueError):
                    self._render(root, voice)
                audio_dir = root / "ManuscriptGuide" / "audio"
                self.assertEqual([], sorted(path.name for path in audio_dir.iterdir()))

    def test_a_render_appears_at_the_target_only_once_it_is_complete(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target_dir = root / "ManuscriptGuide" / "audio"
            during_synthesis: list[bool] = []
            inner = self._speaking_voice()

            def synthesize(spoken, wav_file):
                during_synthesis.append((target_dir / "preview.wav").exists())
                inner.synthesize_wav(spoken, wav_file)

            voice = MagicMock()
            voice.synthesize_wav.side_effect = synthesize
            audio_dir = self._render(root, voice)
            self.assertEqual([False], during_synthesis)
            self.assertEqual(["preview.wav"], sorted(path.name for path in audio_dir.iterdir()))
            self.assertGreater((audio_dir / "preview.wav").stat().st_size, 44)

    def test_an_error_with_no_message_still_names_itself(self):
        voice = MagicMock()
        voice.synthesize_wav.side_effect = RuntimeError()
        with tempfile.TemporaryDirectory() as temporary, self.assertRaises(ValueError) as caught:
            self._render(Path(temporary), voice)
        self.assertTrue(str(caught.exception).endswith("could not be spoken: RuntimeError"), str(caught.exception))

    def test_a_render_that_cannot_be_moved_into_place_leaves_nothing_and_says_so(self):
        # On Windows os.replace fails while another program (antivirus, a player) holds the target open.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            real_replace = os.replace

            def replace(source, target):
                if str(target).endswith("preview.wav"):
                    raise PermissionError(5, "Access is denied")
                real_replace(source, target)

            with patch.object(os, "replace", side_effect=replace), self.assertRaises(ValueError) as caught:
                self._render(root, self._speaking_voice())
            self.assertIn("could not be saved", str(caught.exception))
            self.assertIn("Access is denied", str(caught.exception))
            self.assertEqual([], sorted(path.name for path in (root / "ManuscriptGuide" / "audio").iterdir()))

    def test_partial_files_left_by_a_killed_run_are_swept_up_by_the_next_render(self):
        # The host kills a render at its timeout, so no cleanup runs and the pid in the name means nothing overwrites it.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            audio_dir = root / "ManuscriptGuide" / "audio"
            audio_dir.mkdir(parents=True)
            (audio_dir / "preview.wav.4242.part").write_bytes(b"partial")
            (audio_dir / "other.wav.4242.part").write_bytes(b"another output's file")
            self._render(root, self._speaking_voice())
            self.assertEqual(["other.wav.4242.part", "preview.wav"], sorted(path.name for path in audio_dir.iterdir()))

    def test_a_voice_that_cannot_be_loaded_is_reported_as_the_voice(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            guide_file = root / "guide.json"
            _write_bible(guide_file, {"entities": [{"id": "entity-1", "canonical_name": "Dawnspire", "aliases": []}]})
            args = argparse.Namespace(
                guide=str(guide_file),
                entity_id="entity-1",
                audio_dir=str(root / "audio"),
                piper_model=str(root / "missing.onnx"),
                alias_index=None,
                output_name="preview.wav",
            )
            missing = FileNotFoundError(2, "No such file or directory", "missing.onnx.json")
            with patch.object(guide, "load_voice", side_effect=missing), self.assertRaises(ValueError) as caught:
                guide.render_audio(args)
        self.assertIn("preview voice could not be loaded", str(caught.exception))
        self.assertIn("missing.onnx.json", str(caught.exception))

    def test_main_writes_utf8_to_a_legacy_codepage_pipe(self):
        # A project path with characters outside cp1252 made the sidecar exit 1 after it
        # had written the WAV (reproduced on Windows, where a pipe defaults to cp1252).
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "项目"
            guide_file = root / "ManuscriptGuide" / "manuscript_guide.json"
            _write_bible(guide_file, {"entities": [{"id": "entity-1", "canonical_name": "Dawnspire", "aliases": []}]})
            out_pipe, err_pipe = io.BytesIO(), io.BytesIO()
            legacy_out = io.TextIOWrapper(out_pipe, encoding="cp1252", write_through=True)
            legacy_err = io.TextIOWrapper(err_pipe, encoding="cp1252", write_through=True)
            argv = [
                "manuscript_guide.py",
                "render-audio",
                "--guide",
                str(guide_file),
                "--entity-id",
                "entity-1",
                "--audio-dir",
                str(root / "audio"),
                "--piper-model",
                "v.onnx",
            ]
            with (
                patch.object(guide, "load_voice", return_value=self._speaking_voice(10)),
                patch.object(sys, "argv", argv),
                patch.object(sys, "stdout", legacy_out),
                patch.object(sys, "stderr", legacy_err),
            ):
                guide.main()
            printed = out_pipe.getvalue().decode("utf-8")
            self.assertTrue(printed.startswith("AUDIO|"), printed)
            self.assertIn("项目", printed)


def _stub_spacy(entities: dict[str, str]):
    """Patches spacy.load with a fake pipeline. `entities` maps a literal entity
    text to its NER label; every whole-word occurrence in each paragraph is
    reported as an entity of that label."""

    def pipe(texts):
        for text in texts:
            found = [
                SimpleNamespace(text=literal, label_=label, start_char=match.start(), end_char=match.end())
                for literal, label in entities.items()
                for match in re.finditer(r"(?<![A-Za-z])" + re.escape(literal) + r"(?![A-Za-z])", text)
            ]
            yield SimpleNamespace(ents=sorted(found, key=lambda ent: ent.start_char))

    return patch("spacy.load", return_value=SimpleNamespace(pipe=pipe))


class EntitiesCommandTests(unittest.TestCase):
    """``entities``: the language model's spans for each narrated paragraph, everything else being the host's (internal/guide/build.go)."""

    def _run(self, *texts: str, model: str = "stub") -> tuple[list[dict], list[str]]:
        messages: list[str] = []
        with tempfile.TemporaryDirectory() as temporary:
            manuscript = _write_manuscript(Path(temporary), "Chapter 1", list(texts))
            out = io.StringIO()
            with patch.object(guide, "log", side_effect=lambda message, **_: messages.append(message)), contextlib.redirect_stdout(out):
                guide.entities(SimpleNamespace(manuscript=str(manuscript), spacy_model=model, words_file=""))
        return [json.loads(line) for line in out.getvalue().splitlines()], messages

    def test_each_paragraph_is_one_line_with_every_span_the_model_found(self):
        with _stub_spacy({"Captain Arelian": "PERSON", "Dawnspire": "GPE", "noon": "TIME"}):
            lines, messages = self._run("Captain Arelian met noon in Dawnspire.", "Nothing here.")
        self.assertEqual(
            [
                {"available": True},
                {"paragraphId": "p-000001", "entities": [[0, 15, "PERSON"], [20, 24, "TIME"], [28, 37, "GPE"]]},
                {"paragraphId": "p-000002", "entities": []},
            ],
            lines,
        )
        self.assertEqual([], messages)

    def test_a_model_that_cannot_be_loaded_is_reported_and_answered_unavailable(self):
        with patch.dict(sys.modules, {"spacy": None}):
            lines, messages = self._run("Ada arrives.", model="en_core_web_sm")
        self.assertEqual([{"available": False}], lines)
        self.assertEqual(1, len(messages))
        self.assertTrue(messages[0].startswith("WARNING: spaCy model unavailable ("), messages[0])
        self.assertTrue(messages[0].endswith("); using lower-quality rules-only extraction."), messages[0])

    def test_with_a_words_file_it_then_waits_for_the_names_and_answers_their_pronunciations(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, "Chapter 1", ["Ada met Wren."])
            words = root / "words.json"

            def host_writes_the_words():
                time.sleep(0.2)
                (root / "words.tmp").write_text(json.dumps(["Ada", "Wren"]), encoding="utf-8")
                (root / "words.tmp").replace(words)

            writer = threading.Thread(target=host_writes_the_words)
            writer.start()
            out = io.StringIO()
            args = SimpleNamespace(manuscript=str(manuscript), spacy_model="stub", words_file=str(words), espeak_library="", default_source="cmu")
            with (
                _stub_spacy({"Ada": "PERSON"}),
                patch.object(guide, "pronunciation", side_effect=lambda name, espeak, source: {"ipa": name.lower(), "source": source}),
                contextlib.redirect_stdout(out),
            ):
                guide.entities(args)
            writer.join()
        lines = [json.loads(line) for line in out.getvalue().splitlines()]
        self.assertEqual(
            [
                {"available": True},
                {"paragraphId": "p-000001", "entities": [[0, 3, "PERSON"]]},
                {"ipa": "ada", "source": "cmu"},
                {"ipa": "wren", "source": "cmu"},
            ],
            lines,
        )

    def test_a_words_file_that_never_comes_ends_the_wait(self):
        with tempfile.TemporaryDirectory() as temporary:
            manuscript = _write_manuscript(Path(temporary), "Chapter 1", ["Ada."])
            args = SimpleNamespace(
                manuscript=str(manuscript), spacy_model="stub", words_file=str(Path(temporary) / "never.json"), espeak_library="", default_source=""
            )
            with (
                patch.dict(sys.modules, {"spacy": None}),
                patch.object(guide, "WORDS_FILE_TIMEOUT", 0.05),
                patch.object(guide, "log"),
                contextlib.redirect_stdout(io.StringIO()),
                self.assertRaisesRegex(ValueError, "never asked"),
            ):
                guide.entities(args)

    def test_offsets_are_code_points_as_the_host_counts_them(self):
        with _stub_spacy({"Zoë": "PERSON"}):
            lines, _ = self._run("😀 Zoë waved.")
        self.assertEqual([[2, 5, "PERSON"]], lines[1]["entities"])

    def test_the_command_is_registered_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, "Chapter 1", ["Ada arrives."])
            before = sorted(path.name for path in root.rglob("*"))
            argv = ["manuscript_guide.py", "entities", "--manuscript", str(manuscript), "--spacy-model", "stub"]
            with _stub_spacy({"Ada": "PERSON"}), patch.object(sys, "argv", argv), contextlib.redirect_stdout(io.StringIO()) as out:
                guide.main()
            self.assertEqual(before, sorted(path.name for path in root.rglob("*")))
        self.assertEqual('{"available": true}', out.getvalue().splitlines()[0])


class SelfCheckTests(unittest.TestCase):
    """`self-check` is what the packaged-app smoke test runs against the frozen sidecar: it proves the data the freeze must carry
    (the CMU dictionary and Piper's espeak-ng data) is really there, without needing the 114 MB voice."""

    def test_passes_when_the_dictionary_and_the_espeak_data_load(self):
        results = guide.run_self_check()
        self.assertEqual([entry["name"] for entry in results], ["cmudict", "espeak", "tool-runtime"])
        self.assertTrue(all(entry["ok"] for entry in results), results)
        self.assertIn("HH", results[0]["detail"])  # "hello" from the CMU dictionary, in ARPAbet
        self.assertTrue(results[1]["detail"])  # the phonemes espeak-ng made of "hello"

    def test_a_dictionary_that_cannot_load_fails_that_check_and_says_why(self):
        # A frozen guide has logged exactly this: the freeze carried no cmudict metadata.
        with patch("pronouncing.phones_for_word", side_effect=RuntimeError("No package metadata was found for cmudict")):
            results = guide.run_self_check()
        cmudict = results[0]
        self.assertFalse(cmudict["ok"])
        self.assertIn("No package metadata was found for cmudict", cmudict["detail"])
        self.assertTrue(results[1]["ok"], "one failing check must not hide the other")

    def test_a_missing_espeak_data_directory_fails_that_check_and_names_it(self):
        with tempfile.TemporaryDirectory() as temporary:
            missing = Path(temporary) / "espeak-ng-data"
            results = guide.run_self_check(espeak_data_dir=missing)
        espeak = results[1]
        self.assertFalse(espeak["ok"])
        self.assertIn(str(missing), espeak["detail"])

    def test_a_dictionary_with_no_entry_for_a_common_word_fails(self):
        with patch("pronouncing.phones_for_word", return_value=[]):
            results = guide.run_self_check()
        self.assertFalse(results[0]["ok"])

    def test_with_a_voice_it_also_speaks_one_word(self):
        voice = ManuscriptGuideTests._speaking_voice(frames=200)
        with tempfile.TemporaryDirectory() as temporary, patch.object(guide, "load_voice", return_value=voice) as load:
            results = guide.run_self_check(piper_model=str(Path(temporary) / "voice.onnx"))
            self.assertEqual(load.call_count, 1)
        self.assertEqual([entry["name"] for entry in results], ["cmudict", "espeak", "synthesis", "tool-runtime"])
        self.assertTrue(results[2]["ok"], results[2])
        self.assertIn("200", results[2]["detail"])  # frames written

    def test_a_voice_that_cannot_speak_fails_the_synthesis_check_with_the_real_reason(self):
        voice = MagicMock()
        voice.synthesize_wav.side_effect = RuntimeError("espeak-ng data directory not found")
        with tempfile.TemporaryDirectory() as temporary, patch.object(guide, "load_voice", return_value=voice):
            results = guide.run_self_check(piper_model=str(Path(temporary) / "voice.onnx"))
        self.assertFalse(results[2]["ok"])
        self.assertIn("espeak-ng data directory not found", results[2]["detail"])

    def test_the_command_prints_one_json_report_and_exits_zero_when_every_check_passes(self):
        out = io.StringIO()
        with patch.object(sys, "argv", ["manuscript_guide.py", "self-check"]), patch("sys.stdout", out):
            guide.main()  # returns: exit code 0
        report = json.loads(out.getvalue())
        self.assertTrue(report["ok"])
        self.assertEqual([entry["name"] for entry in report["checks"]], ["cmudict", "espeak", "tool-runtime"])

    def test_the_command_exits_one_and_still_prints_the_report_when_a_check_fails(self):
        out = io.StringIO()
        with (
            patch.object(sys, "argv", ["manuscript_guide.py", "self-check"]),
            patch("sys.stdout", out),
            patch("pronouncing.phones_for_word", side_effect=RuntimeError("broken")),
            self.assertRaises(SystemExit) as caught,
        ):
            guide.main()
        self.assertEqual(caught.exception.code, 1)
        report = json.loads(out.getvalue())
        self.assertFalse(report["ok"])
        self.assertIn("broken", json.dumps(report))


class CapabilitiesTests(unittest.TestCase):
    """`capabilities` mirrors live_asr.py's --capabilities: every row this
    process has actually registered in ENGINES (voice engines) and SOURCES (pronunciation), by port then name,
    registration only - never whether the row actually loads."""

    @staticmethod
    def _fake_registry(rows):
        """A registry-shaped stand-in: iterating it gives objects with a `.descriptor`, the only thing
        capabilities_report() reads from ENGINES/SOURCES."""
        return [SimpleNamespace(descriptor=row) for row in rows]

    def test_capabilities_report_lists_every_registered_row_by_port_and_name(self):
        from narration_common.ports.pronunciation import PronunciationDescriptor
        from narration_common.ports.tts import TtsDescriptor

        engines = self._fake_registry([TtsDescriptor(name="piper", label="Piper", asset_kind="tts")])
        sources = self._fake_registry(
            [
                PronunciationDescriptor("cmu", "CMU dictionary", modes=("pronounce",)),
                PronunciationDescriptor("espeak", "eSpeak NG", modes=("pronounce",)),
            ]
        )

        report = guide.capabilities_report(engines, sources)

        self.assertEqual(
            report,
            {
                "type": "capabilities",
                "tts": {"piper": {"label": "Piper", "platforms": [], "modes": [], "asset": "tts", "loadable": None}},
                "pronunciation": {
                    "cmu": {"label": "CMU dictionary", "platforms": [], "modes": ["pronounce"], "loadable": None},
                    "espeak": {"label": "eSpeak NG", "platforms": [], "modes": ["pronounce"], "loadable": None},
                },
            },
        )

    def test_capabilities_report_omits_asset_for_a_row_with_no_asset_kind(self):
        from narration_common.ports.pronunciation import PronunciationDescriptor

        report = guide.capabilities_report([], self._fake_registry([PronunciationDescriptor("cmu", "CMU dictionary", modes=("pronounce",))]))

        self.assertNotIn("asset", report["pronunciation"]["cmu"])

    def test_capabilities_report_never_verifies_loading(self):
        from narration_common.ports.tts import TtsDescriptor

        report = guide.capabilities_report(self._fake_registry([TtsDescriptor(name="piper", label="Piper")]), [])

        self.assertIsNone(report["tts"]["piper"]["loadable"])

    def test_capabilities_report_only_lists_what_actually_registered(self):
        # The fault-detection case: a row an adapter failed to register never reaches ENGINES/
        # SOURCES, so it is simply absent here too - reading the registry as it stands is the whole mechanism.
        from narration_common.ports.tts import TtsDescriptor

        report = guide.capabilities_report(self._fake_registry([TtsDescriptor(name="piper", label="Piper")]), [])

        self.assertEqual(set(report["tts"]), {"piper"})
        self.assertEqual(report["pronunciation"], {})

    def test_capabilities_reflects_the_real_engines_and_sources_registries(self):
        report = guide.capabilities_report()

        self.assertEqual(set(report["tts"]), {"piper"})
        self.assertEqual(set(report["pronunciation"]), {"cmu", "wiktextract", "espeak"})

    def test_the_command_prints_one_json_report_and_exits_zero(self):
        out = io.StringIO()
        with patch.object(sys, "argv", ["manuscript_guide.py", "capabilities"]), patch("sys.stdout", out):
            guide.main()
        report = json.loads(out.getvalue())
        self.assertEqual(report["type"], "capabilities")
        self.assertIn("piper", report["tts"])
        self.assertIn("cmu", report["pronunciation"])


if __name__ == "__main__":
    unittest.main()
