import type { AgentSessionModelCatalogResult } from '../../../shared/agent-session-wire'
import { ANTIGRAVITY_FALLBACK_MODELS } from '../../../shared/agent-session-option-catalog-antigravity'
import { CODEX_UNIVERSAL_FALLBACK_MODELS } from '../../../shared/agent-session-option-catalog-claude-codex'
import {
  buildAutoModelPool,
  type AutoModelCandidate,
  type AutoModelPoolEntry,
  type AutoModelPoolOptions
} from '../../../shared/auto-model-pool'
import type { AgentModelCatalogService } from '../agent-model-catalog/agent-model-catalog-service'
import type { TypeSafeOrchestrationRouter } from '../../typesafe/typesafe-orchestration-router'
import { collapsePreferredAgentAliases } from '../../../shared/tui-agent-selection'
import {
  isFreeOpenCodeModel,
  isOpenCodeDefaultSentinel
} from '../../../shared/universal-chat-model-presentation'

export type AutoModelPoolService = {
  read: (options?: {
    workspacePath?: string | null
    waitForListing?: boolean
    /** Settings needs the complete catalog so a disabled model can be re-enabled. */
    includeDisabled?: boolean
    /** Settings needs catalogs for providers disabled in Auto and Universal Chat. */
    includeDisabledAgents?: boolean
    pool?: AutoModelPoolOptions
  }) => Promise<AutoModelPoolEntry[]>
  /** Selects from an already-built eligible pool, always with a deterministic local fallback. */
  route: (options: {
    prompt: string
    profile: NonNullable<AutoModelPoolOptions['profile']>
    candidates: readonly AutoModelPoolEntry[]
  }) => Promise<AutoModelPoolEntry | null>
}

/** Main-process bridge from Orca's existing per-agent catalog to the provider-neutral Auto pool. */
export function createAutoModelPoolService(args: {
  modelCatalog: Pick<AgentModelCatalogService, 'read'>
  agents: readonly string[]
  getDisabledModelKeys?: () => readonly string[] | undefined
  getDisabledAgents?: () => readonly string[] | undefined
  orchestrationRouter?: TypeSafeOrchestrationRouter
}): AutoModelPoolService {
  return {
    async read(options = {}) {
      const disabledAgents = new Set(
        options.includeDisabledAgents ? [] : (args.getDisabledAgents?.() ?? [])
      )
      const eligibleAgents = collapsePreferredAgentAliases(args.agents).filter(
        (agent) => !disabledAgents.has(agent)
      )
      const results = await Promise.all(
        eligibleAgents.map((agent) =>
          args.modelCatalog.read({
            agent,
            workspacePath: options.workspacePath,
            ...(options.waitForListing ? { waitForListing: true } : {})
          })
        )
      )
      const candidates = results.flatMap((result, index) =>
        candidatesFromCatalog(eligibleAgents[index]!, result)
      )
      const disabledModelKeys = new Set([
        ...(options.includeDisabled ? [] : (args.getDisabledModelKeys?.() ?? [])),
        ...(options.pool?.disabledModelKeys ?? [])
      ])
      return buildAutoModelPool(candidates, {
        ...options.pool,
        ...(disabledModelKeys.size > 0 ? { disabledModelKeys: [...disabledModelKeys] } : {})
      })
    },
    route: async ({ prompt, profile, candidates }) => {
      const routed = args.orchestrationRouter
        ? await args.orchestrationRouter.choose({ prompt, profile, candidates }).catch(() => null)
        : null
      return routed ?? candidates[0] ?? null
    }
  }
}

function candidatesFromCatalog(
  provider: string,
  result: AgentSessionModelCatalogResult
): AutoModelCandidate[] {
  const resultModels = result.origin === 'unknown' ? [] : (result.models ?? [])
  const listed = resultModels
    .filter(
      (model) =>
        !isUnsupportedUniversalModel(provider, model.id) &&
        !isOpenCodeDefaultSentinel(provider, model.id)
    )
    .map((model) => ({
      provider,
      modelId: model.id,
      label: model.label,
      availability: result.unavailable ? ('unavailable' as const) : ('available' as const),
      qualityScore: model.supportsAutoMode === true ? 50 : 0,
      supportsAuto: model.supportsAutoMode === true,
      ...(isFreeOpenCodeModel(provider, model.id) ? { isFree: true } : {})
    }))

  if (result.origin === 'unknown') {
    return fallbackCandidates(provider, result)
  }
  return [
    ...listed,
    ...fallbackCandidates(provider, result, new Set(resultModels.map((m) => m.id)))
  ]
}

/** Codex can report stale/experimental ids that are not valid user-selectable models. */
function isUnsupportedUniversalModel(provider: string, modelId: string): boolean {
  return provider === 'codex' && modelId === 'gpt-6-argon'
}

function fallbackCandidates(
  provider: string,
  result: AgentSessionModelCatalogResult,
  listedIds = new Set<string>()
): AutoModelCandidate[] {
  if (result.unavailable) {
    return []
  }
  const fallbackModels =
    provider === 'antigravity'
      ? ANTIGRAVITY_FALLBACK_MODELS
      : provider === 'codex'
        ? CODEX_UNIVERSAL_FALLBACK_MODELS
        : []
  return fallbackModels
    .filter((model) => !listedIds.has(model.id))
    .map((model) => ({
      provider,
      modelId: model.id,
      label: model.label,
      availability: 'unknown' as const,
      qualityScore: 50,
      supportsAuto: model.supportsAutoMode === true,
      ...(isFreeOpenCodeModel(provider, model.id) ? { isFree: true } : {})
    }))
}
