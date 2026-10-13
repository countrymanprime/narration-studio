import { z } from 'zod';
import type { DawLaunchResult, DawLinkResult, ProjectDefaultLocation, ProjectFolderSelection, ProjectSwitchResult, RecentProject } from '../contracts/project';
import { listFromNull } from './base';

const recentProjectSchema = z.object({ path: z.string(), name: z.string(), lastOpened: z.string() }) satisfies z.ZodType<RecentProject>;
export const recentProjectsSchema = listFromNull(recentProjectSchema);
export const projectFolderSelectionSchema = z.object({ selected: z.boolean(), path: z.string().optional() }) satisfies z.ZodType<ProjectFolderSelection>;
/** `reason` is an empty string when the switch worked. */
export const projectSwitchResultSchema = z.object({ switched: z.boolean(), reason: z.string().optional() }) satisfies z.ZodType<ProjectSwitchResult>;
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
