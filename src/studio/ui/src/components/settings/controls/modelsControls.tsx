import type { ComponentType } from 'react';
import { Skeleton } from '../../primitives/Skeleton';
import { ModelsFolderControl, OldCopyOffer } from '../models/ModelsFolder';
import { useAssetsStore } from '../models/AssetsStore';

/** Models folder: the folder in use, Change location (with the way back to the default), and the old copy's offer while one waits. */
function ModelsFolderBody() {
  const { catalog } = useAssetsStore();
  if (!catalog) return <Skeleton className="w-80 max-w-full" />;
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <code data-models-folder className="font-['IBM_Plex_Mono',ui-monospace,monospace] text-[0.75rem] [overflow-wrap:anywhere]">
        {catalog.cacheRoot}
      </code>
      <span className="flex items-center gap-1.5">
        <ModelsFolderControl />
      </span>
      <OldCopyOffer />
    </div>
  );
}

export const MODELS_CONTROLS: Record<string, ComponentType> = { 'models.folder': ModelsFolderBody };
