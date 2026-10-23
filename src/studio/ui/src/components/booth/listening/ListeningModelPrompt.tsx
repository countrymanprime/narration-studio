import { AssetFacts } from '../../assets/AssetFacts';
import { AssetInstallPrompt } from '../../assets/AssetInstallPrompt';
import { ENGINE_LABELS, type TeleprompterSession } from '../useTeleprompterSession';

/**
 * The live engine's model question, asked when a session found its model missing (`session.prompt`): nothing downloads until the
 * narrator confirms, and a finished download starts the session. The Companion's frozen `ReadAlongView` keeps its own copy (DQ-13).
 */
export function ListeningModelPrompt({ session }: { session: Pick<TeleprompterSession, 'prompt' | 'modelInstall' | 'closeModelPrompt'> }) {
  const { prompt } = session;
  if (!prompt) return null;
  const engine = ENGINE_LABELS[prompt.engine];
  return (
    <AssetInstallPrompt
      ask={{
        title: `Download local ${engine} model?`,
        body: `The ${prompt.model.displayName} ${engine} model listens for your voice. It is not bundled with Narration Studio and will be stored in your per-user asset cache.`,
        confirmLabel: 'Download model',
      }}
      workTitle={`Downloading ${engine} model`}
      install={session.modelInstall}
      dismiss={session.closeModelPrompt}
    >
      <AssetFacts
        label="Model"
        name={prompt.model.displayName}
        version={prompt.model.version}
        publisher={prompt.model.publisher}
        license={prompt.model.license}
        licenseUrl={prompt.model.licenseUrl}
        modelCardUrl={prompt.model.modelCardUrl}
        provenanceUrl={prompt.model.provenanceUrl}
        downloadSize={prompt.downloadSize}
        diskSize={prompt.diskSize}
        installPath={prompt.installPath}
      />
    </AssetInstallPrompt>
  );
}
