import { isNativeChatModelEnabled } from './native-chat-model-availability'

export const AUTO_MODEL_PROFILES = [
  'fast',
  'cheap',
  'coding',
  'reasoning',
  'balanced',
  'intelligence',
  'reliable',
  'offline'
] as const

export type AutoModelProfile = (typeof AUTO_MODEL_PROFILES)[number]
export type AutoModelAvailability = 'available' | 'unknown' | 'unavailable'

/** Provider-neutral candidate. Credentials and tokens never belong in this type. */
export type AutoModelCandidate = {
  provider: string
  accountId?: string
  modelId: string
  label: string
  capabilities?: readonly string[]
  availability?: AutoModelAvailability
  latencyMs?: number
  inputCost?: number
  outputCost?: number
  contextWindowTokens?: number
  qualityScore?: number
  reliabilityScore?: number
  supportsAuto?: boolean
  /** The provider catalog marks this model as free of API usage charges. */
  isFree?: boolean
}

export type AutoModelPoolOptions = {
  disabledModelKeys?: readonly string[]
  profile?: AutoModelProfile
  requireAutoCompatible?: boolean
}

export type AutoModelPoolEntry = AutoModelCandidate & {
  score: number
}

function availabilityScore(availability: AutoModelAvailability | undefined): number {
  if (availability === 'available') {
    return 100
  }
  if (availability === 'unknown') {
    return 20
  }
  return -1000
}

function profileScore(candidate: AutoModelCandidate, profile: AutoModelProfile): number {
  const latency = candidate.latencyMs ?? 10_000
  const cost = (candidate.inputCost ?? 0) + (candidate.outputCost ?? 0)
  switch (profile) {
    case 'fast':
      return Math.max(0, 100 - latency / 100)
    case 'cheap':
      return Math.max(0, 100 - cost * 1000)
    case 'intelligence':
      return (candidate.qualityScore ?? 0) + (candidate.contextWindowTokens ?? 0) / 100_000
    case 'coding':
      return candidate.capabilities?.includes('coding')
        ? 100 + (candidate.qualityScore ?? 0)
        : (candidate.qualityScore ?? 0)
    case 'reasoning':
      return (candidate.qualityScore ?? 0) * 1.2 + (candidate.contextWindowTokens ?? 0) / 100_000
    case 'reliable':
      return candidate.reliabilityScore ?? 0
    case 'offline':
      return candidate.capabilities?.includes('offline') ? 100 : -100
    case 'balanced':
      return (
        (candidate.qualityScore ?? 0) * 0.45 +
        (candidate.reliabilityScore ?? 0) * 0.35 +
        Math.max(0, 100 - latency / 100) * 0.2
      )
  }
}

/** Build the eligible Auto pool; disabled models never reach scoring or fallback. */
export function buildAutoModelPool(
  candidates: readonly AutoModelCandidate[],
  options: AutoModelPoolOptions = {}
): AutoModelPoolEntry[] {
  const profile = options.profile ?? 'balanced'
  return candidates
    .filter((candidate) =>
      isNativeChatModelEnabled(options.disabledModelKeys, candidate.provider, candidate.modelId)
    )
    .filter(
      (candidate) => options.requireAutoCompatible !== true || candidate.supportsAuto === true
    )
    .filter((candidate) => candidate.availability !== 'unavailable')
    .map((candidate) => ({
      ...candidate,
      score: availabilityScore(candidate.availability) + profileScore(candidate, profile)
    }))
    .sort((left, right) => {
      const score = right.score - left.score
      if (score !== 0) {
        return score
      }
      return `${left.provider}:${left.modelId}`.localeCompare(`${right.provider}:${right.modelId}`)
    })
}

export function selectAutoModelCandidate(
  candidates: readonly AutoModelCandidate[],
  options: AutoModelPoolOptions = {}
): AutoModelPoolEntry | null {
  return buildAutoModelPool(candidates, options)[0] ?? null
}
