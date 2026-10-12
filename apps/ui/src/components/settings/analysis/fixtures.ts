import type { AssetCatalog, AssetInstallJob, AssetItem } from '../../../types';
import type { ComponentsPort } from './useAnalysisTools';

const ROOT = 'C:/Users/narrator/AppData/Local/narration-utils/assets/analysis';

const tool = (row: Omit<AssetItem, 'kind' | 'kindLabel' | 'path' | 'installState' | 'installedAt' | 'verifiedAt' | 'activeJobId'>): AssetItem => ({
  kind: 'analysis',
  kindLabel: 'Analysis tool',
  path: `${ROOT}/${row.id}`,
  installState: 'not_installed',
  installedAt: '',
  verifiedAt: '',
  activeJobId: '',
  ...row,
});

/**
 * The four analysis tools as the host lists them (tests/fixtures/contracts/assets-list.json), with GLiNER and both BookNLP sizes
 * downloadable, as they will be once their files are pinned. The local model stays unavailable with the host's sentence.
 */
export const ANALYSIS_TOOLS: AssetItem[] = [
  tool({
    id: 'gliner',
    displayName: 'GLiNER',
    description: 'Finds the names of characters, places and things in the manuscript, including invented ones, and suggests them as new entries.',
    version: '4e091416cf7c3481db542c2a3d26156916f3a47f',
    publisher: 'Urchade Zaratiana (urchade on Hugging Face)',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/urchade/gliner_small-v2.1/blob/4e091416cf7c3481db542c2a3d26156916f3a47f/README.md',
    modelCardUrl: 'https://huggingface.co/urchade/gliner_small-v2.1',
    provenanceUrl: 'https://huggingface.co/urchade/gliner_small-v2.1/tree/4e091416cf7c3481db542c2a3d26156916f3a47f',
    attribution: 'GLiNER small v2.1 by Urchade Zaratiana.',
    downloadSize: 747042859,
    diskSize: 1136082201,
    downloadHost: 'huggingface.co, files.pythonhosted.org',
    ramGB: 2,
    minutesPerBook: 2,
    source: 'gliner',
    rank: 1,
    recommended: true,
  }),
  tool({
    id: 'booknlp-small',
    displayName: 'BookNLP (small)',
    description:
      'Groups the different ways a character is named, works out who speaks each quoted line, and suggests gender. Quick, and a little less sure than the large one.',
    version: '1.0',
    publisher: 'David Bamman (UC Berkeley)',
    license: 'MIT (program); no licence stated for the model files',
    licenseUrl: 'https://github.com/booknlp/booknlp/blob/main/LICENSE',
    modelCardUrl: 'https://github.com/booknlp/booknlp',
    provenanceUrl: 'https://people.ischool.berkeley.edu/~dbamman/booknlp_models/',
    attribution: 'BookNLP by David Bamman.',
    downloadSize: 286934059,
    diskSize: 644689865,
    downloadHost: 'people.ischool.berkeley.edu, files.pythonhosted.org',
    ramGB: 1.6,
    minutesPerBook: 3,
    source: 'booknlp',
    rank: 1,
    recommended: true,
  }),
  tool({
    id: 'booknlp-big',
    displayName: 'BookNLP (large)',
    description: 'The same as the small one, with the most reliable speaker attribution. Larger to download and slower to run.',
    version: '1.0',
    publisher: 'David Bamman (UC Berkeley)',
    license: 'MIT (program); no licence stated for the model files',
    licenseUrl: 'https://github.com/booknlp/booknlp/blob/main/LICENSE',
    modelCardUrl: 'https://github.com/booknlp/booknlp',
    provenanceUrl: 'https://people.ischool.berkeley.edu/~dbamman/booknlp_models/',
    attribution: 'BookNLP by David Bamman.',
    downloadSize: 1322773627,
    diskSize: 1680529433,
    downloadHost: 'people.ischool.berkeley.edu, files.pythonhosted.org',
    ramGB: 3.1,
    minutesPerBook: 10,
    source: 'booknlp',
    rank: 2,
    recommended: false,
  }),
  tool({
    id: 'local-llm',
    displayName: 'Local language model',
    description: 'Reads the manuscript like a person would and writes descriptions, relationships and what each character says, does and knows.',
    version: 'none',
    publisher: 'Not chosen',
    license: 'To be confirmed',
    licenseUrl: 'https://github.com/countrymanprime/narration-utils',
    modelCardUrl: 'https://github.com/countrymanprime/narration-utils',
    provenanceUrl: 'https://github.com/countrymanprime/narration-utils',
    attribution: 'Licence to be confirmed before it is offered.',
    downloadSize: 0,
    diskSize: 0,
    ramGB: 11,
    rank: 0,
    recommended: false,
    unavailableReason: 'A model small enough for this computer takes many hours per book. It will be offered once that is practical.',
  }),
];

