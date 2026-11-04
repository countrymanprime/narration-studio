import type { AssetInstallJob } from './assets';

export type WhisperInstallState = 'installed' | 'not_installed' | 'verification_failed';

export type WhisperModel = {
  id: string;
  provider: string;
  displayName: string;
  version: string;
  publisher: string;
  license: string;
  licenseUrl: string;
  modelCardUrl: string;
  provenanceUrl: string;
  attribution: string;
  downloadSize: number;
  installState: WhisperInstallState;
};

export type WhisperInstallJob = AssetInstallJob & { modelId: string };

export interface WhisperApi {
  whisperInstall(modelId: string): Promise<WhisperInstallJob>;
  whisperInstallState(jobId: string): Promise<WhisperInstallJob>;
  whisperInstallCancel(jobId: string): Promise<WhisperInstallJob>;
}
