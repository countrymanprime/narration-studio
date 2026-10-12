// The golden payloads for production tracking: which schema owns each file in tests/fixtures/contracts/ (see index.ts).
import type { z } from 'zod';
import {
  productionBurndownSchema,
  productionOverviewSchema,
  productionPlanSchema,
  productionReportExportSchema,
  productionReportPreviewSchema,
  productionStartResultSchema,
  productionStopResultSchema,
} from '../schemas/production';

export const productionGoldens: Record<string, z.ZodType> = {
  // The plan (ProductionPlan, ProductionSetDeadline, ProductionSaveMilestones).
  'production-plan-empty.json': productionPlanSchema,
  'production-plan-set.json': productionPlanSchema,
  // SN-P2: the payment type and the milestone measure, estimate, done flag and template (ADR 0800; ProductionSetPayment).
  'production-plan-old-manifest.json': productionPlanSchema,
  'production-plan-royalty-share.json': productionPlanSchema,
  'production-plan-milestone-measure.json': productionPlanSchema,
  // SN-P51: the schedule basis (ProductionSetRateBasis).
  'production-plan-rate-basis.json': productionPlanSchema,
  // The Production page's overview and the stage timer.
  'production-overview.json': productionOverviewSchema,
  'production-overview-empty.json': productionOverviewSchema,
  'production-timer-started.json': productionStartResultSchema,
  'production-timer-refused.json': productionStartResultSchema,
  'production-timer-stopped.json': productionStopResultSchema,
  'production-timer-stop-none.json': productionStopResultSchema,
  // The status report export (ProductionStatusReport).
  'production-status-report.json': productionReportExportSchema,
  // SN-P621: the preview of that report (ProductionStatusReportPreview).
  'production-status-report-preview.json': productionReportPreviewSchema,
  // The burndown data (ProductionBurndown).
  'production-burndown.json': productionBurndownSchema,
};
