import { useEffect, useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { usePendingAction } from '../../../hooks/usePendingAction';
import type { TtsApi } from '../../../api/contracts/tts';
import type { WhisperApi } from '../../../api/contracts/whisper';
import { usePort } from '../../../ports/usePort';
import type { ScopedSettingField } from '../../../types';

type Ports = { tts: TtsApi; whisper: WhisperApi };
import { Button } from '../../primitives/Button';
import { ConfirmDialog } from '../../primitives/ConfirmDialog';
import type { Notify } from '../../primitives/Toast';

type LocalModel = { id: string; displayName: string; installState: string; downloadSize: number };

// The two catalog-managed local assets a settings panel names (a Piper voice for TTS, a Whisper model for Proof), each
// with the words it is shown with and the host calls that read and remove it.
const KINDS = {
  voice: {
    heading: 'Local TTS previews',
    about:
      'Piper voices are optional, catalog-managed local assets. Selecting a voice never downloads it; downloading is confirmed when you request a preview.',
    remove: 'Remove local voice…',
    title: 'Remove local preview voice?',
    body: (name: string) =>
      `Remove ${name} from this computer? Your settings and project preview WAVs remain; requesting a new preview will ask to download the voice again.`,
    confirm: 'Remove voice',
    removed: 'Local preview voice removed.',
    read: async ({ tts }: Ports): Promise<LocalModel | undefined> => {
      const catalog = await tts.ttsCatalog();
      return catalog.voices.find((voice) => voice.id === catalog.voice.id);
    },
    drop: ({ tts }: Ports, id: string) => tts.ttsRemove(id),
  },
  model: {
    heading: 'Local Whisper models',
    about:
      'Whisper models are optional, catalog-managed local assets. Selecting a model never downloads it; downloading is confirmed when you start a comparison.',
    remove: 'Remove local model…',
    title: 'Remove local Whisper model?',
    body: (name: string) => `Remove ${name} from this computer? Starting a comparison with this model selected will ask to download it again.`,
    confirm: 'Remove model',
    removed: 'Local Whisper model removed.',
    read: async ({ whisper }: Ports): Promise<LocalModel | undefined> => {
      const catalog = await whisper.whisperCatalog();
      return catalog.models.find((model) => model.id === catalog.model.id);
    },
    drop: ({ whisper }: Ports, id: string) => whisper.whisperRemove(id),
  },
} as const;

const INSTALL_STATE: Record<string, string> = { installed: 'Installed and verified', verification_failed: 'Needs repair' };

/**
 * The selected Piper voice (TTS) or Whisper model (Proof): whether it is on this computer, its size, and Remove, which
 * asks first (ADR 0075: the confirm stays busy until the call ends). It reads the catalog again whenever `fields` (the
 * panel's settings, which hold the selection) are read again.
 */
export function LocalModelCard({ kind, fields, notify }: { kind: keyof typeof KINDS; fields: readonly ScopedSettingField[]; notify: Notify }) {
  const tts = usePort('tts');
  const whisper = usePort('whisper');
  const words = KINDS[kind];
  const [selected, setSelected] = useState<LocalModel>();
  const [confirming, setConfirming] = useState(false);
  const [generation, setGeneration] = useState(0);
  const removing = usePendingAction();

  useEffect(() => {
    let live = true;
    words.read({ tts, whisper }).then(
      (model) => live && setSelected(model),
      (error) => live && notify(describeApiError(error)),
    );
    return () => {
      live = false;
    };
  }, [tts, whisper, fields, generation, notify, words]);

  return (
    <div className="mb-4 space-y-3 rounded-md p-3 text-sm" style={{ background: 'var(--surface-2)' }}>
      <div>
        <div className="font-medium">{words.heading}</div>
        <div style={{ color: 'var(--text-muted)' }}>{words.about}</div>
      </div>
      {selected && (
        <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <div>
            <div className="font-medium">{selected.displayName}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {INSTALL_STATE[selected.installState] ?? 'Not installed'} · {Math.ceil(selected.downloadSize / (1024 * 1024))} MB
            </div>
          </div>
          {selected.installState === 'installed' && (
            <Button variant="secondary" type="button" onClick={() => setConfirming(true)}>
              {words.remove}
            </Button>
          )}
        </div>
      )}
      {confirming && selected && (
        <ConfirmDialog
          title={words.title}
          body={words.body(selected.displayName)}
          confirmLabel={words.confirm}
          confirmVariant="danger"
          pending={removing.isPending('remove')}
          confirm={() =>
            void removing.run('remove', async () => {
              try {
                await words.drop({ tts, whisper }, selected.id);
                setConfirming(false);
                notify(words.removed);
                setGeneration((count) => count + 1);
              } catch (error) {
                notify(describeApiError(error), 'error');
              }
            })
          }
          cancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
