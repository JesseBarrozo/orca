import type { AgentType } from './agent-status-types'
import type { TuiAgent } from './tui-agent'
import { isTuiAgent } from './tui-agent-config'
import { getAgentSessionOptionCatalog } from './agent-session-option-catalog'
import type { CatalogModel } from './agent-session-option-catalog-types'
import { matchNativeChatCatalogModelId } from './native-chat-session-option-state'

/** Stable enough for persisted preferences while keeping the scope explicit. */
export function nativeChatModelKey(agent: AgentType, modelId: string): string {
  return `${agent}:${modelId}`
}

export function isNativeChatModelEnabled(
  disabledModelKeys: readonly string[] | undefined,
  agent: AgentType,
  modelId: string
): boolean {
  if (!disabledModelKeys?.length) {
    return true
  }
  if (disabledModelKeys.includes(nativeChatModelKey(agent, modelId))) {
    return false
  }
  // Some providers report a version/context-qualified id (for example
  // `fable[1m]`) while settings persist the stable catalog id (`fable`).
  // Apply the same catalog matching used by the native picker so a disabled
  // model cannot reappear in Auto after discovery refreshes.
  const catalog = getAgentSessionOptionCatalog(agent)
  const stableModelId = catalog ? matchNativeChatCatalogModelId(catalog, modelId) : null
  return stableModelId === null
    ? true
    : !disabledModelKeys.includes(nativeChatModelKey(agent, stableModelId))
}

export function setNativeChatModelEnabled(
  disabledModelKeys: readonly string[] | undefined,
  agent: AgentType,
  modelId: string,
  enabled: boolean
): string[] {
  const key = nativeChatModelKey(agent, modelId)
  const next = new Set(disabledModelKeys ?? [])
  if (enabled) {
    next.delete(key)
  } else {
    next.add(key)
  }
  return [...next].sort()
}

export function filterEnabledNativeChatModels(
  models: readonly CatalogModel[],
  disabledModelKeys: readonly string[] | undefined,
  agent: AgentType
): CatalogModel[] {
  return models.filter((model) => isNativeChatModelEnabled(disabledModelKeys, agent, model.id))
}

/** Provider-level availability is scoped to Auto and Universal Chat, not installed agents. */
export function normalizeDisabledNativeChatProviders(value: unknown): TuiAgent[] {
  if (!Array.isArray(value)) {
    return []
  }
  return [...new Set(value.filter((agent): agent is TuiAgent => isTuiAgent(agent)))]
}

export function isNativeChatProviderEnabled(
  disabledProviders: readonly TuiAgent[] | undefined,
  agent: TuiAgent
): boolean {
  return !normalizeDisabledNativeChatProviders(disabledProviders).includes(agent)
}

export function setNativeChatProviderEnabled(
  disabledProviders: readonly TuiAgent[] | undefined,
  agent: TuiAgent,
  enabled: boolean
): TuiAgent[] {
  const next = new Set(normalizeDisabledNativeChatProviders(disabledProviders))
  if (enabled) {
    next.delete(agent)
  } else {
    next.add(agent)
  }
  return [...next].sort()
}
