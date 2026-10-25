import type { ReactNode } from 'react';
import type { AssetInstallJob } from '../../types';
import { BreakablePath } from '../../BreakablePath';
import { HIT_AREA } from '../primitives/hitArea';

const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * BYTES_PER_MB;

/** A size a narrator can read: whole megabytes below a gigabyte, one decimal of a gigabyte above. */
export function formatSize(bytes: number): string {
  if (bytes >= BYTES_PER_GB) return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / BYTES_PER_MB))} MB`;
}

/** While it downloads, the real bytes so far ("44 of 109 MB"), so the narrator sees it move and knows how far it has to go; nothing before the size is known. */
export function bytesProgress(job: Pick<AssetInstallJob, 'phase' | 'bytesDone' | 'bytesTotal'>): string | undefined {
  if (job.phase !== 'downloading' || job.bytesTotal <= 0) return undefined;
  return `${Math.round(job.bytesDone / BYTES_PER_MB)} of ${Math.round(job.bytesTotal / BYTES_PER_MB)} MB`;
}

export type AssetFactsProps = {
  /** What the asset is called in this dialog: "Voice", "Model", "Language model". */
  label: string;
  name: string;
  version: string;
  publisher: string;
  license: string;
  licenseUrl: string;
  modelCardUrl: string;
  provenanceUrl: string;
  downloadSize: number;
  /** What it takes on the disk once installed; the same as the download unless it is unpacked. */
  diskSize: number;
  /** Where it will be stored. */
  installPath: string;
};

/** A link out of the dialog that looks like one: underlined, with a 24 px press target on its 16 px line. */
const LINK = `${HIT_AREA} underline`;

/** "464 MB" when the download is what it takes on disk, else both: the same figure is not said twice (alignment audit R3PR2-23). */
export function sizeLine(downloadSize: number, diskSize: number): string {
  const download = formatSize(downloadSize);
  const disk = formatSize(diskSize);
  return download === disk ? download : `${download} download, ${disk} on disk`;
}

/**
 * What the first-use question says about a download, the same for every kind of asset (the first-use rules): what it is and its exact
 * version, who publishes it, how much is downloaded and how much disk it needs, where it will be kept, and its licence and provenance
 * links. One definition list on a two-column grid, so every value starts at one x (alignment audit XPR2-30, R3BO-4, R3SB2-16); each group
 * is a `contents` box, so the list holds only term and definition groups.
 */
export function AssetFacts({
  label,
  name,
  version,
  publisher,
  license,
  licenseUrl,
  modelCardUrl,
  provenanceUrl,
  downloadSize,
  diskSize,
  installPath,
}: AssetFactsProps) {
  const rows: Array<[string, ReactNode]> = [
    [label, name],
    ['Version', version],
    ['Publisher', publisher],
    ['Size', sizeLine(downloadSize, diskSize)],
    // A host that has not said where it will keep the files gets no empty row.
    ...(installPath ? ([['Saved to', <BreakablePath key="path" path={installPath} />]] as Array<[string, ReactNode]>) : []),
    [
      'License',
      <a key="license" className={LINK} href={licenseUrl} target="_blank" rel="noreferrer">
        {license}
      </a>,
    ],
    [
      'Details',
      <span key="details">
        <a className={LINK} href={modelCardUrl} target="_blank" rel="noreferrer">
          Model card
        </a>
        {' · '}
        <a className={LINK} href={provenanceUrl} target="_blank" rel="noreferrer">
          Provenance
        </a>
      </span>,
    ],
  ];
  return (
    <dl className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {rows.map(([term, definition]) => (
        <div key={term} className="contents">
          <dt className="font-medium text-[var(--text-muted)]">{term}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere] text-[var(--text)]">{definition}</dd>
        </div>
      ))}
    </dl>
  );
}
