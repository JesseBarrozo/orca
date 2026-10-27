import type { TuiAgent } from './tui-agent'

/**
 * Harnesses that can back a structured Universal Chat session.
 *
 * This is deliberately separate from the model provider list: a model can be
 * selected from one provider and executed by a different installed harness.
 * The main process still validates the final choice against its runtime
 * registration before creating the session.
 */
export const UNIVERSAL_CHAT_HARNESSES = [
  'pi',
  'codex',
  'claude',
  'grok',
  'gemini',
  'antigravity',
  'opencode',
  'opencode2',
  'omp'
] as const satisfies readonly TuiAgent[]

export type UniversalChatHarness = (typeof UNIVERSAL_CHAT_HARNESSES)[number] | 'auto'

const UNIVERSAL_CHAT_HARNESS_SET = new Set<string>(UNIVERSAL_CHAT_HARNESSES)

export function isUniversalChatHarness(value: unknown): value is UniversalChatHarness {
  return value === 'auto' || (typeof value === 'string' && UNIVERSAL_CHAT_HARNESS_SET.has(value))
}

export function normalizeUniversalChatHarness(value: unknown): UniversalChatHarness {
  return isUniversalChatHarness(value) ? value : 'auto'
}
