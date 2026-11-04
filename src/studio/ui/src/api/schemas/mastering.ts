import { z } from 'zod';
import type { MasteringProvider, MasteringProviders, MasteringStep } from '../contracts/mastering';
import { listFromNull, optionalFromNull } from './base';
import { dawCapabilitySupportSchema } from './daw';

const masteringStepSchema = z.object({ name: z.string(), detail: z.string() }) satisfies z.ZodType<MasteringStep>;

const masteringProviderSchema = z.object({
  name: z.string(),
  label: z.string(),
  default: z.boolean(),
  modes: listFromNull(z.string()),
  needsApproval: z.boolean(),
  needsMacro: z.boolean(),
  needs: listFromNull(z.string()),
  support: dawCapabilitySupportSchema,
  chain: listFromNull(masteringStepSchema),
}) satisfies z.ZodType<MasteringProvider>;

/** tests/fixtures/contracts/macro-names.json: the host's verdict on macro names (macroName.ts is tested against it). */
export const macroNameVerdictsSchema = z.object({ names: z.array(z.object({ name: z.string(), ok: z.boolean() })) });

/** chain-names.json: how the host cleans a DAW track's and plug-in's name (internal/masteringport/chain.go), for the mock to match. */
export const chainNamesSchema = z.object({ cases: z.array(z.object({ raw: z.string(), track: z.string(), fx: z.string() })) });

export const masteringProvidersSchema = z.object({
  hasProject: z.boolean(),
  choice: z.string().nullable(),
  effective: z.string(),
  providers: z.array(masteringProviderSchema),
  notice: optionalFromNull(z.string()),
}) satisfies z.ZodType<MasteringProviders>;
