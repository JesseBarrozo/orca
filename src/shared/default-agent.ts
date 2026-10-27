import type { TuiAgent } from './tui-agent'

/** Agents that can be selected as Orca's default launcher. Universal Chat is a
 * provider-neutral surface, so it is intentionally not part of the terminal
 * agent inventory. */
export type DefaultAgent = TuiAgent | 'universal' | 'blank' | null

export const UNIVERSAL_CHAT_AGENT = 'universal' as const
