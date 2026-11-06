// The golden payloads for downloaded assets (voice, Whisper, the asset list): which schema owns each file in tests/fixtures/contracts/ (see index.ts).
import type { z } from 'zod';
import { assetCatalogSchema, assetFolderPickSchema, assetInstallJobSchema, assetMoveStateSchema, assetVerifyResultSchema } from '../schemas/assets';
import { ttsInstallJobSchema } from '../schemas/tts';
import { whisperInstallJobSchema } from '../schemas/whisper';

export const assetsGoldens: Record<string, z.ZodType> = {
  'tts-install-downloading.json': ttsInstallJobSchema,
  'tts-install-success.json': ttsInstallJobSchema,
  'tts-install-error.json': ttsInstallJobSchema,
  'tts-install-cancelled.json': ttsInstallJobSchema,
  'asset-install-downloading.json': assetInstallJobSchema,
  'asset-install-unpack-error.json': assetInstallJobSchema,
  'assets-list.json': assetCatalogSchema,
  'assets-verify.json': assetVerifyResultSchema,
  'assets-move-idle.json': assetMoveStateSchema,
  'assets-move-copying.json': assetMoveStateSchema,
  'assets-move-error.json': assetMoveStateSchema,
  'assets-folder-pick.json': assetFolderPickSchema,
  'whisper-install-downloading.json': whisperInstallJobSchema,
  'tts-install-verifying.json': ttsInstallJobSchema,
  'whisper-install-success.json': whisperInstallJobSchema,
};
