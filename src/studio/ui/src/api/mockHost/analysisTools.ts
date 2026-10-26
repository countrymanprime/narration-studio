// The mock host (mockApi.ts): the Story Bible analysis tools, as the real host lists them (tests/fixtures/contracts/assets-list.json,
// written by the Go catalog test). The rows carry the facts only; the install state, path and job are the asset mock's.
import type { AssetItem } from '../contracts/assets';

export type MockAnalysisTool = Omit<AssetItem, 'kind' | 'kindLabel' | 'path' | 'installState' | 'installedAt' | 'verifiedAt' | 'activeJobId'>;

/** GLiNER and both BookNLP sizes; config/analysis-assets.json pins every file of each, so all three can be installed. */
export const MOCK_ANALYSIS_TOOLS: readonly MockAnalysisTool[] = [
  {
    id: 'gliner',
    displayName: 'GLiNER',
    description: 'Finds the names of characters, places and things in the manuscript, including invented ones, and suggests them as new entries.',
    version: '4e091416cf7c3481db542c2a3d26156916f3a47f',
    publisher: 'Urchade Zaratiana (urchade on Hugging Face)',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/urchade/gliner_small-v2.1/blob/4e091416cf7c3481db542c2a3d26156916f3a47f/README.md',
    modelCardUrl: 'https://huggingface.co/urchade/gliner_small-v2.1',
    provenanceUrl: 'https://huggingface.co/urchade/gliner_small-v2.1/tree/4e091416cf7c3481db542c2a3d26156916f3a47f',
    attribution:
      'The model files are published under the Apache 2.0 licence, which allows this use. GLiNER small v2.1 by Urchade Zaratiana, on the DeBERTa v3 small encoder by Microsoft (MIT; only its config and tokenizer are downloaded); the gliner, transformers and sentencepiece packages are Apache-2.0 and torch is BSD-3-Clause.',
    downloadSize: 766216530,
    diskSize: 1198620197,
    downloadHost: 'huggingface.co, files.pythonhosted.org',
    ramGB: 2,
    minutesPerBook: 2,
    source: 'gliner',
    rank: 1,
    recommended: true,
  },
  {
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
    attribution:
      'The program is under the MIT licence. Its authors give no licence statement for the model files; they are used here only to find character names. BookNLP by David Bamman; torch is BSD-3-Clause.',
    downloadSize: 313889421,
    diskSize: 747768291,
    downloadHost: 'people.ischool.berkeley.edu, huggingface.co, files.pythonhosted.org',
    ramGB: 1.6,
    minutesPerBook: 3,
    source: 'booknlp',
    rank: 1,
    recommended: true,
  },
  {
    id: 'booknlp-big',
    displayName: 'BookNLP (large)',
    description: 'The same as the small one, with the most reliable speaker attribution. Larger to download and slower to run.',
    version: '1.0',
    publisher: 'David Bamman (UC Berkeley)',
    license: 'MIT (program); no licence stated for the model files',
    licenseUrl: 'https://github.com/booknlp/booknlp/blob/main/LICENSE',
    modelCardUrl: 'https://github.com/booknlp/booknlp',
    provenanceUrl: 'https://people.ischool.berkeley.edu/~dbamman/booknlp_models/',
    attribution:
      'The program is under the MIT licence. Its authors give no licence statement for the model files; they are used here only to find character names. BookNLP by David Bamman; torch is BSD-3-Clause.',
    downloadSize: 1349728609,
    diskSize: 1783607479,
    downloadHost: 'people.ischool.berkeley.edu, huggingface.co, files.pythonhosted.org',
    ramGB: 3.1,
    minutesPerBook: 10,
    source: 'booknlp',
    rank: 2,
    recommended: false,
  },
];
