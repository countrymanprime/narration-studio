/**
 * Sample data behind the mock list of a DAW's own saved effects: REAPER FX chains, the built-in recorder's effects, Audacity macros. A real
 * bridge reads these from the DAW (the chain files in REAPER's FxChains folder, Audacity's macros) and nothing in a screen changes.
 */
import { FxList } from '@/domain/daw'

export const FX_LISTS: Record<string, FxList> = Object.fromEntries(
  Object.entries({
    reaper: {
      source: 'Your REAPER FX chains',
      choices: [
        { id: 'voice-polish', name: 'Voice polish (EQ, compressor, de-esser)' },
        { id: 'deesser', name: 'De-esser only' },
        { id: 'room-tone', name: 'Room tone match' },
        { id: 'telephone', name: 'Telephone' },
        { id: 'whisper', name: 'Whisper boost' },
      ],
    },
    builtin: {
      source: 'Built-in effects',
      choices: [
        { id: 'clean-voice', name: 'Clean voice' },
        { id: 'low-cut', name: 'Low cut 80 Hz' },
        { id: 'deesser', name: 'De-esser' },
        { id: 'gentle-comp', name: 'Gentle compressor' },
      ],
    },
    audacity: {
      source: 'Your Audacity macros',
      choices: [
        { id: 'voice-polish', name: 'Voice polish (macro)' },
        { id: 'noise-reduction', name: 'Noise reduction 12 dB' },
        { id: 'normalise', name: 'Normalise to -3 dB' },
        { id: 'low-cut', name: 'Low cut 80 Hz' },
      ],
    },
  }).map(([k, v]) => [k, FxList.parse(v)]),
)
