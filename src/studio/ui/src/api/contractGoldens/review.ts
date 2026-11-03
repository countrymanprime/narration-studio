// The golden payloads for findings: which schema owns each file in tests/fixtures/contracts/ (see index.ts).
import { z } from 'zod';
import { findingMarkerSchema, findingNavigationSchema, findingSchema, findingsPageSchema, findingsSummarySchema } from '../schemas/findings';

export const reviewGoldens: Record<string, z.ZodType> = {
  // What the retired take review and take comparison saved, still listed as plain findings (#2765).
  'findings-list-take-review.json': findingsPageSchema,
  'findings-list-take-comparison.json': findingsPageSchema,
  // Delivery findings as the Review page lists them; evidence checked below.
  'findings-list-delivery-qc.json': findingsPageSchema,
  'findings-list.json': findingsPageSchema,
  'findings-review.json': findingSchema,
  'findings-retype.json': findingSchema,
  'findings-thread.json': findingSchema,
  'findings-summary.json': findingsSummarySchema,
  'findings-go-to.json': findingNavigationSchema,
  'findings-loop.json': findingNavigationSchema,
  'findings-stop-loop.json': findingNavigationSchema,
  'findings-navigation-stale.json': findingNavigationSchema,
  'findings-navigation-recording.json': findingNavigationSchema,
  'findings-navigation-no-item.json': findingNavigationSchema,
  'findings-navigation-not-running.json': findingNavigationSchema,
  'findings-navigation-standalone.json': findingNavigationSchema,
  'findings-add-marker.json': findingMarkerSchema,
  'findings-add-marker-existing.json': findingMarkerSchema,
  'findings-add-marker-stale.json': findingMarkerSchema,
};
