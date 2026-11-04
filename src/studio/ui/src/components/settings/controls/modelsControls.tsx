import type { ComponentType } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { IconButton } from '../../primitives/IconButton';
import { Skeleton } from '../../primitives/Skeleton';
import { ModelsFolderControl, OldCopyOffer } from '../models/ModelsFolder';
import { useAssetsStore } from '../models/AssetsStore';

/** Models folder: the folder in use, Change location (with the way back to the default), and the old copy's offer while one waits. */
function ModelsFolderBody() {
  const { catalog } = useAssetsStore();
  const api = usePort('assets');
  const open = () => {
    api.assetsOpenFolder().catch((failure) => overlay.toast(`The folder could not be opened: ${apiErrorMessage(failure)}`, { tone: 'error' }));
  };
  if (!catalog) return <Skeleton className="w-80 max-w-full" />;
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <code dir="ltr" data-models-folder className="font-['IBM_Plex_Mono',ui-monospace,monospace] text-[0.75rem] [overflow-wrap:anywhere]">
        {catalog.cacheRoot}
      </code>
      {catalog.folderNote && (
        <span role="status" className="text-[0.8125rem] text-[var(--warn-text)]">
          {catalog.folderNote}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-1.5">
        <IconButton action="openFolder" size="sm" className="flex-none" onClick={open} />
        <ModelsFolderControl />
      </span>
      <OldCopyOffer />
    </div>
  );
}

export const MODELS_CONTROLS: Record<string, ComponentType> = { 'models.folder': ModelsFolderBody };