/** How the fake's next install of a tool goes: to the end, held mid-download or at the check, or ending in the host's sentence. */
export type FakeInstall = 'completes' | 'held' | 'checking' | { fails: string };

/**
 * A `ComponentsPort` over an in-memory registry for the tests and stories: an install takes one step per poll (40 percent, the check,
 * the end), a cancel ends it, and a removal makes the tool not installed again. Starting a tool already downloading joins its job.
 */
export function createFakeTools(options: { tools?: AssetItem[]; installs?: Record<string, FakeInstall> } = {}) {
  const tools = (options.tools ?? ANALYSIS_TOOLS).map((item) => ({ ...item }));
  const installs = { ...options.installs };
  const jobs = new Map<string, AssetInstallJob>();
  let count = 0;
  const find = (id: string) => {
    const item = tools.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`"${id}" is not in the approved catalog of analysis`);
    return item;
  };
  const running = (job: AssetInstallJob) => job.phase === 'downloading' || job.phase === 'verifying';
  const step = (job: AssetInstallJob): AssetInstallJob => {
    const plan = installs[job.assetId] ?? 'completes';
    const total = job.bytesTotal;
    if (job.phase === 'downloading' && job.bytesDone === 0) return { ...job, percent: 40, bytesDone: Math.floor(total * 0.4) };
    if (job.phase === 'downloading' && plan === 'held') return job;
    if (job.phase === 'downloading' && typeof plan === 'object') return { ...job, phase: 'error', message: plan.fails, error: plan.fails };
    if (job.phase === 'downloading') return { ...job, phase: 'verifying', percent: 99, bytesDone: total, message: 'Checking the files…' };
    if (job.phase === 'verifying' && plan === 'checking') return job;
    if (job.phase === 'verifying') {
      find(job.assetId).installState = 'installed';
      return { ...job, phase: 'success', percent: 100, message: 'Installed and verified.' };
    }
    return job;
  };
  const port: ComponentsPort = {
    assetsList: async (): Promise<AssetCatalog> => ({
      cacheRoot: ROOT,
      totalInstalledBytes: 0,
      assets: tools.map((item) => {
        const active = [...jobs.values()].find((job) => job.assetId === item.id && running(job));
        return { ...item, activeJobId: active?.id ?? '' };
      }),
    }),
    assetsInstall: async (kind, id) => {
      const item = find(id);
      if (item.unavailableReason) throw new Error(item.unavailableReason);
      const joined = [...jobs.values()].find((job) => job.assetId === id && running(job));
      if (joined) return { ...joined };
      const job: AssetInstallJob = {
        id: `fake-${id}-${++count}`,
        kind,
        assetId: id,
        phase: installs[id] === 'checking' ? 'verifying' : 'downloading',
        message: 'Downloading…',
        percent: 0,
        bytesDone: 0,
        bytesTotal: item.downloadSize,
        error: '',
      };
      jobs.set(job.id, job);
      return { ...job };
    },
    assetsInstallState: async (jobId) => {
      const job = jobs.get(jobId);
      if (!job) throw new Error('unknown install job');
      const next = step(job);
      jobs.set(jobId, next);
      return { ...next };
    },
    assetsInstallCancel: async (jobId) => {
      const job = jobs.get(jobId);
      if (!job) throw new Error('unknown install job');
      const next: AssetInstallJob = running(job) ? { ...job, phase: 'cancelled', message: 'Download cancelled.' } : job;
      jobs.set(jobId, next);
      return { ...next };
    },
    assetsRemove: async (_kind, id) => {
      find(id).installState = 'not_installed';
    },
  };
  return {
    port,
    /** Changes how the next install of a tool goes: a cause that is gone, for Try again. */
    plan: (id: string, next: FakeInstall) => {
      installs[id] = next;
    },
    installed: () => tools.filter((item) => item.installState === 'installed').map((item) => item.id),
  };
}
