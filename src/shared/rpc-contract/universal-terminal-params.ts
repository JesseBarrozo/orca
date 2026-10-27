import { z } from 'zod'
import { AUTO_MODEL_PROFILES } from '../auto-model-pool'

/** Parameters for the IDE-owned provider-neutral Auto model pool read. */
export const UniversalAutoModelPoolParams = z
  .object({
    worktree: z.string().min(1).max(4096).optional(),
    profile: z.enum(AUTO_MODEL_PROFILES).optional(),
    waitForListing: z.boolean().optional(),
    /** Settings reads the full catalog so disabled models remain visible for re-enabling. */
    includeDisabled: z.boolean().optional(),
    /** Settings also needs catalogs for providers disabled in Agent settings. */
    includeDisabledAgents: z.boolean().optional()
  })
  .strict()
