/**
 * Where an asset install is. Every optional download (a voice, a Whisper model, and the models that follow) speaks this one vocabulary:
 * `downloading` while bytes arrive, `verifying` while the files are checked against the approved size and SHA-256, then one of the three ends.
 */
export type AssetJobPhase = 'downloading' | 'verifying' | 'success' | 'cancelled' | 'error';

/**
 * An install job as the host reports it. `percent` is real bytes over real bytes and never more than 99 until the install succeeded;
 * `error` is a sentence for the narrator, empty unless `phase` is `error`. `errorDetail` is, for a failure after the download, the step,
 * the file and the cause ("Unpacking torch-….whl: …"), shown behind the failure's Details; empty otherwise.
 */
export type AssetInstallJob = {
  id: string;
  /** The kind of asset (`tts`, `whisper`) and the asset itself: the same two words the generic bindings take. */
  kind: string;
  assetId: string;
  phase: AssetJobPhase;
  message: string;
  percent: number;
  bytesDone: number;
  bytesTotal: number;
  error: string;
  errorDetail: string;
};

/** True while the install is still working, that is until it succeeded, failed or was cancelled. */
export const isInstallRunning = (job: Pick<AssetInstallJob, 'phase'>): boolean => job.phase === 'downloading' || job.phase === 'verifying';

/** Whether an asset is on this computer, and in what shape. `verification_failed` is "needs repair". */
export type AssetInstallState = 'installed' | 'not_installed' | 'verification_failed';

/**
 * One approved asset in the list of everything that can be downloaded. Nothing is read from the asset to build it: `installedAt` and
 * `verifiedAt` come from its manifest, and `activeJobId` is the download running for it now, so a page opened while one runs can follow it.
 */
export type AssetItem = {
  kind: string;
  /** The kind in words a narrator reads: "Preview voice", "Whisper model". */
  kindLabel: string;
  id: string;
  displayName: string;
  version: string;
  publisher: string;
  license: string;
  licenseUrl: string;
  modelCardUrl: string;
  provenanceUrl: string;
  attribution: string;
  downloadSize: number;
  /** What it takes on the disk once installed: the download, or what it unpacks to. */
  diskSize: number;
  installState: AssetInstallState;
  /** Where it is (or will be) installed. */
  path: string;
  /** ISO 8601; empty when it is not installed or was installed before manifests recorded it. */
  installedAt: string;
  verifiedAt: string;
  /** The id of the running download of this asset, or empty. */
  activeJobId: string;
} & AssetConsentFacts;

/**
 * What a consent screen states about an optional analysis tool (`kind` `analysis`) besides its download: present on those rows and absent
 * on every other kind. A fact that is not known is absent too: `minutesPerBook` for a tool never timed, `source` for one that is not a
 * scanner, `downloadHost` for one with nothing to download. `ramGB` and `minutesPerBook` are a trial's figures, provisional until measured.
 */
export type AssetConsentFacts = {
  /** What it does, in plain words. */
  description?: string;
  /** The hosts its files come from, comma separated, in the order they are downloaded. */
  downloadHost?: string;
  ramGB?: number;
  /** About how long one book takes. */
  minutesPerBook?: number;
  /** The extraction source its suggestions are filed under (`gliner`, `booknlp`). */
  source?: string;
  /** Of two tools behind one source, the higher rank is used when both are installed. */
  rank?: number;
  /** Offered together on the first scan. */
  recommended?: boolean;
  /** Set when it cannot be installed: the sentence is shown instead of a Download button, and an install is refused with it. */
  unavailableReason?: string;
};

export type AssetCatalog = {
  /** The folder every asset is kept under: the per-user cache folder, or the one the narrator moved the downloads to. */
  cacheRoot: string;
  /** The per-user cache folder, where the downloads are unless the narrator moved them. */
  defaultRoot: string;
  /** True once the downloads were moved out of the default folder. */
  custom: boolean;
  /** The folder a finished move left a copy in, which the narrator has not yet answered for (deleted or kept); empty when none. */
  previousRoot: string;
  /** Bytes the installed assets take, from the catalog sizes. */
  totalInstalledBytes: number;
  assets: AssetItem[];
};

/**
 * Where moving the downloads to another folder is: `copying` and `verifying` are the two passes over every byte (progress counts both),
 * `switching` is the instant the new folder takes over, then one of the three ends. `idle` is no move since the app started. On
 * `cancelled` and `error` the old folder is still the one in use; `error` is a sentence for the narrator, empty otherwise.
 */
export type AssetMovePhase = 'idle' | 'copying' | 'verifying' | 'switching' | 'success' | 'cancelled' | 'error';

export type AssetMoveState = {
  id: string;
  phase: AssetMovePhase;
  /** The folder the downloads are going to. */
  target: string;
  message: string;
  /** Real bytes over real bytes of both passes; never more than 99 until the move succeeded. */
  percent: number;
  bytesDone: number;
  bytesTotal: number;
  error: string;
};

/** True while the move is still working. */
export const isMoveRunning = (move: Pick<AssetMoveState, 'phase'>): boolean =>
  move.phase === 'copying' || move.phase === 'verifying' || move.phase === 'switching';

/** The folder the narrator picked in the system dialog; empty when they cancelled. */
export type AssetFolderPick = { path: string };

export type AssetVerifyResult = { kind: string; id: string; installState: AssetInstallState };

export interface AssetsApi {
  assetsList(): Promise<AssetCatalog>;
  /** Installs the asset, or repairs it when it is damaged. A second call while it downloads joins the running job. The narrator asked for it. */
  assetsInstall(kind: string, id: string): Promise<AssetInstallJob>;
  assetsInstallState(jobId: string): Promise<AssetInstallJob>;
  assetsInstallCancel(jobId: string): Promise<AssetInstallJob>;
  /** Reads every byte of the asset (it can take seconds for a large model) and says whether it is installed, damaged or absent. */
  assetsVerify(kind: string, id: string): Promise<AssetVerifyResult>;
  /** Shows the folder the assets are kept in (`cacheRoot`) in the file manager. */
  assetsOpenFolder(): Promise<void>;
  /** Asks for the folder to move the downloads to (the system's folder dialog). Changes nothing. */
  assetsFolderPick(): Promise<AssetFolderPick>;
  /**
   * Starts moving the downloads to `target` (the default folder when empty): copy, check every file, then every download kind uses the new
   * folder. The old folder is not changed. Refused for a folder that cannot work, during a download and during another move.
   */
  assetsMoveStart(target: string): Promise<AssetMoveState>;
  assetsMoveState(): Promise<AssetMoveState>;
  /** Stops the move; the old folder stays in use and the new one is left empty. */
  assetsMoveCancel(): Promise<AssetMoveState>;
  /** After the narrator confirmed: deletes the asset folders of the old copy (`previousRoot`) and nothing else. */
  assetsMoveDeleteOld(): Promise<void>;
  /** Ends the offer to delete the old copy and leaves it where it is. */
  assetsMoveKeepOld(): Promise<void>;
  /** Deletes the asset and nothing else. Refused while it downloads. */
  assetsRemove(kind: string, id: string): Promise<void>;
}
