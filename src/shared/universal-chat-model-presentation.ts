/**
 * Presentation helpers for models surfaced by Auto and Omni.
 *
 * Provider/model ids are transport values and must not leak into the UI as
 * display names. The underlying provider segment remains useful as the row
 * subtitle, especially for OpenCode's multi-provider catalog.
 */

export type UniversalChatModelPresentationInput = {
  provider: string
  modelId: string
  label: string
}

const OPEN_CODE_AGENTS = new Set(['opencode', 'opencode2'])
const BROKER_DISPLAY_NAMES: Record<string, string> = {
  opencode: 'OpenCode',
  opencode2: 'OpenCode',
  openrouter: 'OpenRouter',
  typesafe: 'TypeSafe'
}
const MODEL_PROVIDER_SEGMENTS = new Set([
  'anthropic',
  'deepseek',
  'google',
  'meta',
  'mistral',
  'moonshotai',
  'nvidia',
  'openai',
  'qwen',
  'xai'
])

/** OpenCode-hosted models explicitly published as free, plus its legacy free model. */
export const OPENCODE_FREE_MODEL_IDS = [
  'opencode/beam-free',
  'opencode/big-pickle',
  'opencode/deepseek-v4.1-flash-free',
  'opencode/flint-40b-free',
  'opencode/glm-5.3-flash-free',
  'opencode/mimo-v2.6-flash-free',
  'opencode/nemotron-3-ultra-free',
  'opencode/nemotron-3.5-lightning-free',
  'opencode/nemotron-3.5-super-vl-free'
] as const

const OPENCODE_FREE_MODEL_SET = new Set<string>(OPENCODE_FREE_MODEL_IDS)

export function isOpenCodeAgent(provider: string): boolean {
  return OPEN_CODE_AGENTS.has(provider)
}

export function isOpenCodeDefaultSentinel(provider: string, modelId: string): boolean {
  if (!isOpenCodeAgent(provider)) {
    return false
  }
  const normalizedId = modelId.trim().toLowerCase()
  return normalizedId === 'default' || normalizedId === 'opencode/default'
}

export function isFreeOpenCodeModel(provider: string, modelId: string): boolean {
  if (!isOpenCodeAgent(provider)) {
    return false
  }
  const normalizedId = modelId.trim().toLowerCase()
  return normalizedId.endsWith('-free') || OPENCODE_FREE_MODEL_SET.has(normalizedId)
}

/** OpenCode and OpenCode 2 are aliases for the same installed model catalog. */
export function collapseUniversalChatProviderAliases<
  T extends { provider: string; modelId: string }
>(models: readonly T[]): T[] {
  const groups = new Map<string, T>()
  for (const model of models) {
    const key = isOpenCodeAgent(model.provider)
      ? `opencode:${model.modelId.toLowerCase()}`
      : `${model.provider}:${model.modelId}`
    const current = groups.get(key)
    if (!current || (model.provider === 'opencode2' && current.provider !== 'opencode2')) {
      groups.set(key, model)
    }
  }
  return [...groups.values()]
}

function providerSegment(modelId: string): string | undefined {
  const slash = modelId.indexOf('/')
  return slash > 0 ? modelId.slice(0, slash).toLowerCase() : undefined
}

function modelSegment(modelId: string): string {
  const slash = modelId.lastIndexOf('/')
  return slash !== -1 ? modelId.slice(slash + 1) : modelId
}

function titleCaseModelSegment(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\bfree$/i, '')
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (/^gpt$/i.test(part)) {
        return 'GPT'
      }
      if (/^glm$/i.test(part)) {
        return 'GLM'
      }
      if (/^v\d/i.test(part)) {
        return part.toUpperCase()
      }
      return part ? part.charAt(0).toUpperCase() + part.slice(1) : part
    })
    .join(' ')
}

function removeTransportPrefix(label: string, modelId: string): string {
  const trimmed = label.trim()
  const idProvider = providerSegment(modelId)
  const idModel = modelSegment(modelId)

  if (trimmed.includes('/')) {
    return trimmed.slice(trimmed.lastIndexOf('/') + 1).trim()
  }
  if (idProvider && trimmed.toLowerCase().startsWith(`${idProvider}/`)) {
    return trimmed.slice(idProvider.length + 1).trim()
  }
  if (trimmed.toLowerCase() === modelId.toLowerCase()) {
    return idModel
  }
  // Older OpenCode fallback rows used "OpenCode <model>" as their label.
  if (/^opencode\s+/i.test(trimmed)) {
    return trimmed.replace(/^opencode\s+/i, '').trim()
  }
  return trimmed
}

export function universalChatModelLabel(
  model: Pick<UniversalChatModelPresentationInput, 'modelId' | 'label'>
): string {
  const withoutPrefix = removeTransportPrefix(model.label, model.modelId)
  const freeSuffix = withoutPrefix.replace(/\s*[-_]free$/i, '').trim()
  // Raw ids are machine names; humanize them only when discovery did not
  // provide a proper display label.
  if (
    freeSuffix === modelSegment(model.modelId) ||
    /^[a-z0-9]+(?:[-_][a-z0-9.]+)+$/i.test(freeSuffix)
  ) {
    return titleCaseModelSegment(freeSuffix)
  }
  return freeSuffix
}

function providerDisplayName(provider: string): string {
  const names: Record<string, string> = {
    anthropic: 'Anthropic',
    google: 'Google',
    openai: 'OpenAI',
    opencode: 'OpenCode',
    xai: 'xAI'
  }
  return names[provider] ?? titleCaseModelSegment(provider)
}

function brokerDisplayName(provider: string): string | undefined {
  return BROKER_DISPLAY_NAMES[provider.toLowerCase()]
}

export function universalChatModelProviderLabel(
  model: UniversalChatModelPresentationInput
): string {
  const segments = model.modelId
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean)
  const segment = segments[0]
  const broker =
    brokerDisplayName(model.provider) ?? (segment ? brokerDisplayName(segment) : undefined)
  if (broker) {
    const modelProvider = (segment && brokerDisplayName(segment) ? segments[1] : segment) ?? ''
    const vendor =
      modelProvider === 'gpt' || modelProvider.startsWith('gpt-')
        ? 'OpenAI'
        : MODEL_PROVIDER_SEGMENTS.has(modelProvider)
          ? providerDisplayName(modelProvider)
          : undefined
    return vendor && vendor !== broker ? `${vendor} by ${broker}` : broker
  }
  // The temporary OpenCode fallback was named opencode/gpt-5.4-mini, but its
  // model vendor is OpenAI. Keep that row compatible while displaying the
  // correct vendor to the user.
  if (segment === 'opencode' && /^gpt(?:[-_]|$)/i.test(modelSegment(model.modelId))) {
    return 'OpenAI'
  }
  return providerDisplayName(segment ?? model.provider)
}
