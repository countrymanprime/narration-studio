import type { TakeEvidence as TakeEvidenceData, TakeFigure } from '../../../api/contracts/takeEvidence';

const minus = (n: number): string => n.toFixed(1).replace('-', '−');

/** A figure as text, or its reason: a figure that is a reason reads as the reason. */
function Figure({ label, title, figure, text }: { label: string; title: string; figure: TakeFigure; text: (n: number) => string }) {
  return figure.ok ? (
    <span title={title}>
      {label} {text(figure.value)}
    </span>
  ) : (
    <span title={title}>
      {label}: {figure.reason}
    </span>
  );
}

/** What was measured on a take: the share of the script it read as written, then the pause, level, noise floor, clarity and breaths. */
export function TakeEvidence({ evidence }: { evidence: TakeEvidenceData }) {
  const { matched, measure: m } = evidence;
  return (
    <div className="flex flex-wrap gap-x-3 font-['IBM_Plex_Mono',ui-monospace,monospace] text-[12px] text-[var(--text-muted)]" data-evidence={evidence.id}>
      <Figure label="Matched" title="Share of the script's words this take read as written" figure={matched} text={(n) => `${Math.round(n)}%`} />
      <Figure label="Pause" title="The longest pause in the take" figure={m.pause} text={(n) => `${n.toFixed(1)} s`} />
      <Figure label="Level" title="Average level (RMS)" figure={m.rms} text={(n) => `${minus(n)} dB`} />
      <Figure label="Noise" title="Noise floor" figure={m.nf} text={(n) => `${minus(n)} dB`} />
      <Figure label="Clarity" title="How clear the voice is against the noise" figure={m.clarity} text={(n) => n.toFixed(2)} />
      <Figure label="Breaths" title="Breaths in the take" figure={m.breaths} text={(n) => String(Math.round(n))} />
    </div>
  );
}
