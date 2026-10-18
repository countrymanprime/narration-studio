import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DefinitionSource } from '../../../api/contracts/system';
import { Radio } from '../../primitives/RadioGroup';
import { IconButton } from '../../primitives/IconButton';
import { StatusBadge, type StatusTone } from '../../primitives/StatusBadge';
import { useSettingsStore } from '../data/SettingsStore';
import { computerValue } from '../data/values';
import { useAssetsStore, type AssetStatus } from '../models/AssetsStore';
import { rowOf } from '../registry/rows';
import { useSettingsHost } from '../row/SettingsHost';
import { useMwKeyStatus, useNetwork } from './mwKeyStatus';

/** The local dictionary as the asset list reports it, or `absent` when the catalog has none. */
type LocalDictionaryState = AssetStatus | 'absent';
/** The online service: `online`, `offline` (no network), or `no_key` (online, but no key is saved for it). */
type OnlineServiceState = 'online' | 'offline' | 'no_key';

const SOURCES: { value: DefinitionSource; label: string }[] = [
  { value: 'web', label: 'Web page. Opens the dictionary site.' },
  { value: 'local', label: 'Local dictionary. Shows definitions and pronunciations inline.' },
  { value: 'api', label: 'Online service. Shows definitions inline when online.' },
];

const DICTIONARY_BADGE: Record<LocalDictionaryState, { tone: StatusTone; label: string }> = {
  installed: { tone: 'success', label: 'Installed' },
  missing: { tone: 'neutral', label: 'Not installed' },
  repair: { tone: 'warning', label: 'Needs repair' },
  downloading: { tone: 'progress', label: 'Downloading' },
  verifying: { tone: 'progress', label: 'Checking' },
  failed: { tone: 'danger', label: 'Download failed' },
  unavailable: { tone: 'neutral', label: 'Not available' },
  absent: { tone: 'neutral', label: 'Not available' },
};

const SERVICE_BADGE: Record<OnlineServiceState, { tone: StatusTone; label: string }> = {
  online: { tone: 'success', label: 'Online' },
  offline: { tone: 'warning', label: 'Offline' },
  no_key: { tone: 'warning', label: 'No key saved' },
};

/** The three sources, the local dictionary installed or not with Download or Remove, and the online service's state. Takes props only. */
function DefinitionsView({
  source,
  onSource,
  dictionary,
  percent,
  busy,
  onDownload,
  onRemove,
  service,
  problem,
}: {
  source: DefinitionSource;
  onSource: (source: DefinitionSource) => void;
  dictionary: LocalDictionaryState;
  /** The download's real percent while `dictionary` is `downloading`. */
  percent?: number;
  /** A removal is in flight, or the list is not read yet. */
  busy: boolean;
  onDownload: () => void;
  onRemove: () => void;
  service: OnlineServiceState;
  /** The host's sentence for the last refused download or removal. */
  problem?: string;
}) {
  const badge = DICTIONARY_BADGE[dictionary];
  const running = dictionary === 'downloading' || dictionary === 'verifying';
  const extras: Partial<Record<DefinitionSource, ReactNode>> = {
    local: (
      <>
        <StatusBadge tone={badge.tone} label={dictionary === 'downloading' && percent !== undefined ? `${badge.label} ${percent}%` : badge.label} />
        {dictionary === 'installed' ? (
          <IconButton action="remove" label="Remove the local dictionary" variant="danger" size="sm" pending={busy} onClick={onRemove} />
        ) : dictionary === 'absent' || dictionary === 'unavailable' ? null : (
          <IconButton action="download" label="Download the local dictionary" size="sm" pending={busy || running} onClick={onDownload} />
        )}
      </>
    ),
    api: <StatusBadge tone={SERVICE_BADGE[service].tone} label={SERVICE_BADGE[service].label} />,
  };
  return (
    <div className="space-y-2.5" role="group" aria-label="Show definitions from">
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
      {problem && (
        <p role="alert" className="m-0 text-sm text-[var(--danger-text)]">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * The body of "Show definitions from": `Script.definition_source` for every project (the Words tab writes the same setting), the local
 * dictionary from the asset list with Download or Remove, and whether the online service can answer: the network, and a saved key for it.
 */
export function DefinitionsBody() {
  const row = rowOf('voice.dict')!;
  const store = useSettingsStore();
  const assets = useAssetsStore();
  const { notify } = useSettingsHost();
  const network = useNetwork();
  const { status: key } = useMwKeyStatus();
  const [removing, setRemoving] = useState(false);
  const [problem, setProblem] = useState('');
  const { global } = store.fieldsOf(row);
  const source = computerValue(row, global) as DefinitionSource;
  const view = assets.views.find((candidate) => candidate.item.kind === 'dictionary');
  const listed = Boolean(assets.catalog);

  // The download is followed by the assets store; this says so once, when it ends well.
  const before = useRef<AssetStatus | undefined>(undefined);
  useEffect(() => {
    const now = view?.status;
    if ((before.current === 'downloading' || before.current === 'verifying') && now === 'installed') notify('Local dictionary downloaded.');
    before.current = now;
  }, [view?.status, notify]);

  if (!global) return null;
  const state: LocalDictionaryState = view?.status ?? (listed ? 'absent' : 'missing');
  const choose = (next: DefinitionSource) => void store.write(row, 'global', next === row.def ? null : next);
  const remove = async () => {
    if (!view || removing) return;
    setRemoving(true);
    setProblem('');
    const refused = await assets.remove(view.item);
    if (refused) setProblem(`The local dictionary could not be removed: ${refused}`);
    else notify('Local dictionary removed.');
    setRemoving(false);
  };
  const failure = view?.status === 'failed' ? `The local dictionary could not be downloaded: ${view.failure}` : '';

  return (
    <DefinitionsView
      source={source}
      onSource={choose}
      dictionary={state}
      percent={view?.status === 'downloading' ? view.percent : undefined}
      busy={removing || !listed}
      onDownload={() => {
        setProblem('');
        if (view) void assets.install(view.item);
      }}
      onRemove={() => void remove()}
      service={!network ? 'offline' : key && !key.present ? 'no_key' : 'online'}
      problem={problem || failure}
    />
  );
}
