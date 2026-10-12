import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import type { AssetItem } from '../../../api/contracts/assets';
import type { DefinitionSource } from '../../../api/contracts/system';
import { apiErrorMessage } from '../../../api/errorMessage';
import { definitionSourceOf } from '../../../api/schemas/settings';
import { useAssetInstall } from '../../../hooks/useAssetInstall';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { Radio } from '../../primitives/RadioGroup';
import { SectionLabel } from '../../primitives/SectionLabel';
import { StatusBadge, type StatusTone } from '../../primitives/StatusBadge';

/** The local dictionary as the asset list reports it, `downloading` while an install runs, or `absent` when the catalog has none. */
export type LocalDictionaryState = AssetItem['installState'] | 'downloading' | 'absent';
/** The online service: `online`, `offline` (no network), or `no_key` (online, but no key is saved for it). */
export type OnlineServiceState = 'online' | 'offline' | 'no_key';

// The mock's wording (`pages/Settings.tsx`, "Definitions and pronunciations").
const SOURCES: { value: DefinitionSource; label: string }[] = [
  { value: 'web', label: 'Web page. Opens the dictionary site.' },
  { value: 'local', label: 'Local dictionary. Shows definitions and pronunciations inline.' },
  { value: 'api', label: 'Online service. Shows definitions inline when online.' },
];

const DICTIONARY_BADGE: Record<LocalDictionaryState, { tone: StatusTone; label: string }> = {
  installed: { tone: 'success', label: 'Installed' },
  not_installed: { tone: 'neutral', label: 'Not installed' },
  verification_failed: { tone: 'warning', label: 'Needs repair' },
  downloading: { tone: 'progress', label: 'Downloading' },
  absent: { tone: 'neutral', label: 'Not available' },
};

const SERVICE_BADGE: Record<OnlineServiceState, { tone: StatusTone; label: string }> = {
  online: { tone: 'success', label: 'Online' },
  offline: { tone: 'warning', label: 'Offline' },
  no_key: { tone: 'warning', label: 'No key saved' },
};

/** The mock's "Definitions and pronunciations" panel: the three sources, the local dictionary installed or not with Download or Remove, and the online service's status. Takes props only. */
export function DefinitionsView({
  source,
  onSource,
  dictionary,
  percent,
  busy,
  onDownload,
  onRemove,
  service,
  error,
}: {
  source: DefinitionSource;
  onSource: (source: DefinitionSource) => void;
  dictionary: LocalDictionaryState;
  /** The download's real percent while `dictionary` is `downloading`. */
  percent?: number;
  /** A download is starting or a removal is in flight. */
  busy: boolean;
  onDownload: () => void;
  onRemove: () => void;
  service: OnlineServiceState;
  /** The host's sentence for the last refused change. */
  error?: string;
}) {
  const labelId = useId();
  const badge = DICTIONARY_BADGE[dictionary];
  const extras: Partial<Record<DefinitionSource, ReactNode>> = {
    local: (
      <>
        <StatusBadge tone={badge.tone} label={dictionary === 'downloading' && percent !== undefined ? `${badge.label} ${percent}%` : badge.label} />
        {dictionary === 'installed' ? (
          <IconButton action="remove" label="Remove" variant="danger" size="sm" pending={busy} onClick={onRemove} />
        ) : dictionary === 'absent' ? null : (
          <IconButton action="download" label="Download" size="sm" pending={busy || dictionary === 'downloading'} onClick={onDownload} />
        )}
      </>
    ),
    api: <StatusBadge tone={SERVICE_BADGE[service].tone} label={SERVICE_BADGE[service].label} />,
  };
  return (
    <Panel title="Definitions and pronunciations">
      <div className="space-y-2.5">
        <SectionLabel as="div" id={labelId}>
          Show definitions from
        </SectionLabel>
        <div role="group" aria-labelledby={labelId} className="space-y-2.5">
          {SOURCES.map((option) => (
            <div key={option.value} className="flex min-h-[var(--button-height-sm)] flex-wrap items-center gap-2">
              <Radio
                name="definition-source"
                value={option.value}
                label={option.label}
                checked={source === option.value}
                onCheckedChange={() => onSource(option.value)}
              />
              {extras[option.value]}
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="m-0 text-sm text-[var(--danger-text)]">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}

/** Whether the computer is online, as the browser knows it, following the `online` and `offline` events. */
function useNetwork(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

const DICTIONARY_KIND = 'dictionary';

/**
 * Settings > Definitions and pronunciations: Script.definition_source saved for every project (the Words tab reads the same setting), the
 * local dictionary asset with Download or Remove, and whether the online service can answer: the network, and a saved key for it.
 */
export function DefinitionsPanel() {
  const system = usePort('system');
  const assets = usePort('assets');
  const pronunciationOnline = usePort('pronunciationOnline');
  const network = useNetwork();
  const [source, setSource] = useState<DefinitionSource>('web');
  const [dictionary, setDictionary] = useState<AssetItem>();
  const [listed, setListed] = useState(false);
  const [keySaved, setKeySaved] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    system.settingsForScope('global').then(
      (settings) => live && setSource(definitionSourceOf(settings)),
      (reason: unknown) => live && setError(`The definition source could not be read: ${apiErrorMessage(reason)}`),
    );
    // Only the key's presence is read; a failed read leaves the badge on the network alone.
    pronunciationOnline.pronunciationOnlineKeyStatus().then(
      (status) => live && setKeySaved(status.present),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [system, pronunciationOnline]);

  const list = useCallback(async () => {
    try {
      const catalog = await assets.assetsList();
      setDictionary(catalog.assets.find((asset) => asset.kind === DICTIONARY_KIND));
      setListed(true);
    } catch (reason) {
      setError(`The local dictionary could not be read: ${apiErrorMessage(reason)}`);
    }
  }, [assets]);
  useEffect(() => {
    void list();
  }, [list]);

  const install = useAssetInstall({
    start: () => assets.assetsInstall(DICTIONARY_KIND, dictionary?.id ?? ''),
    state: (jobId) => assets.assetsInstallState(jobId),
    cancel: (jobId) => assets.assetsInstallCancel(jobId),
    onSuccess: async () => {
      overlay.toast('Local dictionary downloaded.');
      await list();
    },
    onFailure: (message) => setError(`The local dictionary could not be downloaded: ${message}`),
  });

  const choose = (next: DefinitionSource) => {
    const before = source;
    setSource(next);
    setError('');
    system.saveSettings('Script', 'global', { definition_source: next }).catch((reason: unknown) => {
      setSource(before);
      setError(`The definition source could not be saved: ${apiErrorMessage(reason)}`);
    });
  };

  const remove = async () => {
    if (!dictionary || removing) return;
    setRemoving(true);
    setError('');
    try {
      await assets.assetsRemove(DICTIONARY_KIND, dictionary.id);
      overlay.toast('Local dictionary removed.');
      await list();
    } catch (reason) {
      setError(`The local dictionary could not be removed: ${apiErrorMessage(reason)}`);
    } finally {
      setRemoving(false);
    }
  };

  const state: LocalDictionaryState = install.running ? 'downloading' : !listed || dictionary ? (dictionary?.installState ?? 'not_installed') : 'absent';
  return (
    <DefinitionsView
      source={source}
      onSource={choose}
      dictionary={state}
      percent={install.job && install.running ? install.job.percent : undefined}
      busy={removing || install.starting || !listed}
      onDownload={() => {
        setError('');
        void install.begin();
      }}
      onRemove={() => void remove()}
      service={!network ? 'offline' : keySaved ? 'online' : 'no_key'}
      error={error}
    />
  );
}
