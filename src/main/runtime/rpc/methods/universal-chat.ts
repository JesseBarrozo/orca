import { defineMethod } from '../core'
import {
  UniversalChatCreateParams,
  UniversalChatSelectParams,
  UniversalChatSendParams,
  UniversalChatSessionParams
} from '../../../../shared/rpc-contract/universal-chat-params'
import type { UniversalChatSnapshot } from '../../../../shared/universal-chat'
import {
  closeUniversalChat,
  createUniversalChat,
  readUniversalChat,
  selectUniversalChat,
  sendUniversalChat
} from '../../universal-chat-service'
import { requireStructuredCapability } from './structured-agent-session-gate'

export const UNIVERSAL_CHAT_METHODS = [
  defineMethod({
    name: 'omni.create',
    permission: 'workspace',
    params: UniversalChatCreateParams,
    handler: async (params, ctx) => {
      requireStructuredCapability(ctx)
      const sessionId = await createUniversalChat(ctx, params.worktree, params.profile)
      return readUniversalChat(ctx, sessionId)
    }
  }),
  defineMethod({
    name: 'omni.history',
    permission: 'workspace',
    params: UniversalChatSessionParams,
    handler: async (params, ctx): Promise<UniversalChatSnapshot> => {
      requireStructuredCapability(ctx)
      return readUniversalChat(ctx, params.sessionId)
    }
  }),
  defineMethod({
    name: 'omni.select',
    permission: 'workspace',
    params: UniversalChatSelectParams,
    handler: async (params, ctx) => {
      requireStructuredCapability(ctx)
      await selectUniversalChat(ctx, params.sessionId, params.selection)
      return readUniversalChat(ctx, params.sessionId)
    }
  }),
  defineMethod({
    name: 'omni.send',
    permission: 'workspace',
    params: UniversalChatSendParams,
    handler: async (params, ctx) => {
      requireStructuredCapability(ctx)
      return sendUniversalChat(ctx, params.sessionId, params.text, params.selection)
    }
  }),
  defineMethod({
    name: 'omni.close',
    permission: 'workspace',
    params: UniversalChatSessionParams,
    handler: async (params, ctx) => {
      requireStructuredCapability(ctx)
      await closeUniversalChat(params.sessionId)
      return { ok: true as const }
    }
  })
]
