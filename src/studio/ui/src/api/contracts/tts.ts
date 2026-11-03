import type { AssetInstallJob } from './assets';

export type TtsInstallState = 'installed' | 'not_installed' | 'verification_failed';

export type TtsVoice = {
  id: string;
  provider: string;
  displayName: string;
  locale: string;
  version: string;
  publisher: string;
  license: string;
  licenseUrl: string;
  modelCardUrl: string;
  provenanceUrl: string;
  attribution: string;
  downloadSize: number;
  installState: TtsInstallState;
};

export type TtsInstallJob = AssetInstallJob & { voiceId: string };

export interface TtsApi {
  ttsInstall(voiceId: string): Promise<TtsInstallJob>;
  ttsInstallState(jobId: string): Promise<TtsInstallJob>;
  ttsInstallCancel(jobId: string): Promise<TtsInstallJob>;
}
