import type { AutoModelPoolEntry, AutoModelProfile } from '../../shared/auto-model-pool'

const TYPESAFE_SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone'
const TYPESAFE_MODEL = 'jev-latest'
const DEFAULT_TIMEOUT_MS = 2_500
const MIN_CONFIDENCE = 0.5

type TypeSafeChoiceAnswer = {
  type?: unknown
  choice?: unknown
  confidence?: unknown
}

type TypeSafeSystemOneResponse = {
  answers?: Record<string, TypeSafeChoiceAnswer | undefined>
}

export type TypeSafeOrchestrationRouter = {
  choose: (input: {
    prompt: string
    profile: AutoModelProfile
    candidates: readonly AutoModelPoolEntry[]
  }) => Promise<AutoModelPoolEntry | null>
}

/**
 * Jev is deliberately kept outside the model catalog. It only decides which
 * already-authorized Orca candidate should receive a turn. Any transport,
 * authentication, schema, or confidence failure returns null so the local
 * deterministic Auto ranking remains authoritative.
 */
export function createTypeSafeOrchestrationRouter(args: {
  resolveEnvironment: () => Promise<NodeJS.ProcessEnv>
  fetch?: typeof fetch
  timeoutMs?: number
}): TypeSafeOrchestrationRouter {
  const request = args.fetch ?? fetch
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    async choose({ prompt, profile, candidates }) {
      const environment: NodeJS.ProcessEnv = await args
        .resolveEnvironment()
        .catch(() => ({}) as NodeJS.ProcessEnv)
      const apiKey = environment.TYPESAFE_API_KEY?.trim()
      if (!apiKey || environment.TYPESAFE_AUTO_ROUTING === '0') {
        return null
      }
      if (candidates.length === 0 || candidates.length > 255) {
        return null
      }

      const options = Object.fromEntries(
        candidates.map((candidate, index) => [
          optionKey(index),
          `${candidate.label} (${candidate.provider}/${candidate.modelId})`
        ])
      )
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await request(TYPESAFE_SYSTEM_ONE_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            state: {
              prompt,
              profile,
              candidates: candidates.map((candidate, index) => ({
                key: optionKey(index),
                provider: candidate.provider,
                modelId: candidate.modelId,
                label: candidate.label,
                capabilities: candidate.capabilities ?? []
              }))
            },
            model: TYPESAFE_MODEL,
            questions: {
              model: {
                type: 'choice',
                instructions:
                  'Choose the single best candidate to answer the user request. Prefer capability and reliability for complex work, and speed for short or simple work.',
                criteria: options
              }
            }
          }),
          signal: controller.signal
        })
        if (!response.ok) {
          return null
        }
        const body = (await response.json()) as TypeSafeSystemOneResponse
        const answer = body.answers?.model
        const choice = typeof answer?.choice === 'string' ? answer.choice : null
        const confidence = typeof answer?.confidence === 'number' ? answer.confidence : 0
        if (!choice || confidence < MIN_CONFIDENCE) {
          return null
        }
        const index = parseOptionKey(choice)
        return index === null ? null : (candidates[index] ?? null)
      } catch {
        return null
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}

function optionKey(index: number): string {
  return `candidate_${index}`
}

function parseOptionKey(value: string): number | null {
  const match = /^candidate_(\d+)$/.exec(value)
  if (!match) {
    return null
  }
  const index = Number(match[1])
  return Number.isSafeInteger(index) ? index : null
}
