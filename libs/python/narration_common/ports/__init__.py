"""The provider ports' kit (ADR 0301): the Python mirror of the host's ``internal/port``.

Each provider kind (speech recognition, text to speech, pronunciation, capture, extraction) gets a ``typing.Protocol`` beside this kit, a
``Registry`` of its implementations keyed by the name the setting stores, and a conformance suite built from ``conformance``.
Nothing here imports an engine: adapters keep their heavy imports lazy.

Adding an engine:

1. Write the adapter beside its sidecar's code (``sidecars/<sidecar>/core/<engine>_adapter.py`` or a row in the existing adapter module),
   implementing the port's Protocol, with a descriptor under the name the setting will store. Keep its heavy imports inside its methods.
2. Import it from the sidecar's entry module, so it registers and PyInstaller sees it.
3. Add the Go registry row (``apps/desktop/internal/<kind>port``) with the same name and its descriptor (platforms, modes, asset kind). A new
   speech engine whose models install from a new asset kind also needs a branch in ``liveModelDir``
   (``TestEveryLiveEngineInstallsFromACatalogLiveModelDirServes`` fails until it has one).
4. Run the port's suites: they pick up the new row by themselves. The provider guards need no change.
5. If it becomes a default, append its row to ``config/defaults.json``; nothing else changes.
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
