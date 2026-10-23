// The golden payloads for the Master & QC export flow: which schema owns each file in
// tests/fixtures/contracts/ (see index.ts).
import type { z } from 'zod';
import { exportJobSchema, multiPackageJobSchema, packageFolderResultSchema, packageJobSchema } from '../schemas/renderEncodeMaster';
import { measurePickResultSchema } from '../schemas/measure';

export const renderEncodeMasterGoldens: Record<string, z.ZodType> = {
  'export-pick.json': measurePickResultSchema,
  'export-idle.json': exportJobSchema,
  'export-running.json': exportJobSchema,
  'export-error.json': exportJobSchema,
  'export-cancelled.json': exportJobSchema,
  'package-idle.json': packageJobSchema,
  'package-success.json': packageJobSchema,
  'package-error.json': packageJobSchema,
  'delivery-open-folder.json': packageFolderResultSchema,
  'multi-package-idle.json': multiPackageJobSchema,
  'multi-package-running.json': multiPackageJobSchema,
  'multi-package-success.json': multiPackageJobSchema,
  'multi-package-error.json': multiPackageJobSchema,
};
