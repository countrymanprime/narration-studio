import { z } from 'zod';
import type {
  DawLaunchResult,
  DawLinkResult,
  ProjectDefaultLocation,
  ProjectFolderSelection,
  ProjectSwitchResult,
  RecentProject,
  RunningDawProject,
} from '../contracts/project';
import { listFromNull } from './base';

const recentProjectSchema = z.object({ path: z.string(), name: z.string(), lastOpened: z.string(), pinned: z.boolean() }) satisfies z.ZodType<RecentProject>;
export const recentProjectsSchema = listFromNull(recentProjectSchema);
export const runningDawProjectSchema = z.object({ linked: z.boolean(), path: z.string(), name: z.string() }) satisfies z.ZodType<RunningDawProject>;
export const projectFolderSelectionSchema = z.object({ selected: z.boolean(), path: z.string().optional() }) satisfies z.ZodType<ProjectFolderSelection>;
/** `reason` is an empty string when the switch worked. */
export const projectSwitchResultSchema = z.object({ switched: z.boolean(), reason: z.string().optional() }) satisfies z.ZodType<ProjectSwitchResult>;
/** tests/fixtures/contracts/project-name-cases.json: what project.ValidateName answers for each name; `message` is empty when the name is valid. Not a binding result: it pins `projectName.ts` to the host's rule. */
export const projectNameCasesSchema = z.array(z.object({ name: z.string(), value: z.string(), valid: z.boolean(), message: z.string() }));
export const projectDefaultLocationSchema = z.object({ path: z.string() }) satisfies z.ZodType<ProjectDefaultLocation>;
export const dawLinkResultSchema = z.object({
  selected: z.boolean(),
  linked: z.boolean().default(false),
  path: z.string().optional(),
  insideProject: z.boolean().optional(),
  note: z.string().optional(),
  message: z.string().optional(),
}) satisfies z.ZodType<DawLinkResult>;
export const dawLaunchResultSchema = z.object({
  launched: z.boolean(),
  path: z.string(),
  source: z.string(),
}) satisfies z.ZodType<DawLaunchResult>;
