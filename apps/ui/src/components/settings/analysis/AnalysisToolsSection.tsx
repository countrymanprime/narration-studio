import { useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import type { AssetItem } from '../../../types';
import { Button } from '../../primitives/Button';
import { Checkbox } from '../../primitives/Checkbox';
import { ConfirmDialog } from '../../primitives/ConfirmDialog';
import { SectionLabel } from '../../primitives/SectionLabel';
import { offerable } from './components';
import { ConsentDialog } from './ConsentDialog';
import { ToolRow } from './ToolRow';
import { useAnalysisPrompt } from './useAnalysisPrompt';
import { useAnalysisTools, useComponentsPort } from './useAnalysisTools';

/**
 * Settings > Story Bible: the optional tools that make the Story Bible scan better, from the asset registry. Nothing downloads until the
 * narrator agrees in the consent; several start one after another. Below them, whether a scan offers them first
 * (`ManuscriptGuide.analysis_prompt`).
 */
export function AnalysisToolsSection() {
  const tools = useAnalysisTools(useComponentsPort());
  const prompt = useAnalysisPrompt();
  const [consent, setConsent] = useState<AssetItem[]>();
  const [removing, setRemoving] = useState<AssetItem>();
  const [removePending, setRemovePending] = useState(false);
  const [removeFailures, setRemoveFailures] = useState<Record<string, string>>({});

  const openConsent = (ids: string[]) => {
    const offered = offerable(tools.tools ?? [], ids);
    if (offered.length > 0) setConsent(offered);
  };
  const confirmRemove = async () => {
    if (!removing || removePending) return;
    const { id, displayName } = removing;
    setRemovePending(true);
    try {
      await tools.remove(id);
      setRemoveFailures(({ [id]: _gone, ...rest }) => rest);
    } catch (error) {
      setRemoveFailures((current) => ({ ...current, [id]: `Could not remove ${displayName}: ${apiErrorMessage(error)}` }));
    } finally {
      setRemovePending(false);
      setRemoving(undefined);
    }
  };

  return (
    <section aria-labelledby="analysis-tools-label" className="space-y-3 pt-3" data-settings-section="analysis-tools">
      <SectionLabel as="h3" id="analysis-tools-label">
        Story Bible analysis
      </SectionLabel>
      {tools.loadError && !tools.tools ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md p-3"
          role="alert"
          style={{ background: 'var(--review-soft)', color: 'var(--danger-text)' }}
        >
          <span>The analysis tools could not be listed: {tools.loadError}</span>
          <Button variant="secondary" onClick={() => void tools.reload()}>
            Try again
          </Button>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {(tools.tools ?? []).map((tool) => {
            const status = tools.statusFor(tool);
            const failure = tools.failureFor(tool.id) || removeFailures[tool.id] || (tools.jobFor(tool.id) ? tools.cancelFailure : '');
            return (
              <ToolRow
                key={tool.id}
                tool={tool}
                status={status}
                job={tools.jobFor(tool.id)}
                failure={failure}
                download={() => openConsent([tool.id])}
                cancel={() => tools.cancel(tool.id)}
                retry={() => tools.install([tool.id])}
                dismiss={() => tools.dismiss(tool.id)}
                remove={() => setRemoving(tool)}
              />
            );
          })}
        </ul>
      )}
      <Checkbox checked={prompt.ask ?? false} disabled={prompt.ask === undefined} onChange={(checked) => void prompt.change(checked)}>
        Offer better analysis when scanning
      </Checkbox>
      {prompt.error && (
        <p role="alert" className="m-0 text-xs text-[var(--danger-text)]">
          {prompt.error}
        </p>
      )}
      {consent && (
        <ConsentDialog
          tools={consent}
          cancel={() => setConsent(undefined)}
          download={(ids) => {
            setConsent(undefined);
            tools.install(ids);
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.displayName}?`}
          body="It is deleted from this computer. You can download it again."
          confirmLabel="Remove"
          confirmVariant="danger"
          pending={removePending}
          confirm={() => void confirmRemove()}
          cancel={() => setRemoving(undefined)}
        />
      )}
    </section>
  );
}
