// The Words tab's in-place download question for the local dictionary (SN-B96, G17): the tab says the dictionary is not installed, and this
// is what follows that sentence: a button that asks (what is downloaded, how big, where it goes), then the shared download progress, then
// reads the word again. It is the old reader's `DictionaryInstallPrompt`, rebuilt over the same `AssetInstallPrompt` every optional download
// uses. It sits beside `scriptPageHost.ts` because no file under `page/` may call a port (`page/data/noHostCalls.test.ts`).

import { useCallback, useState } from 'react';
import { usePort } from '../../ports/usePort';
import { useAssetInstall } from '../../hooks/useAssetInstall';
import { AssetFacts } from '../assets/AssetFacts';
import { AssetInstallPrompt } from '../assets/AssetInstallPrompt';
import { Button } from '../primitives/Button';
import type { DictionaryGate, WordsHost } from './page/rail/words/wordsHost';

/** The asset kind the registry lists the dictionary under (`assetsInstall('dictionary', dictionary.id)`, `api/contracts/dictionary.ts`). */
const DICTIONARY_KIND = 'dictionary';

function DictionaryInstall({ gate, done }: { gate: DictionaryGate; done: () => void }) {
  const assets = usePort('assets');
  const [asking, setAsking] = useState(false);
  const install = useAssetInstall({
    start: () => assets.assetsInstall(DICTIONARY_KIND, gate.dictionary.id),
    state: (jobId) => assets.assetsInstallState(jobId),
    cancel: (jobId) => assets.assetsInstallCancel(jobId),
    onSuccess: () => {
      setAsking(false);
      done();
    },
  });
  const { reset } = install;
  // A dictionary that is on the computer but fails its check is asked about as a repair: the same download again.
  const damaged = gate.installState !== 'not_installed';
  const dismiss = useCallback(() => {
    reset();
    setAsking(false);
  }, [reset]);
  const ask = damaged
    ? {
        title: 'Repair the dictionary?',
        body: 'The dictionary on this computer is damaged: its files no longer match the ones that were downloaded, so it cannot be read. Download it again to repair it.',
        confirmLabel: 'Download again',
      }
    : {
        title: 'Download the dictionary?',
        body: 'Definitions are read from an offline dictionary kept on your computer, so every lookup works without an internet connection. It is not bundled with Narration Utils: download it once. You can remove it any time in Settings > Local assets.',
        confirmLabel: 'Download dictionary',
      };
  return (
    <>
      <Button variant="secondary" size="sm" className="mt-2" onClick={() => setAsking(true)}>
        {damaged ? 'Repair dictionary' : 'Download dictionary'}
      </Button>
      {asking && (
        <AssetInstallPrompt ask={ask} workTitle="Downloading the dictionary" install={install} dismiss={dismiss}>
          <AssetFacts
            label="Dictionary"
            name={gate.dictionary.displayName}
            version={gate.dictionary.version}
            publisher={gate.dictionary.publisher}
            license={gate.dictionary.license}
            licenseUrl={gate.dictionary.licenseUrl}
            modelCardUrl={gate.dictionary.modelCardUrl}
            provenanceUrl={gate.dictionary.provenanceUrl}
            downloadSize={gate.downloadSize}
            diskSize={gate.diskSize}
            installPath={gate.installPath}
          />
        </AssetInstallPrompt>
      )}
    </>
  );
}

/** The `installPrompt` the Words tab's host offers: a stable function, so the tab does not remount the question on every render. */
export const dictionaryInstallPrompt: NonNullable<WordsHost['installPrompt']> = (gate, done) => <DictionaryInstall gate={gate} done={done} />;
