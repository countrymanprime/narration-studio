import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspacePeaks } from '../../../../api/contracts/workspace';

/** One LibriVox reading aligned by the app's recogniser settings, with the host's peaks and a level track (`fixtures/realSpeech/README.md`). */
export interface RealSpeech {
  name: string;
  words: { w: string; t0: number; t1: number; seg: number }[];
  peaks: WorkspacePeaks;
  rms: { hopSeconds: number; windowSeconds: number; dbBase64: string };
}

export const REAL_SPEECH_FILES = ['alice-ch1-librivox', 'alice-ch5-librivox', 'speckled-band-librivox', 'jungle-book-librivox'] as const;

export const loadRealSpeech = (name: string): RealSpeech => JSON.parse(readFileSync(join(__dirname, 'realSpeech', `${name}.json`), 'utf8')) as RealSpeech;
