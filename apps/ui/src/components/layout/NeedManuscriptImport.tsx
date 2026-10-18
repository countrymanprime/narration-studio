// The ask for a manuscript with the import itself in it: the button opens the file dialog and the review on this page, so a narrator on
// Script or Story Bible is not sent to Production and back. It is the one import flow of Production and Settings (`useManuscriptImport`).

import type { Bootstrap } from '../../types';
import { useManuscriptImport } from '../production/ManuscriptImport';
import { NeedManuscript } from './NeedManuscript';

type Props = Parameters<typeof useManuscriptImport>[0];

export function NeedManuscriptImport({ title, ...flow }: Props & { title: string; data: Bootstrap }) {
  const { chooseButton, dialogs } = useManuscriptImport(flow);
  return (
    <NeedManuscript title={title} importButton={chooseButton}>
      {dialogs}
    </NeedManuscript>
  );
}
