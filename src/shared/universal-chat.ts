import type { AutoModelPoolEntry, AutoModelProfile } from './auto-model-pool'
import type { UniversalChatHarness } from './universal-chat-harness'

export type UniversalChatSelection =
  | { mode: 'auto'; harness?: UniversalChatHarness; effort?: string; fastMode?: boolean }
  | {
      mode: 'model'
      provider: string
      modelId: string
      harness?: UniversalChatHarness
      effort?: string
      fastMode?: boolean
    }

export type UniversalChatTurn = {
  id: string
  role: 'user' | 'assistant'
  text: string
  provider?: string
  modelId?: string
  status: 'pending' | 'complete' | 'error'
  error?: string
}

export type UniversalChatSnapshot = {
  sessionId: string
  /** The provider session currently rendered by Orca's native chat surface. */
  providerSessionId: string | null
  worktree: string
  profile: AutoModelProfile
  selection: UniversalChatSelection
  models: AutoModelPoolEntry[]
  turns: UniversalChatTurn[]
  harnesses: UniversalChatHarness[]
  activeModel: {
    provider: string
    modelId: string
    label: string
    harness: UniversalChatHarness
  } | null
}
