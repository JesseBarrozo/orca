import { z } from 'zod'
import { AUTO_MODEL_PROFILES } from '../auto-model-pool'
import { isUniversalChatHarness } from '../universal-chat-harness'

const SessionId = z.string().min(1).max(512)
const Harness = z.string().refine(isUniversalChatHarness, { message: 'Unknown Omni harness' })
const Selection = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto'), harness: Harness.optional() }).strict(),
  z
    .object({
      mode: z.literal('model'),
      provider: z.string().min(1).max(128),
      modelId: z.string().min(1).max(512),
      harness: Harness.optional()
    })
    .strict()
])

export const UniversalChatCreateParams = z
  .object({
    worktree: z.string().min(1).max(4096),
    profile: z.enum(AUTO_MODEL_PROFILES).optional()
  })
  .strict()

export const UniversalChatSessionParams = z.object({ sessionId: SessionId }).strict()

export const UniversalChatSendParams = z
  .object({
    sessionId: SessionId,
    text: z.string().min(1).max(262144),
    selection: Selection.optional()
  })
  .strict()

export const UniversalChatSelectParams = z
  .object({ sessionId: SessionId, selection: Selection })
  .strict()
