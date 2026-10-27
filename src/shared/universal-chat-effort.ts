import type { AutoModelPoolEntry } from './auto-model-pool'

const UNIVERSAL_CHAT_EFFORT_VARIANT_PATTERN = /(?:\s*\((low|medium|high)\)|[-_](low|medium|high))$/i

/**
 * Antigravity exposes effort as part of the model id/label. Universal Chat has
 * a separate Effort control, so those transport variants share one picker row.
 */
export function collapseUniversalChatEffortVariants(
  models: readonly AutoModelPoolEntry[]
): AutoModelPoolEntry[] {
  const groups = new Map<string, AutoModelPoolEntry>()
  for (const model of models) {
    if (model.provider !== 'antigravity') {
      groups.set(`${model.provider}:${model.modelId}`, model)
      continue
    }

    const labelMatch = model.label.match(UNIVERSAL_CHAT_EFFORT_VARIANT_PATTERN)
    const idMatch = model.modelId.match(UNIVERSAL_CHAT_EFFORT_VARIANT_PATTERN)
    const variant = (
      labelMatch?.[1] ??
      labelMatch?.[2] ??
      idMatch?.[1] ??
      idMatch?.[2]
    )?.toLowerCase()
    const baseLabel = model.label.replace(UNIVERSAL_CHAT_EFFORT_VARIANT_PATTERN, '').trim()
    const key = `${model.provider}:${baseLabel.toLocaleLowerCase()}`
    const current = groups.get(key)
    if (!current || effortVariantRank(variant) > effortVariantRank(effortVariantOf(current))) {
      groups.set(key, { ...model, label: baseLabel })
    }
  }
  return [...groups.values()]
}

function effortVariantOf(model: AutoModelPoolEntry): string | undefined {
  const labelMatch = model.label.match(UNIVERSAL_CHAT_EFFORT_VARIANT_PATTERN)
  const idMatch = model.modelId.match(UNIVERSAL_CHAT_EFFORT_VARIANT_PATTERN)
  return (labelMatch?.[1] ?? labelMatch?.[2] ?? idMatch?.[1] ?? idMatch?.[2])?.toLowerCase()
}

function effortVariantRank(variant: string | undefined): number {
  return variant === 'high' ? 3 : variant === 'medium' ? 2 : variant === 'low' ? 1 : 0
}
