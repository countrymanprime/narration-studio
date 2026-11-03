import { z } from 'zod';
import type { TtsInstallJob, TtsInstallState, TtsVoice } from '../contracts/tts';
import { assetInstallJobShape } from './assets';

export const ttsInstallStateSchema = z.enum(['installed', 'not_installed', 'verification_failed']) satisfies z.ZodType<TtsInstallState>;

const voiceIdentityShape = {
  id: z.string(),
  provider: z.string(),
  displayName: z.string(),
  locale: z.string(),
  version: z.string(),
  publisher: z.string(),
  license: z.string(),
  licenseUrl: z.string(),
  modelCardUrl: z.string(),
  provenanceUrl: z.string(),
  attribution: z.string(),
};

/** A voice as the host describes it before it is installed: everything but its install state and download size. */
export const ttsVoiceIdentitySchema = z.object(voiceIdentityShape) satisfies z.ZodType<Omit<TtsVoice, 'downloadSize' | 'installState'>>;

/** A voice install: the shared asset job (`assetInstallJobShape`) that names its voice. */
export const ttsInstallJobSchema = z.object({ ...assetInstallJobShape, voiceId: z.string() }) satisfies z.ZodType<TtsInstallJob>;
