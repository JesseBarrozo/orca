import type { TuiAgent } from './tui-agent'

/**
 * Harnesses that can execute an Omni session.
 *
 * This is deliberately separate from the model provider list: a model can be
 * selected from one provider and executed by a different installed harness.
 * The main process still validates the final choice against its runtime
 * registration before creating the session.
 */
export const UNIVERSAL_CHAT_HARNESSES = [
  'codex',
  'claude',
  'grok',
  'gemini',
  'antigravity',
  'opencode',
  'opencode2',
  'omp'
] as const satisfies readonly TuiAgent[]

/** Omni is the product harness. Pi is an internal RPC engine and is intentionally absent here. */
export const OMNI_HARNESS_ID = 'omni' as const
export const OMNI_INTERNAL_ENGINE = 'pi' as const

export type UniversalChatHarness = (typeof UNIVERSAL_CHAT_HARNESSES)[number] | 'auto'

const UNIVERSAL_CHAT_HARNESS_SET = new Set<string>(UNIVERSAL_CHAT_HARNESSES)

export function isUniversalChatHarness(value: unknown): value is UniversalChatHarness {
  return value === 'auto' || (typeof value === 'string' && UNIVERSAL_CHAT_HARNESS_SET.has(value))
}

export function normalizeUniversalChatHarness(value: unknown): UniversalChatHarness {
  return isUniversalChatHarness(value) ? value : 'auto'
}
