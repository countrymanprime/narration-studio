"""The provider ports' kit (ADR 0301): the Python mirror of the host's ``internal/port``.

Each provider kind (speech recognition, text to speech, pronunciation, capture, extraction) gets a ``typing.Protocol`` beside this kit, a
``Registry`` of its implementations keyed by the name the setting stores, and a conformance suite built from ``conformance``.
Nothing here imports an engine: adapters keep their heavy imports lazy.
"""

from . import asr, asr_conformance, conformance, extraction, extraction_conformance, registry
from .registry import PLATFORMS, Described, Descriptor, Level, NotSupportedError, Registry, current_platform
from .vocabulary import levels_in_golden

__all__ = [
    "PLATFORMS",
    "Described",
    "Descriptor",
    "Level",
    "NotSupportedError",
    "Registry",
    "asr",
    "asr_conformance",
    "conformance",
    "current_platform",
    "extraction",
    "extraction_conformance",
    "levels_in_golden",
    "registry",
]
