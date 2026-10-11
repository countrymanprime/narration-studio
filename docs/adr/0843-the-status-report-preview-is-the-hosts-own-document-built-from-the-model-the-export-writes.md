# 0843. The status report preview is the host's own document, built from the model the export writes

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** none. It adds a read beside the host's status report export and keeps the privacy rule of [ADR 0406](0406-the-status-report-leaves-out-the-contracted-amount-and-effective-rate-unless-the-narrator-opts-in.md).

## Context

The Studio Next mock's Export status report dialog shows a live preview of the document (`ReportDialog.tsx`, `selectors/report.ts`). The mock builds that document in TypeScript; the host builds the written file in Go. Two builders of one document drift, and no test of one against the other holds them equal for long.

## Decision

- The host answers the preview. `ProductionStatusReportPreview(includeContractedAmount)` runs `productionreport.Build` over the same overview and plan as the export and returns `{html, json, folder, stem, contractedAmountIncluded}`. The export renders the same `Report` through the same `Render`, so the preview is the written file.
- Nothing is written, opened or fetched. The preview is read-only like `ProductionBurndown`.
- `stem` is the name the host would use now (`freeProductionReportStem`). An export a later second may name it differently.
- The amount and effective rate stay opt-in (ADR 0406): without `includeContractedAmount` the preview holds neither.
- The HTML is `html/template` output with no script, so a dialog can show it in a sandboxed frame.
- The mock's per-section "Include" checkboxes, and its sections for open pickups and the delivery check, are not built. The host report has fixed sections, and adding sections changes the report, not its preview.

## Consequences

- The dialog (SN-P622) shows exactly what Export writes; there is no second implementation to keep equal.
- `hostAPIVersion` goes up by one and `ProductionReportPreview` joins the wire contracts.
- The TypeScript mock's preview is a small stand-in that returns "Not available" for a figure it cannot give.
