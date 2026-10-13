import type { AssetItem } from '../../../types';
import { formatSize } from '../../assets/AssetFacts';
import { Button } from '../../primitives/Button';
import { Dialog } from '../../primitives/Dialog';
import { SectionLabel } from '../../primitives/SectionLabel';
import { memoryText, minutesText, totalDownload } from './components';

/** One tool in the consent: what it is and does, where it downloads from, what it needs and takes, and its licence. */
function Facts({ tool }: { tool: AssetItem }) {
  return (
    <section data-consent={tool.id} className="flex flex-col gap-1 border-t border-[var(--border)] py-2.5 first:border-t-0 first:pt-0">
      <h3 className="m-0 flex flex-wrap items-baseline gap-2 text-base font-semibold">
        {tool.displayName}
        <span className="text-sm font-normal text-[var(--text-muted)]">{formatSize(tool.downloadSize)}</span>
      </h3>
      {tool.description && <p className="m-0 text-sm">{tool.description}</p>}
      <dl className="my-0.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[0.8125rem]">
        <dt className="text-[var(--text-muted)]">Downloads from</dt>
        <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">{tool.downloadHost || tool.publisher}</dd>
        {tool.ramGB !== undefined && (
          <>
            <dt className="text-[var(--text-muted)]">Needs</dt>
            <dd className="m-0">{memoryText(tool.ramGB)}</dd>
          </>
        )}
        {tool.minutesPerBook ? (
          <>
            <dt className="text-[var(--text-muted)]">Takes</dt>
            <dd className="m-0">{minutesText(tool.minutesPerBook)} per book</dd>
          </>
        ) : null}
        <dt className="text-[var(--text-muted)]">Licence</dt>
        <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">
          <a className="link" href={tool.licenseUrl} target="_blank" rel="noreferrer">
            {tool.license}
          </a>
        </dd>
      </dl>
    </section>
  );
}

/**
 * Asks before anything is downloaded (ADR 0803 decision 5): for each tool its name and size, what it does, where it downloads from,
 * the memory and time it needs and its licence, and the total when there are several. Cancel changes nothing; Download hands the
 * tools back to start one after another. Nothing downloads without this click.
 */
export function ConsentDialog({ tools, cancel, download }: { tools: AssetItem[]; cancel: () => void; download: (ids: string[]) => void }) {
  const title = tools.length === 1 ? `Download ${tools[0].displayName}` : 'Download better analysis';
  return (
    <Dialog
      dismissOnOutsidePress={false}
      title={title}
      onClose={cancel}
      // Cancel and Download sit together on the right, as the mock draws them.
      actionsAlign="end"
      actions={
        <>
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button autoFocus onClick={() => download(tools.map((tool) => tool.id))}>
            Download
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {tools.map((tool) => (
          <Facts key={tool.id} tool={tool} />
        ))}
        {tools.length > 1 && (
          <span data-consent-total>
            <SectionLabel>Total download · {formatSize(totalDownload(tools))}</SectionLabel>
          </span>
        )}
      </div>
    </Dialog>
  );
}
